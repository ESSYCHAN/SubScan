// components/GroupedBudgetSheet.tsx
// components/GroupedBudgetSheet.tsx
"use client";

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Filter, X, AlertTriangle } from "lucide-react";

import { useEnhancedBudget, type BudgetCategory } from "@/components/HouseholdBudgetProvider";

const fmt = (n: number) => `£${(n || 0).toFixed(2)}`;

const groups: Array<{ key: BudgetCategory["type"]; label: string }> = [
  { key: "essential", label: "Essentials" },
  { key: "lifestyle", label: "Lifestyle" },
  { key: "savings", label: "Savings" },
  { key: "debt", label: "Debt" },
];

type FilterState = {
  showOver?: boolean;
  showUnused?: boolean;
  query?: string;
};

export default function GroupedBudgetSheet() {
  const { categories, updateCategory, deleteCategory, createCategory } = useEnhancedBudget();

  // UI state
  const [open, setOpen] = useState<Record<BudgetCategory["type"], boolean>>({
    essential: true,
    lifestyle: true,
    savings: true,
    debt: true,
  });
  const [filters, setFilters] = useState<FilterState>({ showOver: false, showUnused: false, query: "" });

  // Derived totals overall
  const overall = useMemo(() => {
    const totalBudget = categories.reduce((s, c) => s + (c.monthlyBudget || 0), 0);
    const totalSpent = categories.reduce((s, c) => s + (c.spent || 0), 0);
    return { totalBudget, totalSpent, remaining: totalBudget - totalSpent };
  }, [categories]);

  // Filtered by chips / search
  const filtered = useMemo(() => {
    let list = categories;
    if (filters.query?.trim()) {
      const q = filters.query.toLowerCase();
      list = list.filter((c) => `${c.name} ${c.type}`.toLowerCase().includes(q));
    }
    if (filters.showOver) list = list.filter((c) => (c.spent || 0) > (c.monthlyBudget || 0));
    if (filters.showUnused) list = list.filter((c) => (c.spent || 0) === 0);
    return list;
  }, [categories, filters]);

  // Group rows
  const rowsByGroup = useMemo(() => {
    const map: Record<BudgetCategory["type"], BudgetCategory[]> = {
      essential: [],
      lifestyle: [],
      savings: [],
      debt: [],
    };
    filtered.forEach((c) => map[c.type].push(c));
    return map;
  }, [filtered]);

  const statusPill = (c: BudgetCategory) => {
    const b = c.monthlyBudget || 0;
    const s = c.spent || 0;
    if (b === 0 && s === 0) {
      return <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">Unbudgeted</span>;
    }
    if (s <= b * 0.75) {
      return <span className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-700">On track</span>;
    }
    if (s <= b) {
      return <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700">Tight</span>;
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-700">
        <AlertTriangle className="w-3 h-3" />
        Over
      </span>
    );
  };

  const quickAddPresets: Record<
    BudgetCategory["type"],
    Array<{ name: string; emoji: string; hint?: string; budget?: number }>
  > = {
    essential: [
      { name: "Groceries & Food", emoji: "🛒", hint: "Weekly shop & meal prep", budget: 400 },
      { name: "Utilities (Gas/Electric)", emoji: "⚡", hint: "Energy bills", budget: 120 },
      { name: "Internet & Phone", emoji: "📶", hint: "Broadband & mobile", budget: 60 },
    ],
    lifestyle: [
      { name: "Dining Out", emoji: "🍽️", hint: "Restaurants & coffee", budget: 150 },
      { name: "Subscriptions", emoji: "📺", hint: "Streaming & apps", budget: 80 },
    ],
    savings: [
      { name: "Emergency Fund", emoji: "🆘", hint: "3–6 months buffer", budget: 200 },
      { name: "Holiday", emoji: "✈️", hint: "Trips & breaks", budget: 100 },
    ],
    debt: [{ name: "Credit Card", emoji: "💳", hint: "Monthly payment", budget: 150 }],
  };

  async function quickAdd(
    type: BudgetCategory["type"],
    preset: { name: string; emoji: string; hint?: string; budget?: number }
  ) {
    await createCategory({
      name: preset.name,
      emoji: preset.emoji,
      color: "#6366f1",
      type,
      monthlyBudget: preset.budget ?? 0,

      description: preset.hint,
    });
  }

  const Section = ({
    type,
    title,
    items,
  }: {
    type: BudgetCategory["type"];
    title: string;
    items: BudgetCategory[];
  }) => {
    const subBudget = items.reduce((s, c) => s + (c.monthlyBudget || 0), 0);
    const subSpent = items.reduce((s, c) => s + (c.spent || 0), 0);
    const subRemain = subBudget - subSpent;

    return (
      <div className="rounded-2xl border bg-white overflow-hidden">
        {/* Header */}
        <button
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border-b"
          onClick={() => setOpen((o) => ({ ...o, [type]: !o[type] }))}
        >
          <div className="flex items-center gap-2">
            {open[type] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <span className="font-semibold text-gray-900">{title}</span>
            <span className="ml-2 text-xs text-gray-600">
              {fmt(subSpent)} / {fmt(subBudget)} • <b>{fmt(subRemain)}</b> left
            </span>
          </div>
          <div className="text-xs text-gray-500">Subtotal</div>
        </button>

        {/* Body */}
        {open[type] && (
          <div className="relative">
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="text-left">
                    <th className="px-4 py-2 w-8" />
                    <th className="px-4 py-2">Category</th>
                    <th className="px-4 py-2">Monthly Budget</th>
                    <th className="px-4 py-2">Spent</th>
                    <th className="px-4 py-2">Remaining</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => {
                    const remaining = (c.monthlyBudget || 0) - (c.spent || 0);
                    const pct = c.monthlyBudget ? Math.min(100, (c.spent / c.monthlyBudget) * 100) : 0;

                    return (
                      <React.Fragment key={c.id}>
                        <tr className="border-t align-middle">
                          <td className="px-4 py-2 text-lg">{c.emoji}</td>
                          <td className="px-4 py-2">
                            <InlineEdit
                              value={c.name}
                              onSave={(v) => updateCategory(c.id, { name: v })}
                              sub={c.description}
                            />
                          </td>
                          <td className="px-4 py-2">
                            <InlineEdit
                              value={String(c.monthlyBudget ?? 0)}
                              type="number"
                              onSave={(v) => updateCategory(c.id, { monthlyBudget: Number(v || "0") })}
                            />
                          </td>
                          <td className="px-4 py-2 text-gray-700">{fmt(c.spent || 0)}</td>
                          <td className="px-4 py-2">{fmt(remaining)}</td>
                          <td className="px-4 py-2">{statusPill(c)}</td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={() => deleteCategory(c.id)}
                              className="p-1 rounded hover:bg-gray-100 text-rose-600"
                              title="Delete"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>

                        {/* ✅ separate row for the progress bar */}
                        <tr>
                          <td colSpan={7} className="px-4 pb-3">
                            <div className="mt-2 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-gray-900" style={{ width: `${pct}%` }} />
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}

                  {/* Quick add presets */}
                  <tr className="border-t bg-gray-50/60">
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2" colSpan={5}>
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-gray-600">Quick add:</span>
                        {quickAddPresets[type].map((p) => (
                          <button
                            key={p.name}
                            onClick={() => quickAdd(type, p)}
                            className="px-2 py-1 rounded-full border bg-white hover:bg-gray-50"
                            title={p.hint}
                          >
                            <span className="mr-1">{p.emoji}</span>
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => quickAdd(type, { name: "New category", emoji: "💰", budget: 0 })}
                        className="px-2 py-1 rounded-lg border bg-white hover:bg-gray-50 text-sm"
                      >
                        <Plus className="w-4 h-4 inline -mt-0.5 mr-1" />
                        Add
                      </button>
                    </td>
                  </tr>
                </tbody>

                {/* Sticky footer (section subtotal) */}
                <tfoot className="sticky bottom-0 bg-white border-t">
                  <tr>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2 text-sm text-gray-600">Section subtotal</td>
                    <td className="px-4 py-2 font-medium">{fmt(subBudget)}</td>
                    <td className="px-4 py-2 font-medium">{fmt(subSpent)}</td>
                    <td className="px-4 py-2 font-medium">{fmt(subRemain)}</td>
                    <td className="px-4 py-2" />
                    <td className="px-4 py-2" />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-white/90 backdrop-blur border border-gray-100 shadow-sm p-5 space-y-4">
      {/* Header / filters */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div className="font-semibold text-gray-900">Budget (grouped)</div>
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Filter className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
            <input
              placeholder="Search category…"
              className="pl-8 pr-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filters.query}
              onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))}
            />
          </div>
          <Toggle
            checked={!!filters.showOver}
            onChange={(v) => setFilters((f) => ({ ...f, showOver: v }))}
            label="Only over-budget"
          />
          <Toggle
            checked={!!filters.showUnused}
            onChange={(v) => setFilters((f) => ({ ...f, showUnused: v }))}
            label="Only unused"
          />
        </div>
      </div>

      {/* Overall KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KPI label="Monthly Budget" value={fmt(overall.totalBudget)} />
        <KPI label="Spent" value={fmt(overall.totalSpent)} />
        <KPI label="Remaining" value={fmt(overall.remaining)} />
      </div>

      {/* Sections */}
      <div className="space-y-4">
        {groups.map((g) => {
          const items = rowsByGroup[g.key];
          if (!items?.length) return null;
          return <Section key={g.key} type={g.key} title={g.label} items={items} />;
        })}
      </div>
    </div>
  );
}

/* ----------------------------- little helpers ----------------------------- */

function InlineEdit({
  value,
  onSave,
  type = "text",
  sub,
}: {
  value: string;
  onSave: (v: string) => void;
  type?: "text" | "number";
  sub?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);

  const commit = () => {
    setEditing(false);
    if (v !== value) onSave(v);
  };

  return (
    <div>
      {editing ? (
        <input
          autoFocus
          className="w-full border rounded px-2 py-1 text-sm"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") commit();
            if (e.key === "Escape") {
              setV(value);
              setEditing(false);
            }
          }}
          type={type}
        />
      ) : (
        <button
          className="w-full text-left hover:bg-gray-50 rounded px-1"
          onClick={() => setEditing(true)}
          title="Click to edit"
        >
          <div className="font-medium">{value}</div>
          {sub && <div className="text-xs text-gray-500 truncate">{sub}</div>}
        </button>
      )}
    </div>
  );
}

function KPI({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl p-4 bg-gradient-to-r from-gray-900 to-gray-800 text-white">
      <div className="text-xs/5 opacity-80">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`px-3 py-2 rounded-xl text-sm border ${
        checked ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-white hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}
