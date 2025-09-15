
'use client';

import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, DollarSign,
  AlertTriangle, Target, RefreshCw, Search, CheckCircle, X,
  PauseCircle, PlayCircle,
} from "lucide-react";
import { motion } from 'framer-motion';


/**
 * Smart Financial Calendar — Fixed + polished + Fun Skin
 * - ✅ Fix: stray "the" before `const wantsSpent` (compile error)
 * - ✅ Finish Drawer UI (was truncated)
 * - ✅ Guard window listeners for SSR/Next.js
 * - ✅ Stable effect deps for plan allocation
 * - ✅ Minor a11y & styling tweaks
 * - ✅ NEW: Fun skin with confetti hooks
 */

type ItemType = "subscription" | "planned";
type Priority = "essential" | "savings" | "goals" | undefined;

type Item = {
  id: string;
  name: string;
  category:
    | "streaming"
    | "software"
    | "fitness"
    | "housing"
    | "food"
    | "savings"
    | "emergency"
    | "insurance"
    | "utilities"
    | "transport"
    | "entertainment"
    | "healthcare"
    | "other";
  cost: number;
  billingDate: number;
  emoji?: string;
  type: ItemType;
  priority?: Priority;
  savingOpportunity?: number;
  shiftIfWeekend?: boolean;
};

type Props = {
  monthlyIncome?: number;
  subscriptions?: Item[];
  planned?: Item[];
  skin?: 'classic' | 'fun';                       // ✅ NEW
  onTogglePause?: (id: string, nowPaused: boolean) => void; // ✅ NEW
  headerDecoration?: React.ReactNode;             // ✅ NEW
};

// ---- Demo data (safe defaults if no props passed) ----
const demoData: Required<Omit<Props, "subscriptions" | "planned" | "skin" | "onTogglePause" | "headerDecoration">> & {
  subscriptions: Item[];
  planned: Item[];
} = {
  monthlyIncome: 3500,
  subscriptions: [
    { id: "netflix", name: "Netflix", category: "streaming", cost: 18.99, billingDate: 27, emoji: "📺", type: "subscription", savingOpportunity: 0, shiftIfWeekend: true },
    { id: "spotify", name: "Spotify", category: "streaming", cost: 9.99, billingDate: 15, emoji: "🎵", type: "subscription", savingOpportunity: 0, shiftIfWeekend: false },
    { id: "virgin", name: "Virgin Active", category: "fitness", cost: 92.0, billingDate: 31, emoji: "💪", type: "subscription", savingOpportunity: 0, shiftIfWeekend: true },
    { id: "linkedin", name: "LinkedIn Premium", category: "software", cost: 29.99, billingDate: 7, emoji: "💼", type: "subscription", savingOpportunity: 29.99, shiftIfWeekend: true },
  ],
  planned: [
    { id: "rent", name: "Rent Payment", category: "housing", cost: 1200.0, billingDate: 1, emoji: "🏠", type: "planned", priority: "essential", shiftIfWeekend: true },
    { id: "groceries", name: "Groceries", category: "food", cost: 400.0, billingDate: 1, emoji: "🛒", type: "planned", priority: "essential", shiftIfWeekend: false },
    { id: "emergency", name: "Emergency Fund", category: "savings", cost: 300.0, billingDate: 1, emoji: "🏦", type: "planned", priority: "savings", shiftIfWeekend: false },
    { id: "holiday", name: "Holiday Fund", category: "savings", cost: 200.0, billingDate: 15, emoji: "✈️", type: "planned", priority: "goals", shiftIfWeekend: false },
    { id: "carins", name: "Car Insurance", category: "insurance", cost: 85.0, billingDate: 10, emoji: "🚗", type: "planned", priority: "essential", shiftIfWeekend: true },
  ],
};

// ---- Visual styles ----
const categoryChips: Record<string, string> = {
  streaming: "bg-purple-50 text-purple-800 ring-1 ring-purple-200",
  software: "bg-blue-50 text-blue-800 ring-1 ring-blue-200",
  fitness: "bg-green-50 text-green-800 ring-1 ring-green-200",
  housing: "bg-indigo-50 text-indigo-800 ring-1 ring-indigo-200",
  food: "bg-yellow-50 text-yellow-900 ring-1 ring-yellow-200",
  savings: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  emergency: "bg-red-50 text-red-800 ring-1 ring-red-200",
  insurance: "bg-orange-50 text-orange-800 ring-1 ring-orange-200",
  utilities: "bg-slate-50 text-slate-800 ring-1 ring-slate-200",
  transport: "bg-teal-50 text-teal-800 ring-1 ring-teal-200",
  entertainment: "bg-pink-50 text-pink-800 ring-1 ring-pink-200",
  healthcare: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
  other: "bg-gray-100 text-gray-800 ring-1 ring-gray-200",
};

