// components/DoodleBudget.tsx
"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { PiggyBank, Coins, RefreshCw, Wand2, Check, Lock, Unlock } from "lucide-react";
import { useEnhancedBudget } from "@/components/HouseholdBudgetProvider";

// Minimal category shape used here (avoid importing from HomeBudgetExtensions to prevent circular deps)
type CatView = {
  id: string;
  name: string;
  emoji: string;
  type: "essential" | "lifestyle" | "savings" | "debt";
  monthlyBudget: number;
};

type Coin = 10 | 20 | 50 | 100;
const COINS: Coin[] = [10, 20, 50, 100];

const currency0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const currency2 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = (n: number) => currency0.format(Math.round(n || 0));
const fmt2 = (n: number) => currency2.format(n || 0);

type Draft = Record<string, number>;   // categoryId -> assigned amount
type Locked = Record<string, boolean>; // categoryId -> locked

export default function DoodleBudget() {
  const { categories, updateCategory, createCategory } = useEnhancedBudget(); // ⬅️ add createCategory

  // ⬇️ starter set used only when you have zero categories in Firestore
  const STARTER: Array<{
    name: string; emoji: string; type: "essential"|"lifestyle"|"savings"|"debt"; monthlyBudget: number; description?: string
  }> = [
    { name: "Mortgage",           emoji: "🏠", type: "essential", monthlyBudget: 1200 },
    { name: "Groceries & Food",   emoji: "🛒", type: "essential", monthlyBudget: 400 },
    { name: "Utilities (Gas/Electric)", emoji: "⚡", type: "essential", monthlyBudget: 120 },
    { name: "Internet & Phone",   emoji: "📶", type: "essential", monthlyBudget: 60 },
    { name: "Transport & Fuel",   emoji: "🚗", type: "essential", monthlyBudget: 200 },
    { name: "Insurance",          emoji: "🛡️", type: "essential", monthlyBudget: 85 },
    { name: "Entertainment",      emoji: "🎭", type: "lifestyle", monthlyBudget: 100 },
    { name: "Investments",        emoji: "📈", type: "savings",   monthlyBudget: 200 },
  ];

  async function seedStarter() {
  try {
    await Promise.all(
      STARTER.map(s =>
        createCategory({
          name: s.name,
          emoji: s.emoji,
          color: "#6366f1",
          type: s.type,
          monthlyBudget: s.monthlyBudget,
          description: s.description || "",
        })
      )
    );
  } catch (e: any) {
    alert(e?.message || "Budget isn’t ready yet—try again in a moment.");
  }
}
  // Narrow categories to the shape we use locally (keeps typing simple)
  const catList = useMemo<CatView[]>(
    () =>
      categories.map((c) => ({
        id: c.id,
        name: c.name,
        emoji: c.emoji,
        type: c.type,
        monthlyBudget: Number(c.monthlyBudget || 0),
      })),
    [categories]
  );

  // group by type for lighter feel
  const groups = useMemo(() => {
    const map: Record<CatView["type"], CatView[]> = {
      essential: [],
      lifestyle: [],
      savings: [],
      debt: [],
    };
    catList.forEach((c) => map[c.type].push(c));
    return map;
  }, [catList]);

  // current total (seed wallet)
  const currentTotalBudget = useMemo(
    () => catList.reduce((s, c) => s + (c.monthlyBudget || 0), 0),
    [catList]
  );

  const [wallet, setWallet] = useState<number>(Math.max(500, Math.round(currentTotalBudget) || 1000));
  const [draft, setDraft] = useState<Draft>({});
  const [locked, setLocked] = useState<Locked>({});
  const [coin, setCoin] = useState<Coin>(50);

  // stable hash so seeding only happens when budgets actually change (ids + rounded budgets)
  const seedHash = useMemo(
    () =>
      catList
        .map((c) => `${c.id}:${Math.round((c.monthlyBudget || 0) * 100)}`)
        .sort()
        .join("|"),
    [catList]
  );

  const seedFromCats = useMemo(() => {
    const base: Draft = {};
    catList.forEach((c) => (base[c.id] = Math.round(c.monthlyBudget || 0)));
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedHash]);

  // seed on first mount OR when we explicitly reset
  useEffect(() => {
    if (Object.keys(draft).length === 0 && catList.length) {
      setDraft(seedFromCats);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedFromCats, catList.length]);

  const assigned = useMemo(() => Object.values(draft).reduce((s, n) => s + (n || 0), 0), [draft]);
  const remaining = Math.max(0, wallet - assigned);

  // keep a single clamp function so manual edits can't exceed wallet
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
    if (delta > 0 && remaining < delta) return; // no over-spend
    clampJar(id, (draft[id] || 0) + delta);
  };

  const toggleLock = (id: string) => setLocked((l) => ({ ...l, [id]: !l[id] }));

  // Spread remaining among unlocked categories, weighted by their "gap to current budget"
  const autoSpreadRemaining = () => {
    let pool = remaining;
    if (pool <= 0) return;
    const unlocked = catList.filter((c) => !locked[c.id]);
    if (!unlocked.length) return;

    // weights by (target - currentDraft), min 0
    const gaps = unlocked.map((c) => {
      const target = Math.max(0, Math.round(c.monthlyBudget || 0));
      const cur = Math.max(0, Math.round(draft[c.id] || 0));
      return { id: c.id, gap: Math.max(0, target - cur) };
    });

    const totalGap = gaps.reduce((s, g) => s + g.gap, 0);
    setDraft((d) => {
      const copy = { ...d };
      if (totalGap === 0) {
        // equal split if no gaps
        const each = Math.floor(pool / unlocked.length);
        unlocked.forEach((c) => {
          const cur = copy[c.id] || 0;
          copy[c.id] = cur + each;
        });
        pool -= each * unlocked.length;
      } else {
        // weighted by gap
        gaps.forEach(({ id, gap }) => {
          const share = Math.floor((gap / totalGap) * pool);
          copy[id] = (copy[id] || 0) + share;
        });
        pool = 0; // distributed
      }
      return copy;
    });
  };

  // Apply only changed budgets (NEVER touches 'spent')
  const applyToRealBudget = async () => {
  console.log("🚀 Apply button clicked!");
  console.log("📊 Current state:", {
    remaining,
    wallet,
    assigned,
    categoriesCount: catList.length,
    draft,
    updateCategoryExists: !!updateCategory
  });

  if (remaining !== 0) {
    alert(`Cannot apply budget - you have £${remaining} remaining. Please allocate all funds first.`);
    return;
  }

  try {
    const ops: Promise<void>[] = [];
    for (const c of catList) {
      const currentBudget = c.monthlyBudget || 0;
      const newBudget = Math.round((draft[c.id] || 0) * 100) / 100;
      
      console.log(`📝 ${c.name}: ${currentBudget} → ${newBudget}`);
      
      if (newBudget !== currentBudget) {
        ops.push(updateCategory(c.id, { monthlyBudget: newBudget }));
      }
    }
    
    if (ops.length === 0) {
      alert("No changes to apply");
      return;
    }
    
    console.log(`🔄 Applying ${ops.length} updates...`);
    await Promise.all(ops);
    alert(`✅ Successfully updated ${ops.length} categories!`);
  } catch (error: any) {
    console.error("❌ Error:", error);
    alert(`Error: ${error?.message || 'Unknown error'}`);
  }
};

  // Keyboard shortcuts for coin quick-pick
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["1", "2", "3", "4"].includes(e.key)) {
        setCoin(COINS[Number(e.key) - 1]);
      }
      if (e.key === "ArrowLeft") {
        setCoin((c) => COINS[Math.max(0, COINS.indexOf(c) - 1)]);
      }
      if (e.key === "ArrowRight") {
        setCoin((c) => COINS[Math.min(COINS.length - 1, COINS.indexOf(c) + 1)]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);


    // Empty state when there are no categories yet
  if (!categories.length) {
    return (
      <div className="rounded-2xl border bg-white/90 p-6 text-center">
        <div className="mx-auto mb-3 h-12 w-12 grid place-items-center rounded-2xl bg-amber-100">
          <PiggyBank className="w-6 h-6 text-amber-700" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900">Let’s set up your jars</h3>
        <p className="text-sm text-gray-600 mt-1">Create a few starter categories to begin allocating with coins.</p>
        <button
          onClick={seedStarter}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white hover:bg-black"
        >
          Create starter categories
        </button>
      </div>
    );
  }


  return (
    <div className="rounded-2xl bg-white/90 backdrop-blur border border-gray-100 p-5 space-y-5">
      {/* Top bar */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-500 grid place-items-center shadow">
            <PiggyBank className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-gray-900">Doodle Budget (jars & coins)</div>
            <div className="text-xs text-gray-500">Click coins to fill jars. “Apply” writes targets to Monthly Budget.</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="px-3 py-2 rounded-xl border bg-white text-sm">
            Wallet:{" "}
            <input
              aria-label="Wallet amount"
              type="number"
              className="w-24 px-2 py-1 border rounded-lg text-sm ml-1"
              value={wallet}
              min={0}
              onChange={(e) => setWallet(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            />
          </div>
          <div className="px-3 py-2 rounded-xl border bg-white text-sm">
            Remaining: <span className="font-semibold">{fmt0(remaining)}</span>
          </div>
          <button
            onClick={autoSpreadRemaining}
            className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-2"
            title="Spread remaining across unlocked jars"
          >
            <Wand2 className="w-4 h-4" /> Auto-spread
          </button>
          <button
            onClick={() => setDraft(seedFromCats)}
            className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> Reset to current
          </button>
          <button
            onClick={applyToRealBudget}
            disabled={remaining !== 0}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
              remaining === 0 
                ? "bg-green-600 text-white hover:bg-green-700 shadow-lg hover:shadow-xl" 
                : "bg-gray-200 text-gray-600 cursor-not-allowed opacity-60"
            }`}
            title={
              remaining === 0 
                ? "Writes these jar amounts into Monthly Budget" 
                : `Allocate the remaining £${remaining} first`
            }
          >
            <Check className="w-4 h-4 mr-2" />
            {remaining === 0 ? "Apply to real budget" : `Allocate £${remaining} first`}
          </button>
        </div>
      </div>

      {/* Coins row */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">Coins:</span>
        {COINS.map((c) => (
          <button
            key={c}
            onClick={() => setCoin(c)}
            className={`px-3 py-2 rounded-xl text-sm border inline-flex items-center gap-2 ${
              coin === c ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-white hover:bg-gray-50"
            }`}
            aria-pressed={coin === c}
            aria-label={`Select ${fmt0(c)} coin`}
          >
            <Coins className="w-4 h-4" />
            {fmt0(c)}
          </button>
        ))}
      </div>

      {/* Jars */}
      <div className="space-y-6">
        {(["essential", "lifestyle", "savings", "debt"] as const).map((type) => {
          const list = groups[type];
          if (!list.length) return null;

          const subAssigned = list.reduce((s, c) => s + (draft[c.id] || 0), 0);
          return (
            <section key={type} aria-label={`${type} jars`}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-gray-700 capitalize">{type}</div>
                <div className="text-xs text-gray-500">Subtotal: {fmt0(subAssigned)}</div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {list.map((c) => {
                  const val = draft[c.id] || 0;
                  const target = Math.max(0, c.monthlyBudget || 0);
                  const progress = target > 0 ? Math.min(100, (val / target) * 100) : 0;
                  const isLocked = !!locked[c.id];

                  return (
                    <div
                      key={c.id}
                      className="rounded-2xl border bg-gradient-to-br from-white to-gray-50 p-4 pb-8 shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xl">{c.emoji}</span>
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 truncate">{c.name}</div>
                            <div className="text-[11px] text-gray-500 truncate">
                              {target > 0 ? `Target ${fmt2(target)}` : "No target set"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleLock(c.id)}
                            className="p-1.5 rounded-lg hover:bg-white/60"
                            aria-label={isLocked ? "Unlock jar" : "Lock jar"}
                            title={isLocked ? "Unlock jar" : "Lock jar"}
                          >
                            {isLocked ? <Lock className="w-4 h-4 text-gray-700" /> : <Unlock className="w-4 h-4 text-gray-500" />}
                          </button>
                          <div className="text-sm font-semibold">{fmt0(val)}</div>
                        </div>
                      </div>

                      {/* Glass Jar visual - REPLACE your current jar visual with this */}
                      <div className="h-20 relative mb-3 flex justify-center">
                        {/* Glass jar container */}
                        <div className="w-16 h-20 relative">
                          {/* Jar neck */}
                          <div className="absolute -top-1 left-1/2 transform -translate-x-1/2 w-4 h-2 bg-gradient-to-b from-blue-100 to-blue-200 rounded-t border border-blue-200/50"></div>
                          
                          {/* Main jar body */}
                          <div className="w-full h-full bg-gradient-to-br from-blue-50/80 to-blue-100/80 rounded-b-2xl border-2 border-blue-200/50 shadow-inner backdrop-blur-sm relative overflow-hidden">
                            
                            {/* Money/coins inside jar */}
                            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 w-12 h-16 flex flex-wrap items-end justify-center p-0.5">
                              {/* Generate coin stack based on amount */}
                              {Array.from({ length: Math.min(6, Math.floor(val / 50) || 1) }).map((_, coinIdx) => (
                                <div
                                  key={coinIdx}
                                  className={`w-2 h-1 bg-gradient-to-b from-yellow-300 to-yellow-600 rounded-full shadow-sm ${
                                    coinIdx % 2 === 0 ? 'mr-0.5' : 'ml-0.5'
                                  }`}
                                  style={{ 
                                    zIndex: coinIdx,
                                    marginBottom: `${coinIdx * 0.5}px`,
                                    transform: `rotate(${(coinIdx % 3 - 1) * 15}deg)`
                                  }}
                                />
                              ))}
                            </div>
                            
                            {/* Progress fill effect */}
                            <div
                              className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-yellow-100/30 to-yellow-200/20 transition-[height] duration-500 rounded-b-2xl"
                              style={{ height: `${Math.min(progress, 85)}%` }}
                            />
                            
                            {/* Category emoji */}
                            <div className="absolute top-1 left-1/2 transform -translate-x-1/2 text-sm z-10">
                              {c.emoji}
                            </div>
                            
                            {/* Glass shine effect */}
                            <div className="absolute inset-y-1 left-1 w-1 bg-gradient-to-b from-white/40 to-transparent rounded-full"></div>
                          </div>
                        </div>
                        
                        {/* Amount display below jar */}
                        <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 text-xs text-center">
                          <div className="font-semibold">{fmt0(val)}</div>
                          {target > 0 && (
                            <div className="text-gray-500">{Math.round(progress)}%</div>
                          )}
                        </div>
                      </div>

                      {/* Controls */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="inline-flex rounded-lg overflow-hidden border">
                          <button
                            onClick={() => !isLocked && bump(c.id, -coin)}
                            className="px-3 py-1.5 bg-white hover:bg-gray-50 text-sm disabled:opacity-50"
                            disabled={isLocked || val <= 0}
                            aria-label={`Remove ${fmt0(coin)} from ${c.name}`}
                          >
                            −{fmt0(coin)}
                          </button>
                          <button
                            onClick={() => !isLocked && bump(c.id, coin)}
                            className="px-3 py-1.5 bg-white hover:bg-gray-50 text-sm border-l disabled:opacity-50"
                            disabled={isLocked || remaining < coin}
                            title={remaining < coin ? "Not enough in wallet" : "Add coin"}
                            aria-label={`Add ${fmt0(coin)} to ${c.name}`}
                          >
                            +{fmt0(coin)}
                          </button>
                        </div>

                        <input
                          aria-label={`${c.name} amount`}
                          type="number"
                          className="w-28 px-2 py-1 border rounded-lg text-sm"
                          value={val}
                          min={0}
                          onChange={(e) => !isLocked && clampJar(c.id, Number(e.target.value || 0))}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Sticky footer summary */}
      <div className="sticky bottom-3 z-10 flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow">
        <div className="text-sm text-gray-600">
          Wallet {fmt0(wallet)} • Allocated <span className="font-medium">{fmt0(assigned)}</span> • Remaining{" "}
          <span className="font-medium">{fmt0(remaining)}</span>
        </div>
        <button
          onClick={applyToRealBudget}
          disabled={remaining !== 0}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${
            remaining === 0 ? "bg-gray-900 text-white hover:bg-black" : "bg-gray-200 text-gray-600 cursor-not-allowed"
          }`}
        >
          Apply to real budget
        </button>
      </div>
    </div>
  );
}
