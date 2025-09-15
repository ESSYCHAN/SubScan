"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useEnhancedBudget } from "@/components/HouseholdBudgetProvider";

export type Coin = 10 | 20 | 50 | 100;
export const COINS: Coin[] = [10, 20, 50, 100];

export type Draft = Record<string, number>;   // categoryId -> assigned amount
export type Locked = Record<string, boolean>; // categoryId -> locked

export function useDoodleEngine() {
  const { categories, updateCategory } = useEnhancedBudget();

  // derived
  const currentTotalBudget = useMemo(
    () => categories.reduce((s, c) => s + (c.monthlyBudget || 0), 0),
    [categories]
  );

  const [wallet, setWallet] = useState<number>(Math.max(500, Math.round(currentTotalBudget) || 1000));
  const [draft, setDraft] = useState<Draft>({});
  const [locked, setLocked] = useState<Locked>({});
  const [coin, setCoin] = useState<Coin>(50);

  // seed hash so we only reseed when real budgets change
  const seedHash = useMemo(
    () =>
      categories
        .map((c) => `${c.id}:${Math.round((c.monthlyBudget || 0) * 100)}`)
        .sort()
        .join("|"),
    [categories]
  );

  const seedFromCats = useMemo(() => {
    const base: Draft = {};
    categories.forEach((c) => (base[c.id] = Math.round(c.monthlyBudget || 0)));
    return base;
  }, [seedHash, categories]);

  useEffect(() => {
    if (Object.keys(draft).length === 0 && categories.length) {
      setDraft(seedFromCats);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedFromCats, categories.length]);

  const assigned = useMemo(
    () => Object.values(draft).reduce((s, n) => s + (n || 0), 0),
    [draft]
  );
  const remaining = Math.max(0, wallet - assigned);

  // clamp a single jar so total never exceeds wallet
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

  // weighted autospread by gap to target
  const autoSpreadRemaining = () => {
    let pool = remaining;
    if (pool <= 0) return;
    const unlocked = categories.filter((c) => !locked[c.id]);
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
    const ops: Promise<void>[] = [];
    for (const c of categories) {
      const next = Math.round((draft[c.id] || 0) * 100) / 100;
      if (next !== (c.monthlyBudget || 0)) {
        ops.push(updateCategory(c.id, { monthlyBudget: next }));
      }
    }
    if (ops.length) await Promise.all(ops);
  };

  return {
    categories,
    wallet, setWallet,
    draft, setDraft,
    locked, toggleLock,
    coin, setCoin,
    assigned, remaining,
    bump, clampJar,
    autoSpreadRemaining, resetToCurrent, applyToRealBudget
  };
}