const priorityBorders: Record<string, string> = {
  essential: "border-l-4 border-red-400",
  savings: "border-l-4 border-green-400",
  goals: "border-l-4 border-blue-400",
};

// ---- Utils ----
function getDaysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function isoWeekdayIndex(jsDay: number) { return (jsDay + 6) % 7; }
function firstWeekdayOfMonthMonday(y: number, m: number) { return isoWeekdayIndex(new Date(y, m, 1).getDay()); }
function clampBillingDay(y: number, m: number, d: number) { return Math.min(d, getDaysInMonth(y, m)); }
function shiftIfWeekendToBusinessDay(y: number, m: number, d: number) {
  const date = new Date(y, m, d);
  const jsDay = date.getDay(); // 0 Sun, 6 Sat
  if (jsDay === 0) date.setDate(d - 2); // Sun -> Fri
  else if (jsDay === 6) date.setDate(d - 1); // Sat -> Fri
  return date.getDate();
}
function formatGBP(a: number) { return `£${a.toFixed(2)}`; }
function intensityEmoji(a: number) {
  if (a === 0) return "";
  if (a < 100) return "💨";
  if (a < 500) return "⚡";
  if (a < 1000) return "🔥";
  return "💥";
}

// ✅ NEW: Fun skin heat map colors
const funHeat = (amt: number) => {
  if (amt === 0) return 'bg-white/80';
  if (amt < 100)  return 'bg-sky-50';
  if (amt < 500)  return 'bg-amber-50';
  if (amt < 1000) return 'bg-rose-50';
  return 'bg-fuchsia-50';
};

const classicHeat = (amt: number) =>
  amt >= 1000 ? 'bg-rose-50' : amt >= 500 ? 'bg-orange-50' : amt >= 100 ? 'bg-amber-50' : 'bg-white';

