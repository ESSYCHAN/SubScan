// components/doodle/EnvelopesSkin.tsx
"use client";
import React from "react";
import { Mail, Coins, Wand2, RefreshCw, Check, Lock, Unlock } from "lucide-react";
import { COINS, useDoodleEngine } from "./useDoodleEngine";

const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const gbp2 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });
const f0 = (n:number)=>gbp0.format(Math.round(n||0));
const f2 = (n:number)=>gbp2.format(n||0);

export default function EnvelopesSkin() {
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
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-500 grid place-items-center shadow">
            <Mail className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-gray-900">Envelopes Budget</div>
            <div className="text-xs text-gray-500">Fill each envelope with “notes”. Apply to set monthly targets.</div>
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
        <span className="text-xs text-gray-600">Notes:</span>
        {COINS.map((c) => (
          <button
            key={c}
            onClick={() => setCoin(c)}
            className={`px-3 py-2 rounded-xl text-sm border inline-flex items-center gap-2 ${
              coin === c ? "bg-sky-50 border-sky-300 text-sky-800" : "bg-white hover:bg-gray-50"
            }`}
          >
            <Coins className="w-4 h-4" />
            {f0(c)}
          </button>
        ))}
      </div>

      {/* Envelopes grid */}
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
                    <div className="text-[11px] text-gray-500 truncate">
                      Target {target ? f2(target) : "—"}
                    </div>
                  </div>
                </div>
                <button onClick={() => toggleLock(c.id)} className="p-1.5 rounded-lg hover:bg-white/60">
                  {isLocked ? <Lock className="w-4 h-4 text-gray-700" /> : <Unlock className="w-4 h-4 text-gray-500" />}
                </button>
              </div>

              {/* Envelope visual */}
              {/* Enhanced Envelope visual - REPLACE your current envelope visual */}
              <div className="h-24 relative rounded-xl overflow-hidden mb-3">
                {/* Envelope body */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200/60 rounded-xl shadow-inner">
                  
                  {/* Envelope flap - animated based on fullness */}
                  <div 
                    className="absolute inset-x-0 top-0 bg-gradient-to-b from-blue-200 to-blue-300 border-b border-blue-300 transition-all duration-500"
                    style={{ 
                      height: pct > 80 ? '8px' : '20px', // Flap closes as envelope fills
                      borderRadius: pct > 80 ? '12px 12px 4px 4px' : '12px 12px 8px 8px'
                    }}
                  />
                  
                  {/* Money/cash sticking out */}
                  <div className="absolute bottom-2 left-2 right-2 flex flex-wrap items-end gap-0.5">
                    {/* Generate cash bills based on amount */}
                    {Array.from({ 
                      length: Math.min(8, Math.floor(val / 50) + 1) 
                    }).map((_, i) => (
                      <div
                        key={i}
                        className="bg-gradient-to-b from-green-200 to-green-400 border border-green-300 rounded-sm shadow-sm transition-all duration-300"
                        style={{
                          width: `${12 + (i % 3) * 2}px`,
                          height: `${14 + (i % 2) * 4}px`,
                          transform: `translateY(${-i * 2}px) rotate(${(i % 3 - 1) * 8}deg)`,
                          zIndex: i,
                          opacity: pct > (i * 12.5) ? 1 : 0.3
                        }}
                      >
                        {/* £ symbol on bills */}
                        <div className="text-[8px] text-green-700 font-bold text-center leading-3">
                          £
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {/* Category emoji on envelope */}
                  <div className="absolute top-6 right-3 text-lg opacity-60">
                    {c.emoji}
                  </div>
                  
                  {/* Amount display */}
                  <div className="absolute bottom-1 left-1 text-[10px] font-medium text-blue-700">
                    {f0(val)}
                  </div>
                  
                  {/* Progress indicator */}
                  {target > 0 && (
                    <div className="absolute top-1 left-1 text-[10px] text-blue-600 font-medium">
                      {Math.round(pct)}%
                    </div>
                  )}
                  
                  {/* Envelope shine effect */}
                  <div className="absolute top-2 left-2 w-1 h-6 bg-gradient-to-b from-white/50 to-transparent rounded-full" />
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
