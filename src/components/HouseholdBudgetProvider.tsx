//src/components/HouseholdBudgetProvider.tsx
// Enhanced version with monthly budget periods while preserving existing API

"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import {
  type BudgetCategory,
  type Transaction,
  type SavingsGoal,
} from "@/components/HomeBudgetExtensions";
import { useHouseholdId } from "@/hooks/useHousehold";

// New monthly period interface
interface BudgetPeriod {
  month: string; // "2024-12"
  categories: Record<string, {
    budgeted: number;
    spent: number;
  }>;
  goals: Record<string, {
    target: number;
    contributed: number;
  }>;
}

// Enhanced BudgetCategory with historical data
interface EnhancedBudgetCategory extends BudgetCategory {
  previousMonths?: Array<{
    month: string;
    budgeted: number;
    spent: number;
    variance: number;
  }>;
}

// Enhanced context interface (backward compatible)
interface EnhancedBudgetContext {
  // Existing API (unchanged)
  categories: EnhancedBudgetCategory[];
  transactions: Transaction[];
  goals: SavingsGoal[];

  createCategory(category: Omit<BudgetCategory, "id" | "spent">): Promise<string>;
  updateCategory(id: string, updates: Partial<BudgetCategory>): Promise<void>;
  deleteCategory(id: string): Promise<void>;

  addTransaction(transaction: Omit<Transaction, "id">): Promise<string>;
  updateTransaction(id: string, updates: Partial<Transaction>): Promise<void>;
  deleteTransaction(id: string): Promise<void>;

  createGoal(goal: Omit<SavingsGoal, "id">): Promise<string>;
  updateGoal(id: string, updates: Partial<SavingsGoal>): Promise<void>;
  deleteGoal(id: string): Promise<void>;

  setDerivedSpentLocal(next: Record<string, number>): void; // Fixed: should return void, not Promise<void>

  // New monthly period functionality
  currentMonth: string;
  budgetPeriods: Record<string, BudgetPeriod>;
  startNewMonth: () => Promise<void>;
  getCurrentMonthBudget: (categoryId: string) => number;
  getCurrentMonthSpent: (categoryId: string) => number;
  getMonthData: (month: string) => BudgetPeriod | undefined;
  
  // For backward compatibility - these might be used in existing components
  householdId?: string | null;
}

const BudgetContext = createContext<EnhancedBudgetContext | null>(null);

export const useEnhancedBudget = () => {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useEnhancedBudget must be used within HouseholdBudgetProvider");
  return ctx;
};

export type { BudgetCategory, Transaction, SavingsGoal } from "@/components/HomeBudgetExtensions";

// Helpers
const toGBP = (n: any) => (typeof n === "number" && isFinite(n) ? n : 0);
const cleanUpdate = <T extends object>(obj: Partial<T>) => {
  const out: any = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined) return;
    if (typeof v === "number" && Number.isNaN(v)) return;
    out[k] = v;
  });
  return out as Partial<T>;
};

// Retry listener utility
const createRetryListener = (
  setupListener: (errorCallback: (error: any) => void) => () => void,
  maxRetries: number = 3,
  retryDelay: number = 2000
) => {
  let currentUnsubscribe: (() => void) | null = null;
  let retryCount = 0;
  let retryTimeout: NodeJS.Timeout | null = null;

  const attemptConnection = () => {
    try {
      currentUnsubscribe = setupListener((error) => {
        console.error('Listener error:', error);
        
        if (error?.code === 'permission-denied' && retryCount < maxRetries) {
          retryCount++;
          console.log(`Retrying listener in ${retryDelay}ms (attempt ${retryCount}/${maxRetries})`);
          
          if (currentUnsubscribe) {
            currentUnsubscribe();
            currentUnsubscribe = null;
          }
          
          retryTimeout = setTimeout(() => {
            attemptConnection();
          }, retryDelay);
        }
      });
      
      // Reset retry count on successful connection
      retryCount = 0;
    } catch (error) {
      console.error('Failed to setup listener:', error);
    }
  };

  // Start the connection attempt
  attemptConnection();

  // Return cleanup function
  return () => {
    if (retryTimeout) {
      clearTimeout(retryTimeout);
    }
    if (currentUnsubscribe) {
      currentUnsubscribe();
    }
  };
};

