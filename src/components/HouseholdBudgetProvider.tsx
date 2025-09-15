
//src/components/HouseholdBudgetProvider.tsx

"use client";

import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  type BudgetCategory,
  type Transaction,
  type SavingsGoal,
} from "@/components/HomeBudgetExtensions";
import { useHouseholdId } from "@/hooks/useHousehold"; // you already referenced this in your code

// ─────────────────────────────────────────────────────────────
// Context shape (matches EnhancedBudgetProvider API)
// ─────────────────────────────────────────────────────────────
interface EnhancedBudgetContext {
  categories: BudgetCategory[];
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

  /**
   * Accept a map of derived 'spent' per category (e.g., from SubScan BudgetBridge).
   * This never persists to Firestore — it only updates the in-memory view.
   */
  setDerivedSpentLocal(next: Record<string, number>): void;
}

const BudgetContext = createContext<EnhancedBudgetContext | null>(null);
export const useEnhancedBudget = () => {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error("useEnhancedBudget must be used within HouseholdBudgetProvider");
  return ctx;
};
export type { BudgetCategory, Transaction, SavingsGoal } from "@/components/HomeBudgetExtensions";

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
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

type ProviderProps = {
  householdId?: string; // optional override; defaults to useHouseholdId()
  children: React.ReactNode;
};

export function HouseholdBudgetProvider({ householdId: hidProp, children }: ProviderProps) {

  const hookHid = useHouseholdId?.();
  const hid = hidProp ?? hookHid;
  if (!hid) {
    // You can render a loading UI here if your hook is async.
  }

  // Raw Firestore rows (without derived spent)
  const [rawCategories, setRawCategories] = useState<(Omit<BudgetCategory, "spent"> & { id: string })[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [goals, setGoals] = useState<SavingsGoal[]>([]);

  // Derived 'spent' — fed by BudgetBridge or computed locally if you want
  const [derivedSpentLocal, setDerivedSpentLocalState] = useState<Record<string, number>>({});
const setDerivedSpentLocal = useCallback((next: Record<string, number>) => {
  setDerivedSpentLocalState((prev) => {
    const pk = Object.keys(prev), nk = Object.keys(next);
    if (pk.length === nk.length && nk.every((k) => prev[k] === next[k])) return prev; // no change
    return next;
  });
}, []);

// categories you expose (merge derived `spent`)
const categories: BudgetCategory[] = useMemo(() => {
  return rawCategories.map((c) => ({
    ...c,
    spent: toGBP(derivedSpentLocal[c.id] ?? 0),
  }));
}, [rawCategories, derivedSpentLocal]);


  // Live listeners
  useEffect(() => {
    if (!hid) return;

    const catsRef = collection(db, "households", hid, "categories");
    const unsubCats = onSnapshot(catsRef, (snap) => {
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
    });

    const txRef = collection(db, "households", hid, "transactions");
    const unsubTx = onSnapshot(txRef, (snap) => {
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
    });

    const goalsRef = collection(db, "households", hid, "goals");
    const unsubGoals = onSnapshot(goalsRef, (snap) => {
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
    });

    return () => {
      unsubCats();
      unsubTx();
      unsubGoals();
    };
  }, [hid]);

  // Expose categories with derived spent value (never persisted)
//   const categories: BudgetCategory[] = useMemo(() => {
//   const ds = derivedSpentRef.current;
//   return rawCategories.map((c) => ({ ...c, spent: toGBP(ds[c.id] ?? 0) }));
// }, [rawCategories, spentTick]);


  // CRUD: Categories (never allow 'spent' to be sent)
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
      // NOTE: spent is intentionally omitted (derived)
    });
    const ref = await addDoc(collection(db, "households", hid, "categories"), payload);
    return ref.id;
  };

  const updateCategory: EnhancedBudgetContext["updateCategory"] = async (id, updates) => {
    if (!hid) throw new Error("No householdId");
    // Strip any attempt to update 'spent'
    const { spent, ...rest } = updates as any;
    const payload = cleanUpdate({
      ...rest,
      monthlyBudget: rest.monthlyBudget != null ? toGBP(rest.monthlyBudget) : undefined,
      updatedAt: serverTimestamp(),
    });
    const ref = doc(db, "households", hid, "categories", id);
    await updateDoc(ref, payload as any);
  };

  const deleteCategory: EnhancedBudgetContext["deleteCategory"] = async (id) => {
    if (!hid) throw new Error("No householdId");
    await deleteDoc(doc(db, "households", hid, "categories", id));
  };

  // CRUD: Transactions
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

  // CRUD: Goals
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
    categories,
    transactions,
    goals,
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
  };

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export default HouseholdBudgetProvider;
