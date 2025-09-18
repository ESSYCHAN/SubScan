// src/components/MonthlyBudgetProvider.tsx
// Complete monthly budget system - the actual feature you wanted

"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, updateDoc, onSnapshot, serverTimestamp, getDocs } from "firebase/firestore";
// Core interfaces for monthly budgeting
export interface MonthlyBudgetPeriod {
  id: string; // "2024-12"
  name: string; // "December 2024"
  year: number;
  month: number;
  isActive: boolean;
  categories: Record<string, {
    name: string;
    planned: number;    // What you budgeted
    actual: number;     // What you actually spent (from bank statements)
    variance: number;   // actual - planned
    emoji: string;
    color: string;
  }>;
  goals: Record<string, {
    name: string;
    target: number;
    contributed: number;
    emoji: string;
  }>;
  totalPlanned: number;
  totalActual: number;
  totalVariance: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BudgetTemplate {
  id: string;
  name: string;
  categories: Record<string, {
    name: string;
    amount: number;
    emoji: string;
    color: string;
  }>;
  goals: Record<string, {
    name: string;
    monthlyTarget: number;
    emoji: string;
  }>;
}

export interface MonthlyInsight {
  type: 'overspend' | 'underspend' | 'goal_progress' | 'trend';
  category?: string;
  message: string;
  amount?: number;
  severity: 'low' | 'medium' | 'high';
}

interface MonthlyBudgetContextType {
  // Current state
  currentPeriod: MonthlyBudgetPeriod | null;
  allPeriods: MonthlyBudgetPeriod[];
  selectedPeriod: MonthlyBudgetPeriod | null;
  templates: BudgetTemplate[];
  
  // Loading states
  loading: boolean;
  error: string | null;
  
  // Navigation
  setSelectedPeriod: (periodId: string) => void;
  goToNextMonth: () => void;
  goToPreviousMonth: () => void;
  
  // Budget management
  startNewMonth: (templateId?: string) => Promise<string>;
  updatePlannedAmount: (categoryId: string, amount: number) => Promise<void>;
  updateActualSpending: (spending: Record<string, number>) => Promise<void>; // From SubScan
  
  // Template management
  saveAsTemplate: (name: string, periodId?: string) => Promise<string>;
  deleteTemplate: (templateId: string) => Promise<void>;
  
  // Analysis
  getInsights: (periodId?: string) => MonthlyInsight[];
  getCategoryHistory: (categoryId: string, months: number) => Array<{
    month: string;
    planned: number;
    actual: number;
    variance: number;
  }>;
  
  // Utilities
  getCurrentMonthId: () => string;
  formatPeriodName: (periodId: string) => string;
}

const MonthlyBudgetContext = createContext<MonthlyBudgetContextType | null>(null);

export const useMonthlyBudget = () => {
  const context = useContext(MonthlyBudgetContext);
  if (!context) {
    throw new Error('useMonthlyBudget must be used within MonthlyBudgetProvider');
  }
  return context;
};

interface Props {
  householdId: string;
  children: React.ReactNode;
}

export function MonthlyBudgetProvider({ householdId, children }: Props) {
  // State
  const [allPeriods, setAllPeriods] = useState<MonthlyBudgetPeriod[]>([]);
  const [templates, setTemplates] = useState<BudgetTemplate[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Utilities
  const getCurrentMonthId = useCallback(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const formatPeriodName = useCallback((periodId: string) => {
    const [year, month] = periodId.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('en-GB', { year: 'numeric', month: 'long' });
  }, []);

  // Computed values
  const currentPeriod = useMemo(() => {
    return allPeriods.find(p => p.id === getCurrentMonthId()) || null;
  }, [allPeriods, getCurrentMonthId]);

  const selectedPeriod = useMemo(() => {
    if (selectedPeriodId) {
      return allPeriods.find(p => p.id === selectedPeriodId) || null;
    }
    return currentPeriod;
  }, [allPeriods, selectedPeriodId, currentPeriod]);

  // Firebase listeners
  useEffect(() => {
    if (!householdId) return;

    // Listen to budget periods
    const periodsRef = collection(db, `households/${householdId}/budgetPeriods`);
    const unsubPeriods = onSnapshot(periodsRef, (snapshot) => {
      const periods: MonthlyBudgetPeriod[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        periods.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date(),
        } as MonthlyBudgetPeriod);
      });
      
      // Sort by date (newest first)
      periods.sort((a, b) => {
        const aDate = new Date(a.year, a.month - 1);
        const bDate = new Date(b.year, b.month - 1);
        return bDate.getTime() - aDate.getTime();
      });
      
      setAllPeriods(periods);
      setLoading(false);
    }, (err) => {
      console.error('Error loading budget periods:', err);
      setError(err.message);
      setLoading(false);
    });

    // Listen to templates
    const templatesRef = collection(db, `households/${householdId}/budgetTemplates`);
    const unsubTemplates = onSnapshot(templatesRef, (snapshot) => {
      const temps: BudgetTemplate[] = [];
      snapshot.forEach((doc) => {
        temps.push({ id: doc.id, ...doc.data() } as BudgetTemplate);
      });
      setTemplates(temps);
    });

    return () => {
      unsubPeriods();
      unsubTemplates();
    };
  }, [householdId]);

