// components/doodle/TeamSkin.tsx

"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Users, Coins, Wand2, RefreshCw, Check, Lock, Unlock } from "lucide-react";
import { COINS, useDoodleEngine } from "./useDoodleEngine";
// import { useEnhancedBudget } from "@/components/HomeBudgetExtensions";
import { useHouseholdId, useHouseholdMembers } from "@/hooks/useHousehold";
import { useEnhancedBudget } from '@/components/HouseholdBudgetProvider';
type Member = { id: string; name: string; color: string; emoji?: string };
type PerUserDraft = Record<string /*memberId*/, Record<string /*categoryId*/, number>>;

const gbp0 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 });
const gbp2 = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: 2 });
const f0 = (n:number)=>gbp0.format(Math.round(n||0));
const f2 = (n:number)=>gbp2.format(n||0);

export default function TeamSkin() {
  const { categories } = useEnhancedBudget();
  const engine = useDoodleEngine();
  const {
    wallet, setWallet, remaining, assigned,
    draft, setDraft, locked, toggleLock,
    coin, setCoin, clampJar, autoSpreadRemaining,
    resetToCurrent, applyToRealBudget
  } = engine;

  // 🔗 Household members (live)
  const hid = useHouseholdId();
  const membersRaw = useHouseholdMembers(hid);

  // Map to local Member[] with sensible fallback if no household yet
  const members: Member[] = useMemo(() => {
    if (membersRaw.length) {
      return membersRaw.map(m => ({
        id: m.uid,
        name: m.displayName || "Member",
        color: m.color || "#0ea5e9",
        emoji: m.emoji || "👤",
      }));
    }
    // Solo fallback
    return [{ id: "solo", name: "You", color: "#0ea5e9", emoji: "🟦" }];
  }, [membersRaw]);

  // Active picker
  const [activeMemberId, setActiveMemberId] = useState<string>(members[0]?.id || "solo");
  useEffect(() => {
    // if members list changes, ensure activeMemberId is valid
    if (!members.find(m => m.id === activeMemberId)) {
      setActiveMemberId(members[0]?.id || "solo");
    }
  }, [members, activeMemberId]);

  // Per-user allocations — initialize whenever members OR category budgets change
  const initialPerUser: PerUserDraft = useMemo(() => {
    const base: PerUserDraft = {};
    members.forEach(m => (base[m.id] = {}));
    // split current targets equally across current members
    categories.forEach(c => {
      const target = Math.round(c.monthlyBudget || 0);
      const share = Math.floor(target / Math.max(1, members.length));
      members.forEach(m => (base[m.id][c.id] = share));
    });
    return base;
    // keys ensure re-seed on meaningful changes
  }, [
    members.map(m => m.id).join("|"),
    categories.map(c => `${c.id}:${c.monthlyBudget}`).join("|"),
  ]);

  const [perUser, setPerUser] = useState<PerUserDraft>(initialPerUser);
  // Re-seed state when initialPerUser changes (members/targets changed)
  useEffect(() => setPerUser(initialPerUser), [initialPerUser]);

  // Sum per category across members -> keep engine draft in sync
  const totalByCat: Record<string, number> = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const c of categories) {
      sum[c.id] = members.reduce((s, m) => s + (perUser[m.id]?.[c.id] || 0), 0);
    }
    return sum;
  }, [perUser, members, categories]);

  useEffect(() => {
    setDraft(totalByCat);
  }, [totalByCat, setDraft]);

  // Convenience
  const active = members.find(m => m.id === activeMemberId)!;

  // Bump one member’s share, clamped by engine (wallet & locks)
  const bumpMember = (memberId: string, catId: string, delta: number) => {
    setPerUser(prev => {
      const cur = prev[memberId]?.[catId] || 0;
      const nextForMember = Math.max(0, cur + delta);
      const nextSum = members.reduce(
        (s, m) => s + (m.id === memberId ? nextForMember : (prev[m.id]?.[catId] || 0)),
        0
      );
      clampJar(catId, nextSum);
      const clampedTotal = (engine.draft[catId] || 0);
      const others = members.reduce((s, m) => m.id === memberId ? s : s + (prev[m.id]?.[catId] || 0), 0);
      const finalMember = Math.max(0, clampedTotal - others);
      return { ...prev, [memberId]: { ...(prev[memberId] || {}), [catId]: finalMember } };
    });
  };

  const setMemberValue = (memberId: string, catId: string, raw: number) => {
    const value = Math.max(0, Math.round(Number(raw) || 0));
    setPerUser(prev => {
      const others = members.reduce((s, m) => m.id === memberId ? s : s + (prev[m.id]?.[catId] || 0), 0);
      clampJar(catId, others + value);
      const clampedTotal = (engine.draft[catId] || 0);
      const finalMember = Math.max(0, clampedTotal - others);
      return { ...prev, [memberId]: { ...(prev[memberId] || {}), [catId]: finalMember } };
    });
  };

  const avatar = (m: Member, isActive: boolean) => (
    <button
      key={m.id}
      onClick={() => setActiveMemberId(m.id)}
      className="px-2.5 py-1.5 rounded-xl border text-sm inline-flex items-center gap-2"
      style={{
        borderColor: isActive ? m.color : "#e5e7eb",
        background: isActive ? `${m.color}22` : "white",
        color: isActive ? "#111827" : "#374151",
      }}
      title={m.name}
    >
      <span className="text-lg">{m.emoji || "👤"}</span>
      {m.name}
    </button>
  );

  return (
    <div className="rounded-2xl bg-white/90 border border-gray-100 p-5 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 grid place-items-center shadow">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-semibold text-gray-900">Team Budget</div>
            <div className="text-xs text-gray-500">Each person funds categories; the sum becomes your monthly targets.</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="hidden sm:flex items-center gap-2 mr-2">
            {members.map(m => avatar(m, m.id === activeMemberId))}
          </div>

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
          <button onClick={autoSpreadRemaining} className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-2" title="Fill gaps proportionally to targets">
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

      {/* coin picker + compact member switch on mobile */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-600">Coins:</span>
        {COINS.map((c) => (
          <button
            key={c}
            onClick={() => setCoin(c)}
            className={`px-3 py-2 rounded-xl text-sm border inline-flex items-center gap-2 ${
              coin === c ? "bg-fuchsia-50 border-fuchsia-300 text-fuchsia-800" : "bg-white hover:bg-gray-50"
            }`}
          >
            <Coins className="w-4 h-4" />
            {f0(c)}
          </button>
        ))}
        <div className="sm:hidden ml-auto inline-flex gap-1">{members.map(m => avatar(m, m.id === activeMemberId))}</div>
      </div>

      {/* grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {categories.map((c) => {
          const totalVal = draft[c.id] || 0;
          const target = Math.max(0, c.monthlyBudget || 0);
          const pct = target > 0 ? Math.min(100, (totalVal / target) * 100) : 0;
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

              {/* stacked contributions */}
              <div className="h-4 w-full rounded-full bg-white border overflow-hidden mb-3 relative">
                <div className="absolute inset-y-0 left-0 bg-gray-200" style={{ width: `${Math.min(100, pct)}%` }} />
                <div className="absolute inset-y-0 left-0 flex">
                  {members.map((m) => {
                    const share = perUser[m.id]?.[c.id] || 0;
                    const widthPct = target ? Math.min(100, (share / target) * 100) : 0;
                    return (
                      <div key={m.id} title={`${m.name}: ${f0(share)}`} style={{ width: `${widthPct}%`, background: m.color }} />
                    );
                  })}
                </div>
              </div>

              {/* controls for active member */}
              <div className="flex items-center justify-between gap-2">
                <div className="inline-flex rounded-lg overflow-hidden border">
                  <button
                    onClick={() => !isLocked && bumpMember(activeMemberId, c.id, -coin)}
                    className="px-3 py-1.5 bg-white hover:bg-gray-50 text-sm disabled:opacity-50"
                    disabled={isLocked || (perUser[activeMemberId]?.[c.id] || 0) <= 0}
                  >
                    −{f0(coin)}
                  </button>
                  <button
                    onClick={() => !isLocked && bumpMember(activeMemberId, c.id, coin)}
                    className="px-3 py-1.5 bg-white hover:bg-gray-50 text-sm border-l disabled:opacity-50"
                    disabled={isLocked || remaining < coin}
                  >
                    +{f0(coin)}
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {members.map((m) => (
                    <div key={m.id} className="flex items-center gap-1">
                      <span className="text-xs" title={m.name}>{m.emoji ?? "👤"}</span>
                      <input
                        type="number"
                        className="w-20 px-2 py-1 border rounded-lg text-sm"
                        value={perUser[m.id]?.[c.id] || 0}
                        min={0}
                        onChange={(e) => !isLocked && setMemberValue(m.id, c.id, Number(e.target.value || 0))}
                        style={{ borderColor: m.color }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-2 text-xs text-gray-600 flex justify-between">
                <span>Total: <b>{f0(totalVal)}</b></span>
                <span>{target ? `${Math.round(pct)}% of target` : "No target set"}</span>
              </div>
            </div>
          );
        })}
      </div>

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
