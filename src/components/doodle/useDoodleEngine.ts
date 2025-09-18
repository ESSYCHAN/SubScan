// components/doodle/useDoodleEngine.ts
"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEnhancedBudget } from "@/components/HouseholdBudgetProvider";

export type Coin = 10 | 20 | 50 | 100;
export const COINS: Coin[] = [10, 20, 50, 100];
export type Draft = Record<string, number>;
export type Locked = Record<string, boolean>;

export function useDoodleEngine() {
  const { categories, updateCategory } = useEnhancedBudget();
  
  // Guard against empty categories
  const safeCategories = categories || [];
  
  const currentTotalBudget = useMemo(
    () => safeCategories.reduce((s, c) => s + (c.monthlyBudget || 0), 0),
    [safeCategories]
  );
  
  const [wallet, setWallet] = useState<number>(Math.max(500, Math.round(currentTotalBudget) || 1000));
  const [draft, setDraft] = useState<Draft>({});
  const [locked, setLocked] = useState<Locked>({});
  const [coin, setCoin] = useState<Coin>(50);

  const seedHash = useMemo(
    () => safeCategories
        .map((c) => `${c.id}:${Math.round((c.monthlyBudget || 0) * 100)}`)
        .sort()
        .join("|"),
    [safeCategories]
  );

  const seedFromCats = useMemo(() => {
    const base: Draft = {};
    safeCategories.forEach((c) => (base[c.id] = Math.round(c.monthlyBudget || 0)));
    return base;
  }, [seedHash, safeCategories]);

  useEffect(() => {
    if (Object.keys(draft).length === 0 && safeCategories.length > 0) {
      setDraft(seedFromCats);
    }
  }, [seedFromCats, safeCategories.length, draft]);

  const assigned = useMemo(
    () => Object.values(draft).reduce((s, n) => s + (n || 0), 0),
    [draft]
  );
  
  const remaining = Math.max(0, wallet - assigned);

  const clampJar = useCallback(
    (id: string, value: number) => {
      const others = Object.entries(draft)
        .filter(([k]) => k !== id)
        .reduce((s, [, v]) => s + (v || 0), 0);
      const max = Math.max(0, wallet - others);
      setDraft((d) => ({ ...d, [id]: Math.max(0, Math.min(Math.round(value || 0), max)) }));
    },
    [draft, wallet]
  );

  const bump = (id: string, delta: number) => {
    if (delta > 0 && remaining < delta) return;
    clampJar(id, (draft[id] || 0) + delta);
  };

  const toggleLock = (id: string) => setLocked((l) => ({ ...l, [id]: !l[id] }));

  const autoSpreadRemaining = () => {
    let pool = remaining;
    if (pool <= 0 || safeCategories.length === 0) return;
    
    const unlocked = safeCategories.filter((c) => !locked[c.id]);
    if (!unlocked.length) return;

    const gaps = unlocked.map((c) => {
      const target = Math.max(0, Math.round(c.monthlyBudget || 0));
      const cur = Math.max(0, Math.round(draft[c.id] || 0));
      return { id: c.id, gap: Math.max(0, target - cur) };
    });

    const totalGap = gaps.reduce((s, g) => s + g.gap, 0);
    setDraft((d) => {
      const copy = { ...d };
      if (totalGap === 0) {
        const each = Math.floor(pool / unlocked.length);
        unlocked.forEach((c) => (copy[c.id] = (copy[c.id] || 0) + each));
      } else {
        gaps.forEach(({ id, gap }) => {
          const share = Math.floor((gap / totalGap) * pool);
          copy[id] = (copy[id] || 0) + share;
        });
      }
      return copy;
    });
  };

  const resetToCurrent = () => setDraft(seedFromCats);

  const applyToRealBudget = async () => {
    if (!updateCategory || safeCategories.length === 0) {
      console.warn("Cannot apply budget - no categories or update function available");
      return;
    }

    const ops: Promise<void>[] = [];
    for (const c of safeCategories) {
      const next = Math.round((draft[c.id] || 0) * 100) / 100;
      if (next !== (c.monthlyBudget || 0)) {
        ops.push(updateCategory(c.id, { monthlyBudget: next }));
      }
    }
    if (ops.length) await Promise.all(ops);
  };

  return {
    categories: safeCategories,
    wallet, setWallet,
    draft, setDraft,
    locked, toggleLock,
    coin, setCoin,
    assigned, remaining,
    bump, clampJar,
    autoSpreadRemaining, resetToCurrent, applyToRealBudget
  };
}