  // Auto-select current month on load
  useEffect(() => {
    if (!selectedPeriodId && currentPeriod) {
      setSelectedPeriodId(currentPeriod.id);
    }
  }, [currentPeriod, selectedPeriodId]);
// Initialize with existing household budget data
useEffect(() => {
  const initializeFromExistingData = async () => {
    if (!householdId || allPeriods.length > 0) return; // Skip if already have periods

    try {
      // Get existing categories from your household budget system
      const categoriesRef = collection(db, `households/${householdId}/categories`);
      const categoriesSnap = await getDocs(categoriesRef);
      
      if (categoriesSnap.empty) return; // No existing data
      
      const existingCategories: Record<string, any> = {};
      categoriesSnap.forEach(doc => {
        const data = doc.data();
        existingCategories[doc.id] = {
          name: data.name || 'Category',
          planned: data.monthlyBudget || 0,
          actual: 0,
          variance: 0,
          emoji: data.emoji || '💰',
          color: data.color || '#6366f1',
        };
      });

      // Create current month budget period
      const monthId = getCurrentMonthId();
      const totalPlanned = Object.values(existingCategories).reduce((sum: number, cat: any) => sum + cat.planned, 0);

      const newPeriod = {
        id: monthId,
        name: formatPeriodName(monthId),
        year: new Date().getFullYear(),
        month: new Date().getMonth() + 1,
        isActive: true,
        categories: existingCategories,
        goals: {},
        totalPlanned,
        totalActual: 0,
        totalVariance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(doc(db, `households/${householdId}/budgetPeriods/${monthId}`), newPeriod);
      
      console.log('✅ Initialized monthly budget with existing data');
    } catch (error) {
      console.error('Failed to initialize monthly budget:', error);
    }
  };

  // Wait a bit for the provider to settle, then initialize
  const timer = setTimeout(initializeFromExistingData, 2000);
  return () => clearTimeout(timer);
}, [householdId, allPeriods.length, getCurrentMonthId, formatPeriodName]);
  // Navigation functions
  const setSelectedPeriod = useCallback((periodId: string) => {
    setSelectedPeriodId(periodId);
  }, []);

  const goToNextMonth = useCallback(() => {
    if (!selectedPeriod) return;
    
    const currentIndex = allPeriods.findIndex(p => p.id === selectedPeriod.id);
    if (currentIndex > 0) {
      setSelectedPeriodId(allPeriods[currentIndex - 1].id);
    }
  }, [selectedPeriod, allPeriods]);

  const goToPreviousMonth = useCallback(() => {
    if (!selectedPeriod) return;
    
    const currentIndex = allPeriods.findIndex(p => p.id === selectedPeriod.id);
    if (currentIndex < allPeriods.length - 1) {
      setSelectedPeriodId(allPeriods[currentIndex + 1].id);
    }
  }, [selectedPeriod, allPeriods]);

  // Budget management functions
  const startNewMonth = useCallback(async (templateId?: string): Promise<string> => {
    if (!householdId) throw new Error('No household ID');

    const now = new Date();
    const monthId = getCurrentMonthId();
    
    // Check if month already exists
    if (allPeriods.find(p => p.id === monthId)) {
      throw new Error('Current month already exists');
    }

    let categories: Record<string, any> = {};
    let goals: Record<string, any> = {};

    if (templateId) {
      // Use template
      const template = templates.find(t => t.id === templateId);
      if (template) {
        categories = Object.fromEntries(
          Object.entries(template.categories).map(([id, cat]) => [
            id,
            {
              name: cat.name,
              planned: cat.amount,
              actual: 0,
              variance: 0,
              emoji: cat.emoji,
              color: cat.color,
            }
          ])
        );
        
        goals = Object.fromEntries(
          Object.entries(template.goals).map(([id, goal]) => [
            id,
            {
              name: goal.name,
              target: goal.monthlyTarget,
              contributed: 0,
              emoji: goal.emoji,
            }
          ])
        );
      }
    } else if (allPeriods.length > 0) {
      // Copy from last month
      const lastPeriod = allPeriods[0];
      categories = Object.fromEntries(
        Object.entries(lastPeriod.categories).map(([id, cat]) => [
          id,
          {
            ...cat,
            actual: 0,
            variance: 0,
          }
        ])
      );
      
      goals = Object.fromEntries(
        Object.entries(lastPeriod.goals).map(([id, goal]) => [
          id,
          {
            ...goal,
            contributed: 0,
          }
        ])
      );
    }

    const totalPlanned = Object.values(categories).reduce((sum: number, cat: any) => sum + cat.planned, 0);

    const newPeriod: Omit<MonthlyBudgetPeriod, 'createdAt' | 'updatedAt'> = {
      id: monthId,
      name: formatPeriodName(monthId),
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      isActive: true,
      categories,
      goals,
      totalPlanned,
      totalActual: 0,
      totalVariance: 0,
    };

    // Mark previous periods as inactive
    const batch = [];
    for (const period of allPeriods) {
      if (period.isActive) {
        batch.push(
          updateDoc(doc(db, `households/${householdId}/budgetPeriods/${period.id}`), {
            isActive: false,
            updatedAt: serverTimestamp(),
          })
        );
      }
    }
    await Promise.all(batch);

    // Create new period
    await setDoc(doc(db, `households/${householdId}/budgetPeriods/${monthId}`), {
      ...newPeriod,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return monthId;
  }, [householdId, allPeriods, templates, getCurrentMonthId, formatPeriodName]);

  const updatePlannedAmount = useCallback(async (categoryId: string, amount: number): Promise<void> => {
    if (!householdId || !selectedPeriod) return;

    const updates: any = {
      [`categories.${categoryId}.planned`]: amount,
      updatedAt: serverTimestamp(),
    };

    // Recalculate totals
    const newCategories = { ...selectedPeriod.categories };
    newCategories[categoryId] = { ...newCategories[categoryId], planned: amount };
    updates.totalPlanned = Object.values(newCategories).reduce((sum: number, cat: any) => sum + cat.planned, 0);

    await updateDoc(doc(db, `households/${householdId}/budgetPeriods/${selectedPeriod.id}`), updates);
  }, [householdId, selectedPeriod]);

  const updateActualSpending = useCallback(async (spending: Record<string, number>): Promise<void> => {
    if (!householdId || !selectedPeriod) return;

    const updates: any = {
      updatedAt: serverTimestamp(),
    };

    let totalActual = 0;
    Object.entries(spending).forEach(([categoryId, amount]) => {
      const planned = selectedPeriod.categories[categoryId]?.planned || 0;
      const variance = amount - planned;
      
      updates[`categories.${categoryId}.actual`] = amount;
      updates[`categories.${categoryId}.variance`] = variance;
      totalActual += amount;
    });

    updates.totalActual = totalActual;
    updates.totalVariance = totalActual - selectedPeriod.totalPlanned;

    await updateDoc(doc(db, `households/${householdId}/budgetPeriods/${selectedPeriod.id}`), updates);
  }, [householdId, selectedPeriod]);

  // Template management
  const saveAsTemplate = useCallback(async (name: string, periodId?: string): Promise<string> => {
    if (!householdId) throw new Error('No household ID');

    const sourcePeriod = periodId ? 
      allPeriods.find(p => p.id === periodId) : 
      selectedPeriod;

    if (!sourcePeriod) throw new Error('No period to save as template');

    const templateRef = doc(collection(db, `households/${householdId}/budgetTemplates`));
    
    const template: Omit<BudgetTemplate, 'id'> = {
      name,
      categories: Object.fromEntries(
        Object.entries(sourcePeriod.categories).map(([id, cat]) => [
          id,
          {
            name: cat.name,
            amount: cat.planned,
            emoji: cat.emoji,
            color: cat.color,
          }
        ])
      ),
      goals: Object.fromEntries(
        Object.entries(sourcePeriod.goals).map(([id, goal]) => [
          id,
          {
            name: goal.name,
            monthlyTarget: goal.target,
            emoji: goal.emoji,
          }
        ])
      ),
    };

    await setDoc(templateRef, template);
    return templateRef.id;
  }, [householdId, allPeriods, selectedPeriod]);

  const deleteTemplate = useCallback(async (templateId: string): Promise<void> => {
    if (!householdId) return;
    
    await updateDoc(doc(db, `households/${householdId}/budgetTemplates/${templateId}`), {
      deleted: true,
      deletedAt: serverTimestamp(),
    });
  }, [householdId]);

  // Analysis functions
  const getInsights = useCallback((periodId?: string): MonthlyInsight[] => {
    const period = periodId ? 
      allPeriods.find(p => p.id === periodId) : 
      selectedPeriod;

    if (!period) return [];

    const insights: MonthlyInsight[] = [];

    // Category overspending insights
    Object.entries(period.categories).forEach(([id, category]) => {
      if (category.variance > 0) {
        const severity = category.variance > category.planned * 0.2 ? 'high' : 
                        category.variance > category.planned * 0.1 ? 'medium' : 'low';
        
        insights.push({
          type: 'overspend',
          category: id,
          message: `${category.name}: £${category.variance.toFixed(2)} over budget`,
          amount: category.variance,
          severity,
        });
      } else if (category.variance < -50) {
        insights.push({
          type: 'underspend',
          category: id,
          message: `${category.name}: £${Math.abs(category.variance).toFixed(2)} under budget`,
          amount: Math.abs(category.variance),
          severity: 'low',
        });
      }
    });

    // Goal progress insights
    Object.entries(period.goals).forEach(([id, goal]) => {
      const progress = goal.target > 0 ? (goal.contributed / goal.target) * 100 : 0;
      
      if (progress >= 100) {
        insights.push({
          type: 'goal_progress',
          message: `🎉 ${goal.name} goal achieved!`,
          severity: 'low',
        });
      } else if (progress >= 80) {
        insights.push({
          type: 'goal_progress',
          message: `${goal.name}: ${progress.toFixed(0)}% complete`,
          severity: 'low',
        });
      }
    });

    // Sort by severity
    return insights.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }, [allPeriods, selectedPeriod]);

  const getCategoryHistory = useCallback((categoryId: string, months: number) => {
    return allPeriods
      .slice(0, months)
      .map(period => ({
        month: period.id,
        planned: period.categories[categoryId]?.planned || 0,
        actual: period.categories[categoryId]?.actual || 0,
        variance: period.categories[categoryId]?.variance || 0,
      }))
      .reverse(); // Oldest first for charts
  }, [allPeriods]);

  const value: MonthlyBudgetContextType = {
    // State
    currentPeriod,
    allPeriods,
    selectedPeriod,
    templates,
    loading,
    error,
    
    // Navigation
    setSelectedPeriod,
    goToNextMonth,
    goToPreviousMonth,
    
    // Budget management
    startNewMonth,
    updatePlannedAmount,
    updateActualSpending,
    
    // Template management
    saveAsTemplate,
    deleteTemplate,
    
    // Analysis
    getInsights,
    getCategoryHistory,
    
    // Utilities
    getCurrentMonthId,
    formatPeriodName,
  };

  return (
    <MonthlyBudgetContext.Provider value={value}>
      {children}
    </MonthlyBudgetContext.Provider>
  );
}