const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export default function SmartFinancialCalendar({
  monthlyIncome: monthlyIncomeProp,
  subscriptions: subsProp,
  planned: plannedProp,
  skin = 'classic',                               // ✅ NEW
  onTogglePause,                                  // ✅ NEW
  headerDecoration,                               // ✅ NEW
}: Props) {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [view, setView] = useState<"all" | "subscriptions" | "planned" | "essentials">("all");
  const [search, setSearch] = useState("");
  const [paused, setPaused] = useState<Set<string>>(() => new Set());
  const [drawerDay, setDrawerDay] = useState<null | { day: number; items: Item[] }>(null);
  const [compact, setCompact] = useState(false);
  const [budgetMethod, setBudgetMethod] = useState<"simple" | "detailed">("detailed");

  // Spending Plan state
  const [planMode, setPlanMode] = useState<"overall" | "discretionary">("overall");
  const [planTotal, setPlanTotal] = useState<number>(600);
  const [planAlloc, setPlanAlloc] = useState<Record<string, number>>({});

  const monthlyIncome = monthlyIncomeProp ?? demoData.monthlyIncome;
  const subscriptions = (subsProp ?? demoData.subscriptions) as Item[];
  const planned = (plannedProp ?? demoData.planned) as Item[];

  const year = currentDate.getFullYear();
  const monthIndex = currentDate.getMonth();

  const allItems = useMemo(() => [...subscriptions, ...planned], [subscriptions, planned]);

  const filterMatch = useCallback(
    (item: Item) => {
      if (paused.has(item.id)) return false;
      if (view === "subscriptions" && item.type !== "subscription") return false;
      if (view === "planned" && item.type !== "planned") return false;
      if (view === "essentials" && item.priority !== "essential") return false;
      if (search) {
        const hay = `${item.name} ${item.category} ${item.type}`.toLowerCase();
        if (!hay.includes(search.toLowerCase())) return false;
      }
      return true;
    },
    [view, search, paused]
  );

  const placedByDay = useMemo(() => {
    const days = getDaysInMonth(year, monthIndex);
    const map: Item[][] = Array.from({ length: days + 1 }, () => []);
    for (const it of allItems) {
      if (!filterMatch(it)) continue;
      const safe = clampBillingDay(year, monthIndex, Number(it.billingDate || 1));
      const final = it.shiftIfWeekend ? shiftIfWeekendToBusinessDay(year, monthIndex, safe) : safe;
      map[final].push(it);
    }
    return map;
  }, [allItems, year, monthIndex, filterMatch]);

  const totals = useMemo(() => {
    const days = getDaysInMonth(year, monthIndex);
    const perDay = Array.from({ length: days + 1 }, () => 0);
    let monthTotal = 0;
    let potentialSavings = 0;
    for (let d = 1; d <= days; d++) {
      const t = placedByDay[d].reduce((s, it) => s + (it.cost || 0), 0);
      perDay[d] = t;
      monthTotal += t;
      for (const it of placedByDay[d]) if (it.savingOpportunity) potentialSavings += it.savingOpportunity;
    }
    return { perDay, monthTotal, potentialSavings };
  }, [placedByDay, year, monthIndex]);

  const discretionary = monthlyIncome - totals.monthTotal;

  const savingsRate = useMemo(() => {
    const plannedSavings = allItems
      .filter((i) => i.priority === "savings" && !paused.has(i.id))
      .reduce((s, i) => s + i.cost, 0);
    return (plannedSavings / monthlyIncome) * 100;
  }, [allItems, paused, monthlyIncome]);

  // ---------- Budget computations ----------
  const spentDetailed = useMemo(() => {
    const s: Record<string, number> = {
      housing: 0,
      subscriptions: 0,
      transport: 0,
      food: 0,
      utilities: 0,
      entertainment: 0,
      insurance: 0,
      fitness: 0,
      healthcare: 0,
      savings: 0,
      emergency: 0,
      other: 0,
    };

    for (const it of allItems) {
      if (paused.has(it.id)) continue;
      if (it.type === "subscription") {
        s.subscriptions += Number(it.cost) || 0;
        if (it.category === "fitness") s.fitness += Number(it.cost) || 0; // surface fitness separately
        continue;
      }
      switch (it.category) {
        case "housing": s.housing += Number(it.cost) || 0; break;
        case "food": s.food += Number(it.cost) || 0; break;
        case "utilities": s.utilities += Number(it.cost) || 0; break;
        case "transport": s.transport += Number(it.cost) || 0; break;
        case "insurance": s.insurance += Number(it.cost) || 0; break;
        case "fitness": s.fitness += Number(it.cost) || 0; break;
        case "healthcare": s.healthcare += Number(it.cost) || 0; break;
        case "savings": s.savings += Number(it.cost) || 0; break;
        case "emergency": s.emergency += Number(it.cost) || 0; break;
        default: s.other += Number(it.cost) || 0; break;
      }
    }
    return s;
  }, [allItems, paused]);

  const budgetDefinitions = {
    simple: [
      { id: "needs", name: "Needs (Housing, Bills)", percentage: 50 },
      { id: "wants", name: "Wants (Subs, Fitness)", percentage: 30 },
      { id: "savings_group", name: "Savings & Emergency", percentage: 20 },
    ],
    detailed: [
      { id: "housing", name: "Housing & Rent", percentage: 25 },
      { id: "subscriptions", name: "Subscriptions", percentage: 8 },
      { id: "transport", name: "Transport", percentage: 15 },
      { id: "food", name: "Food & Groceries", percentage: 15 },
      { id: "utilities", name: "Utilities", percentage: 8 },
      { id: "entertainment", name: "Entertainment", percentage: 10 },
      { id: "healthcare", name: "Healthcare", percentage: 5 },
      { id: "savings", name: "Savings", percentage: 10 },
      { id: "emergency", name: "Emergency Fund", percentage: 4 },
    ],
  } as const;

  const budgetCategories = useMemo(() => {
    const defs = budgetDefinitions[budgetMethod];

    const valueFor = (id: string) => {
      if (budgetMethod === "simple") {
        if (id === "needs")
          return (
            spentDetailed.housing +
            spentDetailed.food +
            spentDetailed.utilities +
            spentDetailed.transport +
            spentDetailed.insurance +
            spentDetailed.healthcare
          );
        if (id === "wants")
          return (
            spentDetailed.subscriptions +
            spentDetailed.entertainment +
            spentDetailed.fitness +
            spentDetailed.other
          );
        if (id === "savings_group") return spentDetailed.savings + spentDetailed.emergency;
      }
      return (spentDetailed as any)[id] ?? 0;
    };

    return defs.map((cat) => ({
      ...cat,
      budget: (monthlyIncome * cat.percentage) / 100,
      spent: valueFor(cat.id),
    }));
  }, [budgetMethod, monthlyIncome, spentDetailed]);

  // ---------- Spending Plan (envelope) derivations ----------
  const budgetKey = useMemo(
    () => budgetCategories.map((c) => c.id).join("|"),
    [budgetCategories]
  );

  // initialize planAlloc to current categories if empty or when method changes
  useEffect(() => {
    setPlanAlloc((prev) => {
      const next: Record<string, number> = {};
      for (const cat of budgetCategories) next[cat.id] = prev[cat.id] ?? 0;
      return next;
    });
  }, [budgetKey, budgetCategories]);

  const setCatPlan = (id: string, val: number) =>
    setPlanAlloc((p) => ({ ...p, [id]: Math.max(0, Number.isFinite(val) ? val : 0) }));

  const plannedSum = useMemo(
    () => Object.values(planAlloc).reduce((s, n) => s + (Number(n) || 0), 0),
    [planAlloc]
  );

  // ✅ FIX: removed stray "the"
  const wantsSpent = useMemo(
    () => spentDetailed.subscriptions + spentDetailed.entertainment + spentDetailed.fitness + spentDetailed.other,
    [spentDetailed]
  );

  const spentAgainstPlan = planMode === "overall"
    ? budgetCategories.reduce((s, c) => s + c.spent, 0)
    : wantsSpent;

  const daysInMonth = getDaysInMonth(year, monthIndex);
  const monthProgress = useMemo(() => {
    const now = new Date();
    const sameMonth = now.getMonth() === monthIndex && now.getFullYear() === year;
    return Math.min(1, Math.max(0, sameMonth ? now.getDate() / daysInMonth : 1));
  }, [year, monthIndex, daysInMonth]);

  const expectedByNow = planTotal * monthProgress;
  const onPace = spentAgainstPlan <= expectedByNow + 1e-6;

  const totalBudget = useMemo(() => budgetCategories.reduce((s, c) => s + c.budget, 0), [budgetCategories]);
  const totalSpent = useMemo(() => budgetCategories.reduce((s, c) => s + c.spent, 0), [budgetCategories]);
  const categoriesOnTrack = useMemo(() => budgetCategories.filter(c => c.spent <= c.budget * 0.8).length, [budgetCategories]);
  const categoriesOver = useMemo(() => budgetCategories.filter(c => c.spent > c.budget).length, [budgetCategories]);

  const getStatusColor = (spent: number, budget: number) => {
    const pct = budget > 0 ? (spent / budget) * 100 : 0;
    if (pct <= 80) return "bg-green-500";
    if (pct <= 100) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getStatusIcon = (spent: number, budget: number) => {
    const pct = budget > 0 ? (spent / budget) * 100 : 0;
    if (pct <= 80) return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (pct <= 100) return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    return <AlertTriangle className="w-5 h-5 text-red-600" />;
  };

  const monthMatrix = useMemo(() => {
    const days = getDaysInMonth(year, monthIndex);
    const first = firstWeekdayOfMonthMonday(year, monthIndex);
    const rows: (number | null)[][] = [];
    let cursor = 1 - first; // may start negative
    for (let r = 0; r < 6; r++) {
      const row: (number | null)[] = [];
      for (let c = 0; c < 7; c++) {
        row.push(cursor >= 1 && cursor <= days ? cursor : null);
        cursor++;
      }
      rows.push(row);
    }
    return rows;
  }, [year, monthIndex]);

  const gotoMonth = (delta: number) =>
    setCurrentDate((prev) => {
      const d = new Date(prev);
      d.setMonth(prev.getMonth() + delta);
      return d;
    });

  const goToday = () => setCurrentDate(new Date());

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") gotoMonth(-1);
      if (e.key === "ArrowRight") gotoMonth(1);
      if (e.key.toLowerCase() === "t") goToday();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ✅ UPDATED: Add callback for confetti hooks
  const togglePause = (id: string) =>
    setPaused((p) => {
      const n = new Set(p);
      let nowPaused: boolean;
      if (n.has(id)) { 
        n.delete(id); 
        nowPaused = false; 
      } else { 
        n.add(id); 
        nowPaused = true; 
      }
      // notify parent
      onTogglePause?.(id, nowPaused);              // ✅ NEW
      return n;
    });

  // ✅ NEW: Tile class helper for skin switching
  const tileClass = (total: number, isToday: boolean) => {
    if (skin === 'fun') {
      return `relative ${compact ? 'h-24' : 'h-28'} p-2 border rounded-2xl ${funHeat(total)} text-left hover:shadow-sm focus-visible:ring-2 focus-visible:ring-blue-500 outline-none ${isToday ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`;
    }
    return `relative ${compact ? 'h-24' : 'h-28'} p-2 border ${classicHeat(total)} text-left hover:shadow-md focus-visible:ring-2 focus-visible:ring-blue-500 outline-none ${isToday ? 'ring-2 ring-blue-400 bg-blue-50' : ''}`;
  };

  // ---------- Export helpers ----------
  const flattenMonthItems = () => {
    const days = getDaysInMonth(year, monthIndex);
    const rows: Array<{
      date: Date;
      day: number;
      name: string;
      type: ItemType;
      category: Item["category"];
      priority?: Priority;
      cost: number;
      savingOpportunity?: number;
      id: string;
    }> = [];
    for (let d = 1; d <= days; d++) {
      for (const it of placedByDay[d]) {
        rows.push({
          id: it.id,
          date: new Date(year, monthIndex, d),
          day: d,
          name: it.name,
          type: it.type,
          category: it.category,
          priority: it.priority,
          cost: it.cost,
          savingOpportunity: it.savingOpportunity,
        });
      }
    }
    return rows;
  };

  const exportCSV = () => {
    const rows = flattenMonthItems();
    const header = ["Date","Day","Name","Type","Category","Priority","Cost","SavingOpportunity"];
    const csv = [header.join(",")]
      .concat(
        rows.map((r) =>
          [
            r.date.toISOString().slice(0, 10),
            r.day,
            `"${String(r.name).replace(/"/g, '""')}"`,
            r.type,
            r.category,
            r.priority ?? "",
            r.cost,
            r.savingOpportunity ?? 0,
          ].join(",")
        )
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-calendar-${year}-${String(monthIndex + 1).padStart(2, "0")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const escapeICS = (s: string) =>
    String(s)
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\n/g, "\\n");

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const icsDate = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;

  const exportICS = () => {
    const rows = flattenMonthItems();
    const dtstamp = `${year}${pad2(monthIndex + 1)}01T000000Z`;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "PRODID:-//VFIED//Financial Calendar//EN",
    ];
    rows.forEach((r, idx) => {
      const start = r.date as Date;
      const end = new Date(start); end.setDate(start.getDate() + 1); // all-day exclusive end
      const uid = `${idx}-${String(r.name).replace(/[^A-Za-z0-9]/g, "")}-${icsDate(start)}@vfied`;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${dtstamp}`,
        `DTSTART;VALUE=DATE:${icsDate(start)}`,
        `DTEND;VALUE=DATE:${icsDate(end)}`,
        `SUMMARY:${escapeICS(`${r.name} — £${Number(r.cost).toFixed(2)}`)}`,
        `DESCRIPTION:${escapeICS(`Type ${r.type}; Category ${r.category}; Priority ${r.priority || ""}; Potential Save £${Number(r.savingOpportunity || 0).toFixed(2)}`)}`,
        "BEGIN:VALARM",
        "TRIGGER:-P1D",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeICS(`${r.name} due tomorrow`)}`,
        "END:VALARM",
        "END:VEVENT"
      );
    });
    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-calendar-${year}-${String(monthIndex + 1).padStart(2, "0")}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  // ---------- Subcomponents ----------
  const DayCell = ({ day }: { day: number | null }) => {
    if (!day)
      return <div className={`${compact ? "h-24" : "h-28"} border border-gray-200 bg-gray-50`} />;

    const items = placedByDay[day];
    const total = totals.perDay[day] || 0;

    const now = new Date();
    const isToday =
      now.getDate() === day &&
      now.getMonth() === monthIndex &&
      now.getFullYear() === year;

    return (
      <motion.button
        whileHover={skin === 'fun' ? { scale: 1.02, rotate: -0.25 } : undefined}
        whileTap={skin === 'fun' ? { scale: 0.98 } : undefined}
        onClick={() => setDrawerDay({ day, items })}
        className={tileClass(total, isToday)}
        aria-label={`Day ${day}, total ${formatGBP(total)}`}
        role="gridcell"
      >
        {/* sticker dot for fun skin */}
        {skin === 'fun' && (
          <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-gradient-to-br from-yellow-200 to-pink-200 shadow border border-white rotate-[-6deg]" />
        )}

        <div className={`text-xs font-semibold mb-1 ${isToday ? "text-blue-700" : "text-gray-800"}`}>
          {day}
        </div>
        <div className="space-y-1 overflow-hidden">
          {items.slice(0, 3).map((it) => (
            <div
              key={it.id}
              className={`rounded-xl px-2 py-1 flex justify-between items-center ${
                skin === 'fun'
                  ? 'bg-white/70 backdrop-blur border border-white/60'
                  : (categoryChips[it.category] || 'bg-gray-100 text-gray-800')
              } ${it.priority && skin !== 'fun' ? priorityBorders[it.priority] : ''}`}
            >
              <div className="flex gap-1 items-center min-w-0">
                <span className="text-xs">{it.emoji}</span>
                <span className="text-[11px] truncate">{it.name}</span>
                {it.savingOpportunity && it.savingOpportunity > 0 && (
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                )}
              </div>
              <span className="text-[11px] font-semibold">{formatGBP(it.cost)}</span>
            </div>
          ))}
          {items.length > 3 && (
            <div className="text-[11px] text-gray-500 text-center">
              +{items.length - 3} more
            </div>
          )}
        </div>

        {total > 0 && (
          <div className={`absolute bottom-1 right-1 flex gap-1 items-center ${skin === 'fun' ? 'px-2 py-1 rounded-full bg-white/80 border border-white/70' : ''}`}>
            <span className="text-[11px] text-gray-700">{formatGBP(total)}</span>
            <span>{intensityEmoji(total)}</span>
          </div>
        )}
      </motion.button>
    );
  };

  // ✅ UPDATED: MonthHeader with decoration support
  const MonthHeader = () => {
    const ratio = monthlyIncome > 0 ? (totals.monthTotal / monthlyIncome) * 100 : 0;
    const pct = Math.min(100, Math.max(0, ratio));
    return (
      <div className="relative bg-white border-b border-gray-200 p-4 rounded-t-2xl overflow-hidden">
        {skin === 'fun' && headerDecoration /* ✅ will render from parent */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => gotoMonth(-1)} className="p-2 hover:bg-gray-100 rounded" aria-label="Previous month">
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h2 className="text-xl font-bold text-gray-900">
              {currentDate.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
            </h2>
            <button onClick={() => gotoMonth(1)} className="p-2 hover:bg-gray-100 rounded" aria-label="Next month">
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={goToday} className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded">
              Today
            </button>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="pl-8 pr-3 py-1.5 bg-gray-100 rounded text-sm"
                aria-label="Search items"
              />
            </div>
            <button
              onClick={() => setCompact((v) => !v)}
              className={`px-3 py-1.5 text-sm rounded border ${compact ? "bg-gray-800 text-white" : "bg-white text-gray-800"}`}
            >
              {compact ? "Comfort" : "Compact"}
            </button>
          </div>
        </div>
        <div className="relative z-10 mt-3 h-2 bg-gray-100 rounded" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-gradient-to-r from-blue-500 to-purple-600" style={{ width: `${pct}%` }} />
        </div>
        <div className="relative z-10 mt-1 text-xs text-gray-600">{pct.toFixed(1)}% of income committed</div>
      </div>
    );
  };

  // ---- Render ----
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-6">
          <div className="flex justify-between mb-6">
            <div className="flex gap-4 items-center">
              <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center">
                <CalendarIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Financial Calendar</h1>
                <p className="text-gray-600">Cashflow you can actually use</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{formatGBP(monthlyIncome)}</div>
              <div className="text-sm text-gray-500">Monthly Income</div>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm/5 font-medium opacity-90">Total Monthly</h3>
                  <p className="text-2xl font-bold">{formatGBP(totals.monthTotal)}</p>
                  <p className="text-xs opacity-75">{((totals.monthTotal / monthlyIncome) * 100).toFixed(1)}% of income</p>
                </div>
                <DollarSign className="w-8 h-8 opacity-80" />
              </div>
            </div>
            <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm/5 font-medium opacity-90">Available</h3>
                  <p className="text-2xl font-bold">{formatGBP(discretionary)}</p>
                  <p className="text-xs opacity-75">Discretionary spend</p>
                </div>
                <Target className="w-8 h-8 opacity-80" />
              </div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm/5 font-medium opacity-90">Savings Rate</h3>
                  <p className="text-2xl font-bold">{savingsRate.toFixed(1)}%</p>
                  <p className="text-xs opacity-75">Monthly target</p>
                </div>
                <RefreshCw className="w-8 h-8 opacity-80" />
              </div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm/5 font-medium opacity-90">Potential Savings</h3>
                  <p className="text-2xl font-bold">{formatGBP(totals.potentialSavings)}</p>
                  <p className="text-xs opacity-75">From optimisation</p>
                </div>
                <AlertTriangle className="w-8 h-8 opacity-80" />
              </div>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-2xl shadow">
          <MonthHeader />
          <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border-t">
            <button onClick={exportCSV} className="px-3 py-1.5 text-sm rounded-md border bg-white text-gray-800 hover:bg-gray-50">
              Export CSV
            </button>
            <button onClick={exportICS} className="px-3 py-1.5 text-sm rounded-md border bg-white text-gray-800 hover:bg-gray-50">
              Export ICS
            </button>

            {/* View filters */}
            <div className="ml-auto flex gap-2">
              {(["all","subscriptions","planned","essentials"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 text-sm rounded-md border ${view === v ? "bg-gray-900 text-white" : "bg-white text-gray-800 hover:bg-gray-50"}`}
                >
                  {v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Calendar */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">
          {/* Sticky weekday header */}
          <div className="grid grid-cols-7 sticky top-0 bg-gray-50 z-10">
            {weekdays.map((d) => (
              <div key={d} className="p-3 text-center font-semibold text-gray-700 border-b border-gray-200">
                {d}
              </div>
            ))}
          </div>
          {/* Days grid */}
          <div className="grid grid-cols-7" role="grid" aria-label="Monthly calendar">
            {monthMatrix.map((row, r) => (
              <React.Fragment key={r}>
                {row.map((day, c) => (
                  <DayCell key={`${r}-${c}`} day={day} />
                ))}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Budget Manager */}
        <div className="bg-white rounded-2xl shadow border p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
            <h3 className="text-xl font-bold text-gray-900">Budget Manager</h3>
            <div className="flex gap-2 items-center">
              <label className="text-sm text-gray-600">Method</label>
              <select
                value={budgetMethod}
                onChange={(e) => setBudgetMethod(e.target.value as any)}
                className="px-3 py-2 border rounded-md text-sm"
              >
                <option value="simple">50/30/20 (Simple)</option>
                <option value="detailed">Detailed (Categories)</option>
              </select>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600">Budget Utilisation</p>
                  <p className="text-xl font-bold text-blue-900">{totalBudget ? Math.round((totalSpent / totalBudget) * 100) : 0}%</p>
                </div>
                <DollarSign className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-green-600">On Track</p>
                  <p className="text-xl font-bold text-green-900">{categoriesOnTrack}</p>
                </div>
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600">Over Budget</p>
                  <p className="text-xl font-bold text-red-900">{categoriesOver}</p>
                </div>
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-purple-600">Remaining</p>
                  <p className="text-xl font-bold text-purple-900">{formatGBP(Math.max(0, totalBudget - totalSpent))}</p>
                </div>
                <Target className="w-6 h-6 text-purple-600" />
              </div>
            </div>
          </div>

          {/* Category Breakdown */}
          <div className="space-y-4">
            {budgetCategories.map((cat) => {
              const pct = cat.budget > 0 ? (cat.spent / cat.budget) * 100 : 0;
              const remaining = cat.budget - cat.spent;
              return (
                <div key={cat.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-gray-50 rounded-lg">{getStatusIcon(cat.spent, cat.budget)}</div>
                      <div>
                        <h4 className="font-medium text-gray-900">{cat.name}</h4>
                        <p className="text-sm text-gray-500">{cat.percentage}% of income ({formatGBP(cat.budget)})</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg text-gray-900">{formatGBP(cat.spent)}</p>
                      <p className={`${remaining >= 0 ? "text-green-600" : "text-red-600"} text-sm font-medium`}>
                        {remaining >= 0 ? `${formatGBP(remaining)} left` : `${formatGBP(Math.abs(remaining))} over`}
                      </p>
                    </div>
                  </div>
                  <div className="bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${getStatusColor(cat.spent, cat.budget)}`}
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-sm text-gray-500 mt-2">
                    <span>{Math.round(pct)}% used</span>
                    <span>{formatGBP(cat.budget)} budget</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Spending Plan (Envelope) */}
        <div className="bg-white rounded-2xl shadow border p-6">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
            <div>
              <h3 className="text-xl font-bold text-gray-900">Spending Plan</h3>
              <p className="text-sm text-gray-600">
                Set a monthly plan (e.g. £600) and allocate it across categories. Use the calendar to track how your real spend lines up.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex flex-col">
                <label className="text-sm text-gray-600">Plan total (£)</label>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={10}
                  value={planTotal}
                  onChange={(e) => setPlanTotal(Math.max(0, Number(e.target.value) || 0))}
                  className="px-3 py-2 border rounded-md w-40"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-sm text-gray-600">Scope</label>
                <select
                  value={planMode}
                  onChange={(e) => setPlanMode(e.target.value as any)}
                  className="px-3 py-2 border rounded-md"
                >
                  <option value="overall">Overall (all categories)</option>
                  <option value="discretionary">Discretionary only (wants)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Plan status */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-sky-50 p-4 rounded-lg">
              <div className="text-sky-700 text-sm">Allocated</div>
              <div className="text-2xl font-bold text-sky-900">{formatGBP(Math.max(0, plannedSum))}</div>
              <div className={`${planTotal - plannedSum >= 0 ? "text-sky-700" : "text-red-700"} text-sm`}>
                {planTotal - plannedSum >= 0
                  ? `${formatGBP(planTotal - plannedSum)} left to allocate`
                  : `${formatGBP(Math.abs(planTotal - plannedSum))} over plan`}
              </div>
            </div>
            <div className="bg-emerald-50 p-4 rounded-lg">
              <div className="text-emerald-700 text-sm">Spent in scope</div>
              <div className="text-2xl font-bold text-emerald-900">{formatGBP(spentAgainstPlan)}</div>
              <div className="text-emerald-700 text-sm">
                Scope: {planMode === "overall" ? "All categories" : "Subscriptions, Fitness, Entertainment, Other"}
              </div>
            </div>
            <div className="bg-amber-50 p-4 rounded-lg">
              <div className="text-amber-700 text-sm">Pace</div>
              <div className="text-2xl font-bold text-amber-900">{onPace ? "On track" : "Behind/Over"}</div>
              <div className="text-amber-700 text-sm">Expected by now: {formatGBP(expectedByNow)}</div>
            </div>
            <div className="bg-violet-50 p-4 rounded-lg">
              <div className="text-violet-700 text-sm">Month Progress</div>
              <div className="text-2xl font-bold text-violet-900">{Math.round(monthProgress * 100)}%</div>
              <div className="text-violet-700 text-sm">Days this month: {daysInMonth}</div>
            </div>
          </div>

          {/* Allocations table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm" role="table" aria-label="Spending plan allocations">
              <thead>
                <tr className="text-left text-gray-600">
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Spent</th>
                  <th className="py-2 pr-4">Plan (£)</th>
                  <th className="py-2 pr-4">Remaining</th>
                </tr>
              </thead>
              <tbody>
                {budgetCategories.map((cat) => {
                  const plan = planAlloc[cat.id] ?? 0;
                  const rem = Math.max(0, plan - cat.spent);
                  const warn = plan > 0 && cat.spent > plan;
                  const isDiscretionary =
                    budgetMethod === "simple"
                      ? cat.id === "wants"
                      : ["subscriptions", "entertainment", "fitness", "other"].includes(cat.id);
                  const disabled = planMode === "discretionary" && !isDiscretionary;
                  return (
                    <tr key={cat.id} className={disabled ? "opacity-50" : ""}>
                      <td className="py-2 pr-4 font-medium text-gray-900">{cat.name}</td>
                      <td className="py-2 pr-4">{formatGBP(cat.spent)}</td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          step={10}
                          value={plan}
                          onChange={(e) => setCatPlan(cat.id, Number(e.target.value) || 0)}
                          disabled={disabled}
                          className="px-2 py-1.5 border rounded w-32"
                          aria-label={`Plan for ${cat.name}`}
                        />
                      </td>
                      <td className={`py-2 pr-4 ${warn ? "text-red-600 font-semibold" : "text-gray-700"}`}>
                        {warn ? `Over by ${formatGBP(cat.spent - plan)}` : `${formatGBP(rem)} left`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2 mt-4">
            <button
              onClick={() => {
                // auto-distribute remaining proportionally to recent spend in-scope (or equal if all zero)
                const ids = budgetCategories.map((c) => c.id);
                const weights: Record<string, number> = {};
                let sumw = 0;
                for (const c of budgetCategories) {
                  const inScope =
                    planMode === "overall"
                      ? true
                      : budgetMethod === "simple"
                      ? c.id === "wants"
                      : ["subscriptions", "entertainment", "fitness", "other"].includes(c.id);
                  const w = inScope ? Math.max(0.01, c.spent) : 0; // epsilon avoids divide-by-zero
                  weights[c.id] = w; sumw += w;
                }
                const remaining = Math.max(0, planTotal - plannedSum);
                if (remaining <= 0 || sumw <= 0) return;
                setPlanAlloc((prev) => {
                  const next = { ...prev } as Record<string, number>;
                  for (const id of ids) {
                    if (weights[id] === 0) continue;
                    next[id] = (next[id] ?? 0) + (remaining * weights[id]) / sumw;
                  }
                  return next;
                });
              }}
              className="px-3 py-1.5 text-sm rounded-md border bg-white text-gray-800 hover:bg-gray-50"
            >
              Auto-distribute remaining
            </button>
            <button
              onClick={() => {
                const ids = budgetCategories.map((c) => c.id);
                setPlanAlloc(ids.reduce((acc, id) => ({ ...acc, [id]: 0 }), {} as Record<string, number>));
              }}
              className="px-3 py-1.5 text-sm rounded-md border bg-white text-gray-800 hover:bg-gray-50"
            >
              Reset allocations
            </button>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {drawerDay && (
        <div className="fixed inset-0 z-40 flex" role="dialog" aria-modal="true" aria-label={`Items for day ${drawerDay.day}`}>
          <div className="flex-1 bg-black/40" onClick={() => setDrawerDay(null)} aria-hidden="true" />
          <div className="w-full max-w-md bg-white h-full shadow-xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">Day {drawerDay.day}</h3>
              <button className="p-2 rounded hover:bg-gray-100" onClick={() => setDrawerDay(null)} aria-label="Close drawer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              {drawerDay.items.map((it) => {
                const pausedFlag = paused.has(it.id);
                return (
                  <div
                    key={it.id}
                    className={`border rounded-lg p-3 flex items-center justify-between ${it.priority ? priorityBorders[it.priority] : ""}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base">{it.emoji}</span>
                        <p className="font-medium text-gray-900 truncate">{it.name}</p>
                      </div>
                      <p className="text-sm text-gray-600">
                        {it.type} • <span className="capitalize">{it.category}</span> • {formatGBP(it.cost)}
                        {it.savingOpportunity ? ` • Save up to ${formatGBP(it.savingOpportunity)}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => togglePause(it.id)}
                        className={`px-2.5 py-1.5 text-sm rounded-md border ${pausedFlag ? "bg-amber-100 text-amber-900 border-amber-200" : "bg-white text-gray-800 hover:bg-gray-50"}`}
                        aria-pressed={pausedFlag}
                        aria-label={pausedFlag ? "Resume item" : "Pause item"}
                        title={pausedFlag ? "Resume item" : "Pause item"}
                      >
                        {pausedFlag ? <PlayCircle className="w-4 h-4 inline" /> : <PauseCircle className="w-4 h-4 inline" />}{" "}
                        {pausedFlag ? "Resume" : "Pause"}
                      </button>
                    </div>
                  </div>
                );
              })}
              {drawerDay.items.length === 0 && (
                <p className="text-sm text-gray-600">No items on this day.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}