type ProviderProps = {
  householdId?: string;
  children: React.ReactNode;
};

export function HouseholdBudgetProvider({ householdId: hidProp, children }: ProviderProps) {
  const hookHid = useHouseholdId?.();
  const hid = hidProp ?? hookHid;

  // Track authentication state stability
  const [authStable, setAuthStable] = useState(false);
  const authTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Wait for stable authentication before starting listeners
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      // Clear any existing timeout
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
      }
      
      if (user) {
        // Wait longer for server-side auth to stabilize
        authTimeoutRef.current = setTimeout(() => setAuthStable(true), 2500);
      } else {
        setAuthStable(false);
      }
    });

    return () => {
      unsubscribe();
      if (authTimeoutRef.current) {
        clearTimeout(authTimeoutRef.current);
      }
    };
  }, []);

  // Existing state
  const [rawCategories, setRawCategories] = useState<(Omit<BudgetCategory, "spent"> & { id: string })[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);
  const [derivedSpentLocal, setDerivedSpentLocalState] = useState<Record<string, number>>({});

  // New monthly period state
  const [currentMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [budgetPeriods, setBudgetPeriods] = useState<Record<string, BudgetPeriod>>({});

  // Initialize current month if it doesn't exist
  const initializeCurrentMonth = useCallback(async () => {
    if (!hid || budgetPeriods[currentMonth] || rawCategories.length === 0) return;

    console.log('Initializing current month:', {
      householdId: hid,
      currentMonth,
      categoriesCount: rawCategories.length,
      goalsCount: goals.length
    });

    const newPeriod: BudgetPeriod = {
      month: currentMonth,
      categories: {},
      goals: {}
    };

    // Copy budget amounts from category templates
    rawCategories.forEach(cat => {
      newPeriod.categories[cat.id] = {
        budgeted: cat.monthlyBudget,
        spent: derivedSpentLocal[cat.id] || 0
      };
    });

    goals.forEach(goal => {
      newPeriod.goals[goal.id] = {
        target: goal.target || 0,
        contributed: goal.current || 0
      };
    });

    try {
      const docData = {
        ...newPeriod,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };
      
      console.log('Attempting to create budget period:', docData);
      
      await setDoc(
        doc(db, "households", hid, "budgetPeriods", currentMonth),
        docData,
        { merge: true } // Use merge to avoid conflicts
      );
      
      console.log('Successfully created budget period');
    } catch (error: any) {
      console.error('Error initializing current month:', error);
      console.error('Document path:', `households/${hid}/budgetPeriods/${currentMonth}`);
    }
  }, [hid, currentMonth, rawCategories, goals, budgetPeriods, derivedSpentLocal]);

  // Enhanced setDerivedSpentLocal - safe Firebase updates with validation
  const setDerivedSpentLocal = useCallback((next: Record<string, number>) => {
    console.log('setDerivedSpentLocal called with:', next);
    console.log('Current state:', { hid, currentMonth, budgetPeriodsCount: Object.keys(budgetPeriods).length });
    
    // Always update local state immediately for UI responsiveness
    setDerivedSpentLocalState(next);
    
    // Skip Firebase update if household or budget period isn't ready
    if (!hid) {
      console.log('❌ Skipping Firebase sync: No household ID');
      return;
    }
    
    if (!currentMonth || !budgetPeriods[currentMonth]) {
      console.log('❌ Skipping Firebase sync: Budget period not initialized', { 
        currentMonth, 
        hasPeriod: !!budgetPeriods[currentMonth] 
      });
      return;
    }
    
    // Validate we have valid updates to make
    const validUpdates: Record<string, any> = {};
    Object.entries(next).forEach(([categoryId, spent]) => {
      // Only update if the category exists in the current month's budget
      if (budgetPeriods[currentMonth]?.categories?.[categoryId]) {
        validUpdates[`categories.${categoryId}.spent`] = spent;
      } else {
        console.log(`⚠️ Skipping category ${categoryId}: not found in budget period`);
      }
    });
    
    // Skip Firebase update if no valid updates
    if (Object.keys(validUpdates).length === 0) {
      console.log('❌ No valid category updates to sync to Firebase');
      return;
    }
    
    console.log('✅ Syncing to Firebase:', validUpdates);
    
    // Update current month's budget period in Firebase
    updateDoc(
      doc(db, "households", hid, "budgetPeriods", currentMonth),
      validUpdates
    ).catch(error => {
      console.error('❌ Budget period update failed:', error);
      // Don't throw - let local state remain updated for better UX
    });
  }, [hid, budgetPeriods, currentMonth]);

  // Helper function to ensure budget period exists before BudgetBridge runs
  const ensureBudgetPeriodExists = useCallback(async () => {
    if (!hid || !currentMonth || budgetPeriods[currentMonth]) {
      return; // Already exists or can't create
    }
    
    console.log('🔄 Creating missing budget period for', currentMonth);
    
    try {
      await initializeCurrentMonth();
      console.log('✅ Budget period created successfully');
    } catch (error) {
      console.error('❌ Failed to create budget period:', error);
    }
  }, [hid, currentMonth, budgetPeriods, initializeCurrentMonth]);

  // Call this before BudgetBridge starts
  useEffect(() => {
    ensureBudgetPeriodExists();
  }, [ensureBudgetPeriodExists]);

  // Monthly budget management functions
  const getCurrentMonthBudget = useCallback((categoryId: string) => {
    const period = budgetPeriods[currentMonth];
    return period?.categories[categoryId]?.budgeted ?? 0;
  }, [budgetPeriods, currentMonth]);

  const getCurrentMonthSpent = useCallback((categoryId: string) => {
    // Prefer derived local data (from SubScan) over stored data
    const localSpent = derivedSpentLocal[categoryId];
    if (localSpent !== undefined) return toGBP(localSpent);
    
    const period = budgetPeriods[currentMonth];
    return period?.categories[categoryId]?.spent ?? 0;
  }, [budgetPeriods, currentMonth, derivedSpentLocal]);

  const getMonthData = useCallback((month: string) => {
    return budgetPeriods[month];
  }, [budgetPeriods]);

  // Start new month function
  const startNewMonth = useCallback(async () => {
    const now = new Date();
    const newMonth = now.toISOString().slice(0, 7);
    
    if (newMonth === currentMonth || !hid) return;

    const newPeriod: BudgetPeriod = {
      month: newMonth,
      categories: {},
      goals: {}
    };
    
    // Copy budget amounts from category templates
    rawCategories.forEach(cat => {
      newPeriod.categories[cat.id] = {
        budgeted: cat.monthlyBudget,
        spent: 0
      };
    });
    
    goals.forEach(goal => {
      newPeriod.goals[goal.id] = {
        target: goal.target || 0,
        contributed: 0
      };
    });
    
    try {
      await setDoc(
        doc(db, "households", hid, "budgetPeriods", newMonth),
        {
          ...newPeriod,
          createdAt: serverTimestamp(), // Add required field for rules
          updatedAt: serverTimestamp()
        }
      );
    } catch (error) {
      console.error('Error creating new month:', error);
    }
  }, [currentMonth, rawCategories, goals, hid]);

  // MODIFIED: Use retry listeners with extended delay
  useEffect(() => {
    if (!hid || !authStable) {
      console.log('Waiting for stable auth and household ID:', { hid: !!hid, authStable });
      return;
    }

    console.log('Starting Firebase listeners with retry logic');

    // Categories listener with retry
    const cleanupCategories = createRetryListener((errorCallback) => {
      const catsRef = collection(db, "households", hid, "categories");
      return onSnapshot(catsRef, (snap) => {
        const rows: (Omit<BudgetCategory, "spent"> & { id: string })[] = [];
        snap.forEach((d) => {
          const data = d.data() as any;
          rows.push({
            id: d.id,
            name: data.name || "Category",
            emoji: data.emoji || "💰",
            color: data.color || "#6366f1",
            type: data.type || "essential",
            monthlyBudget: toGBP(data.monthlyBudget),
            description: data.description || "",
          });
        });
        setRawCategories(rows);
      }, errorCallback);
    }, 3, 3000);

    // Transactions listener with retry
    const cleanupTransactions = createRetryListener((errorCallback) => {
      const txRef = collection(db, "households", hid, "transactions");
      return onSnapshot(txRef, (snap) => {
        const rows: Transaction[] = [];
        snap.forEach((d) => {
          const x = d.data() as any;
          rows.push({
            id: d.id,
            title: x.title || "Transaction",
            amount: toGBP(x.amount),
            categoryId: x.categoryId || "",
            date: x.date || new Date().toISOString().slice(0, 10),
            type: x.type || "expense",
            recurring: x.recurring || "none",
            notes: x.notes,
            tags: x.tags,
            receipts: x.receipts,
          });
        });
        setTransactions(rows);
      }, errorCallback);
    }, 3, 3000);

    // Goals listener with retry
    const cleanupGoals = createRetryListener((errorCallback) => {
      const goalsRef = collection(db, "households", hid, "goals");
      return onSnapshot(goalsRef, (snap) => {
        const rows: SavingsGoal[] = [];
        snap.forEach((d) => {
          const x = d.data() as any;
          rows.push({
            id: d.id,
            name: x.name || "Goal",
            target: toGBP(x.target),
            current: toGBP(x.current),
            deadline: x.deadline || new Date().toISOString().slice(0, 10),
            emoji: x.emoji || "🏁",
            color: x.color || "#10b981",
          });
        });
        setGoals(rows);
      }, errorCallback);
    }, 3, 3000);

    // Budget periods listener with retry
    const cleanupPeriods = createRetryListener((errorCallback) => {
      const periodsRef = collection(db, "households", hid, "budgetPeriods");
      return onSnapshot(periodsRef, (snap) => {
        const periods: Record<string, BudgetPeriod> = {};
        snap.forEach((doc) => {
          periods[doc.id] = doc.data() as BudgetPeriod;
        });
        setBudgetPeriods(periods);
      }, errorCallback);
    }, 3, 3000);

    return () => {
      cleanupCategories();
      cleanupTransactions();
      cleanupGoals();
      cleanupPeriods();
    };
  }, [hid, authStable]);

  // Initialize current month when categories are loaded
  useEffect(() => {
    if (rawCategories.length > 0) {
      initializeCurrentMonth();
    }
  }, [rawCategories, initializeCurrentMonth]);

  // Enhanced categories with historical data
  const categories: EnhancedBudgetCategory[] = useMemo(() => {
    return rawCategories.map((c) => {
      const currentSpent = getCurrentMonthSpent(c.id);
      
      // Build historical data from budget periods
      const previousMonths = Object.entries(budgetPeriods)
        .filter(([month]) => month < currentMonth)
        .map(([month, period]) => ({
          month,
          budgeted: period.categories[c.id]?.budgeted ?? 0,
          spent: period.categories[c.id]?.spent ?? 0,
          variance: (period.categories[c.id]?.spent ?? 0) - (period.categories[c.id]?.budgeted ?? 0)
        }))
        .slice(-6) // Keep last 6 months
        .sort((a, b) => a.month.localeCompare(b.month));

      return {
        ...c,
        spent: currentSpent,
        previousMonths
      };
    });
  }, [rawCategories, getCurrentMonthSpent, budgetPeriods, currentMonth]);

  // Existing CRUD operations (unchanged)
  const createCategory: EnhancedBudgetContext["createCategory"] = async (category) => {
    if (!hid) throw new Error("No householdId");
    const payload = cleanUpdate({
      name: category.name,
      emoji: category.emoji ?? "💰",
      color: category.color ?? "#6366f1",
      type: category.type ?? "essential",
      monthlyBudget: toGBP(category.monthlyBudget ?? 0),
      description: category.description ?? "",
      householdId: hid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const ref = await addDoc(collection(db, "households", hid, "categories"), payload);
    
    // Also add to current month's period
    if (budgetPeriods[currentMonth]) {
      const updates = {
        [`categories.${ref.id}`]: {
          budgeted: toGBP(category.monthlyBudget ?? 0),
          spent: 0
        }
      };
      await updateDoc(
        doc(db, "households", hid, "budgetPeriods", currentMonth),
        updates
      ).catch(console.error);
    }
    
    return ref.id;
  };

  const updateCategory: EnhancedBudgetContext["updateCategory"] = async (id, updates) => {
    if (!hid) throw new Error("No householdId");
    const { spent, ...rest } = updates as any;
    const payload = cleanUpdate({
      ...rest,
      monthlyBudget: rest.monthlyBudget != null ? toGBP(rest.monthlyBudget) : undefined,
      updatedAt: serverTimestamp(),
    });
    
    await updateDoc(doc(db, "households", hid, "categories", id), payload as any);
    
    // Also update current month's budgeted amount if monthlyBudget changed
    if (rest.monthlyBudget != null && budgetPeriods[currentMonth]) {
      await updateDoc(
        doc(db, "households", hid, "budgetPeriods", currentMonth),
        {
          [`categories.${id}.budgeted`]: toGBP(rest.monthlyBudget)
        }
      ).catch(console.error);
    }
  };

  const deleteCategory: EnhancedBudgetContext["deleteCategory"] = async (id) => {
    if (!hid) throw new Error("No householdId");
    await deleteDoc(doc(db, "households", hid, "categories", id));
  };

  // Existing transaction and goal CRUD (unchanged)
  const addTransaction: EnhancedBudgetContext["addTransaction"] = async (transaction) => {
    if (!hid) throw new Error("No householdId");
    const payload = cleanUpdate({
      ...transaction,
      amount: toGBP(transaction.amount),
      householdId: hid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const ref = await addDoc(collection(db, "households", hid, "transactions"), payload);
    return ref.id;
  };

  const updateTransaction: EnhancedBudgetContext["updateTransaction"] = async (id, updates) => {
    if (!hid) throw new Error("No householdId");
    const payload = cleanUpdate({
      ...updates,
      amount: updates.amount != null ? toGBP(updates.amount) : undefined,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "households", hid, "transactions", id), payload as any);
  };

  const deleteTransaction: EnhancedBudgetContext["deleteTransaction"] = async (id) => {
    if (!hid) throw new Error("No householdId");
    await deleteDoc(doc(db, "households", hid, "transactions", id));
  };

  const createGoal: EnhancedBudgetContext["createGoal"] = async (goal) => {
    if (!hid) throw new Error("No householdId");
    const payload = cleanUpdate({
      ...goal,
      target: toGBP(goal.target),
      current: toGBP(goal.current),
      householdId: hid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const ref = await addDoc(collection(db, "households", hid, "goals"), payload);
    return ref.id;
  };

  const updateGoal: EnhancedBudgetContext["updateGoal"] = async (id, updates) => {
    if (!hid) throw new Error("No householdId");
    const payload = cleanUpdate({
      ...updates,
      target: updates.target != null ? toGBP(updates.target) : undefined,
      current: updates.current != null ? toGBP(updates.current) : undefined,
      updatedAt: serverTimestamp(),
    });
    await updateDoc(doc(db, "households", hid, "goals", id), payload as any);
  };

  const deleteGoal: EnhancedBudgetContext["deleteGoal"] = async (id) => {
    if (!hid) throw new Error("No householdId");
    await deleteDoc(doc(db, "households", hid, "goals", id));
  };

  const value: EnhancedBudgetContext = {
    // Existing API
    categories,
    transactions,
    goals,
    householdId: hid,
    createCategory,
    updateCategory,
    deleteCategory,
    addTransaction,
    updateTransaction,
    deleteTransaction,
    createGoal,
    updateGoal,
    deleteGoal,
    setDerivedSpentLocal,
    
    // New monthly period API
    currentMonth,
    budgetPeriods,
    startNewMonth,
    getCurrentMonthBudget,
    getCurrentMonthSpent,
    getMonthData,
  };

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export default HouseholdBudgetProvider;