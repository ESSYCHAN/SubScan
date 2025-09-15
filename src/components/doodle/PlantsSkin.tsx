"use client";
import React from "react";
import { Leaf, Coins, Wand2, RefreshCw, Check, Lock, Unlock } from "lucide-react";
import { COINS, useDoodleEngine } from "./useDoodleEngine";

const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const gbp2 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });
const f0 = (n:number)=>gbp0.format(Math.round(n||0));
const f2 = (n:number)=>gbp2.format(n||0);

export default function PlantsSkin() {
  const {
    categories, wallet, setWallet,
    draft, clampJar, bump, locked, toggleLock,
    coin, setCoin, assigned, remaining,
    autoSpreadRemaining, resetToCurrent, applyToRealBudget
  } = useDoodleEngine();

  return (
    <div className="rounded-2xl bg-white/90 border border-gray-100 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-lime-500 grid place-items-center shadow">
            <Leaf className="w-5 h-5 text-white" />
          </div>
        <div>
            <div className="font-semibold text-gray-900">Plants Budget</div>
            <div className="text-xs text-gray-500">Grow each pot with coins. Apply to set monthly targets.</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="px-3 py-2 rounded-xl border bg-white text-sm">
            Wallet:{" "}
            <input
              type="number"
              className="w-24 px-2 py-1 border rounded-lg text-sm ml-1"
              value={wallet}
              min={0}
              onChange={(e) => setWallet(Math.max(0, Math.round(Number(e.target.value) || 0)))}
            />
          </div>
          <div className="px-3 py-2 rounded-xl border bg-white text-sm">
            Remaining: <span className="font-semibold">{f0(remaining)}</span>
          </div>
          <button onClick={autoSpreadRemaining} className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-2">
            <Wand2 className="w-4 h-4" /> Auto-spread
          </button>
          <button onClick={resetToCurrent} className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-2">
            <RefreshCw className="w-4 h-4" /> Reset
          </button>
          <button
            onClick={applyToRealBudget}
            disabled={remaining !== 0}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium inline-flex items-center gap-2 ${
              remaining === 0 ? "bg-gray-900 text-white hover:bg-black" : "bg-gray-200 text-gray-600 cursor-not-allowed"
            }`}
          >
            <Check className="w-4 h-4" /> Apply
          </button>
        </div>
      </div>

      {/* Coin picker */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">Coins:</span>
        {COINS.map((c) => (
          <button
            key={c}
            onClick={() => setCoin(c)}
            className={`px-3 py-2 rounded-xl text-sm border inline-flex items-center gap-2 ${
              coin === c ? "bg-emerald-50 border-emerald-300 text-emerald-800" : "bg-white hover:bg-gray-50"
            }`}
          >
            <Coins className="w-4 h-4" />
            {f0(c)}
          </button>
        ))}
      </div>

      {/* Pots grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {categories.map((c) => {
          const val = draft[c.id] || 0;
          const target = Math.max(0, c.monthlyBudget || 0);
          const pct = target > 0 ? Math.min(100, (val / target) * 100) : 0;
          const isLocked = !!locked[c.id];

          return (
            <div key={c.id} className="rounded-2xl border bg-gradient-to-br from-white to-gray-50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xl">{c.emoji}</span>
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{c.name}</div>
                    <div className="text-[11px] text-gray-500 truncate">Target {target ? f2(target) : "—"}</div>
                  </div>
                </div>
                <button onClick={() => toggleLock(c.id)} className="p-1.5 rounded-lg hover:bg-white/60">
                  {isLocked ? <Lock className="w-4 h-4 text-gray-700" /> : <Unlock className="w-4 h-4 text-gray-500" />}
                </button>
              </div>

              {/* Pot visual */}
              <div className="h-24 relative rounded-xl border bg-gradient-to-b from-emerald-50 to-white overflow-hidden mb-3">
                {/* soil */}
                <div className="absolute bottom-0 left-0 right-0 h-6 bg-amber-200/70 border-t border-amber-300" />
                {/* stem */}
                <div
                  className="absolute bottom-6 left-1/2 -translate-x-1/2 w-1.5 bg-emerald-500 origin-bottom transition-[height] duration-300"
                  style={{ height: `${Math.max(4, pct)}%` }}
                />
                {/* leaves */}
                <div className="absolute bottom-[calc(6px+50%)] left-1/2 -translate-x-1/2">
                  <Leaf className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="absolute inset-0 grid place-items-center text-[11px] text-gray-600">
                  {target ? `${Math.round(pct)}%` : f0(val)}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg overflow-hidden border">
                  <button
                    onClick={() => !isLocked && clampJar(c.id, Math.max(0, val - coin))}
                    className="px-3 py-1.5 bg-white hover:bg-gray-50 text-sm disabled:opacity-50"
                    disabled={isLocked || val <= 0}
                  >
                    −{f0(coin)}
                  </button>
                  <button
                    onClick={() => !isLocked && clampJar(c.id, val + coin)}
                    className="px-3 py-1.5 bg-white hover:bg-gray-50 text-sm border-l disabled:opacity-50"
                    disabled={isLocked || remaining < coin}
                  >
                    +{f0(coin)}
                  </button>
                </div>
                <input
                  type="number"
                  className="w-24 px-2 py-1 border rounded-lg text-sm"
                  value={val}
                  min={0}
                  onChange={(e) => !isLocked && clampJar(c.id, Number(e.target.value || 0))}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="sticky bottom-3 z-10 flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow">
        <div className="text-sm text-gray-600">
          Wallet {f0(wallet)} • Allocated <span className="font-medium">{f0(assigned)}</span> • Remaining{" "}
          <span className="font-medium">{f0(remaining)}</span>
        </div>
        <button
          onClick={applyToRealBudget}
          disabled={remaining !== 0}
          className={`px-4 py-2 rounded-xl text-sm font-medium ${
            remaining === 0 ? "bg-gray-900 text-white hover:bg-black" : "bg-gray-200 text-gray-600 cursor-not-allowed"
          }`}
        >
          Apply
        </button>
      </div>
    </div>
  );
}
