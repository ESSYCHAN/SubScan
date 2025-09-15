// components/HomeBudgetExtensions.tsx
// components/HomeBudgetExtensions.tsx
"use client";

import React, { useMemo, useState } from "react";
import {
  CalendarPlus, Download, Plus, Tags, Wallet, TrendingUp,
  TrendingDown, AlertCircle, CheckCircle, Edit3, Trash2,
  Calculator, PieChart, BarChart3, ArrowUpDown, Filter,
  Home, Car, Utensils, Zap, Plane, ShoppingCart, CreditCard,
  Phone, Wifi, Droplets, FileText, Heart, GraduationCap,
  Coffee, Gift
} from "lucide-react";

import { useEnhancedBudget } from "@/components/HouseholdBudgetProvider";
import DoodleBudget from "@/components/DoodleBudget";
import GroupedBudgetSheet from "@/components/GroupedBudgetSheet";
import EnvelopesSkin from "@/components/doodle/EnvelopesSkin";
import PlantsSkin from "@/components/doodle/PlantsSkin";
import TeamSkin from "@/components/doodle/TeamSkin";

// Simple tab switcher util
type TabKey = "budget" | "mortgage" | "doodle" | "envelopes" | "plants" | "team";

/**
 * Enhanced Home Budget - Excel-like UX for household finances
 * Uses Firestore-backed context from HouseholdBudgetProvider
 */

// Types (UI-level)
export type BudgetCategory = {
  id: string;
  name: string;
  emoji: string;
  color: string;
  type: "essential" | "lifestyle" | "savings" | "debt";
  monthlyBudget: number;
  spent: number; // derived in provider; not persisted
  description?: string;
};

export type Transaction = {
  id: string;
  title: string;
  amount: number;
  categoryId: string;
  date: string;
  type: "expense" | "income";
  recurring?: "none" | "weekly" | "monthly" | "quarterly" | "annual";
  notes?: string;
  tags?: string[];
  receipts?: string[];
};

export type SavingsGoal = {
  id: string;
  name: string;
  target: number;
  current: number;
  deadline: string;
  emoji: string;
  color: string;
};

// Utility components (SubScan style)
const Card = ({
  title,
  icon,
  action,
  className = "",
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) => (
  <div
    className={`rounded-2xl bg-white/90 backdrop-blur border border-gray-100 shadow-[0_1px_0_rgba(0,0,0,0.02)] p-5 ${className}`}
  >
    <header className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5 text-gray-900 font-semibold">
        {icon && <span className="text-gray-700">{icon}</span>}
        <span>{title}</span>
      </div>
      {action}
    </header>
    {children}
  </div>
);

const PrimaryButton = ({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...rest}
    className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-black disabled:opacity-50 transition-colors ${className}`}
  >
    {children}
  </button>
);

const SecondaryButton = ({
  children,
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...rest}
    className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 hover:bg-gray-50 transition-colors ${className}`}
  >
    {children}
  </button>
);

/* ----------------------- Overview KPIs ----------------------- */
function BudgetOverview() {
  const { categories, goals } = useEnhancedBudget();

  const stats = useMemo(() => {
    const totalBudget = categories.reduce((s, c) => s + (c.monthlyBudget || 0), 0);
    const totalSpent = categories.reduce((s, c) => s + (c.spent || 0), 0);
    const remaining = totalBudget - totalSpent;

    const essential = categories.filter((c) => c.type === "essential");
    const essentialSpent = essential.reduce((s, c) => s + (c.spent || 0), 0);
    const essentialBudget = essential.reduce((s, c) => s + (c.monthlyBudget || 0), 0);

    return { totalBudget, totalSpent, remaining, essentialSpent, essentialBudget };
  }, [categories]);

  const gbp = (n: number) => `£${(n || 0).toFixed(2)}`;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm/5 opacity-90">Monthly Budget</p>
            <p className="text-2xl font-bold">{gbp(stats.totalBudget)}</p>
            <p className="text-xs opacity-75">{categories.length} categories</p>
          </div>
          <Calculator className="w-8 h-8 opacity-90" />
        </div>
      </div>

      <div
        className={`rounded-2xl p-5 text-white ${
          stats.remaining >= 0
            ? "bg-gradient-to-r from-green-500 to-green-600"
            : "bg-gradient-to-r from-red-500 to-red-600"
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm/5 opacity-90">Remaining</p>
            <p className="text-2xl font-bold">{gbp(stats.remaining)}</p>
            <p className="text-xs opacity-75">
              {stats.totalBudget ? ((1 - stats.totalSpent / stats.totalBudget) * 100).toFixed(1) : "0.0"}% left
            </p>
          </div>
          {stats.remaining >= 0 ? (
            <TrendingUp className="w-8 h-8 opacity-90" />
          ) : (
            <TrendingDown className="w-8 h-8 opacity-90" />
          )}
        </div>
      </div>

      <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm/5 opacity-90">Essential Expenses</p>
            <p className="text-2xl font-bold">{gbp(stats.essentialSpent)}</p>
            <p className="text-xs opacity-75">
              {stats.essentialBudget ? ((stats.essentialSpent / stats.essentialBudget) * 100).toFixed(1) : "0.0"}% of essential budget
            </p>
          </div>
          <Home className="w-8 h-8 opacity-90" />
        </div>
      </div>

      <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm/5 opacity-90">Savings Goals</p>
            <p className="text-2xl font-bold">{goals.length}</p>
            <p className="text-xs opacity-75">
              {gbp(goals.reduce((s, g) => s + (g.current || 0), 0))} saved
            </p>
          </div>
          <PieChart className="w-8 h-8 opacity-90" />
        </div>
      </div>
    </div>
  );
}

/* ----------------------- Category Manager ----------------------- */
function CategoryManager() {
  const { categories, updateCategory, deleteCategory, createCategory } = useEnhancedBudget();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newCategory, setNewCategory] = useState<Partial<BudgetCategory>>({});
  const [showAddForm, setShowAddForm] = useState(false);

  const gbp = (n: number) => `£${(n || 0).toFixed(2)}`;

  const statusClass = (spent: number, budget: number) => {
    const pct = budget ? (spent / budget) * 100 : 0;
    if (pct > 100) return "bg-red-50 border-red-200";
    if (pct > 80) return "bg-amber-50 border-amber-200";
    return "bg-green-50 border-green-200";
  };

  const handleSave = async () => {
    if (newCategory.name && typeof newCategory.monthlyBudget === "number") {
      await createCategory({
        name: newCategory.name,
        emoji: newCategory.emoji || "💰",
        color: newCategory.color || "#6366f1",
        type: (newCategory.type as BudgetCategory["type"]) || "essential",
        monthlyBudget: newCategory.monthlyBudget,
        // NOTE: 'spent' is derived in provider, not persisted
        description: newCategory.description || "",
      } as any);
      setNewCategory({});
      setShowAddForm(false);
    }
  };

  return (
    <Card
      title="Budget Categories"
      icon={<Tags className="w-5 h-5" />}
      action={
        <SecondaryButton onClick={() => setShowAddForm(true)}>
          <Plus className="w-4 h-4" />
          Add Category
        </SecondaryButton>
      }
    >
      {showAddForm && (
        <div className="mb-4 p-4 rounded-xl border border-gray-200 bg-gray-50">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <input
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
              placeholder="Category name"
              value={newCategory.name || ""}
              onChange={(e) => setNewCategory((p) => ({ ...p, name: e.target.value }))}
            />
            <input
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm text-center"
              placeholder="🏠"
              value={newCategory.emoji || ""}
              onChange={(e) => setNewCategory((p) => ({ ...p, emoji: e.target.value }))}
            />
            <input
              type="number"
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
              placeholder="Monthly budget"
              value={newCategory.monthlyBudget ?? ""}
              onChange={(e) => setNewCategory((p) => ({ ...p, monthlyBudget: Number(e.target.value) }))}
            />
            <select
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm"
              value={newCategory.type || "essential"}
              onChange={(e) => setNewCategory((p) => ({ ...p, type: e.target.value as any }))}
            >
              <option value="essential">Essential</option>
              <option value="lifestyle">Lifestyle</option>
              <option value="savings">Savings</option>
              <option value="debt">Debt</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <SecondaryButton onClick={() => setShowAddForm(false)}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSave}>Add Category</PrimaryButton>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {categories.map((c) => {
          const pct = c.monthlyBudget ? (c.spent / c.monthlyBudget) * 100 : 0;
          const over = pct > 100;
          return (
            <div
              key={c.id}
              className={`rounded-xl border p-4 transition-all ${statusClass(c.spent, c.monthlyBudget)}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span className="text-2xl">{c.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">{c.name}</h3>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.type === "essential"
                            ? "bg-blue-100 text-blue-700"
                            : c.type === "lifestyle"
                            ? "bg-purple-100 text-purple-700"
                            : c.type === "savings"
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {c.type}
                      </span>
                    </div>
                    {c.description && (
                      <p className="text-sm text-gray-600 truncate">{c.description}</p>
                    )}

                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="font-medium">
                        {gbp(c.spent)} / {gbp(c.monthlyBudget)}
                      </span>
                      <span className={`font-medium ${over ? "text-red-600" : "text-gray-600"}`}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>

                    <div className="w-full bg-white/70 rounded-full h-2 mt-2 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${
                          over ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-green-500"
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 ml-4">
                  {over && <AlertCircle className="w-5 h-5 text-red-500" />}
                  {pct < 50 && <CheckCircle className="w-5 h-5 text-green-500" />}
                  <button
                    onClick={() => {
                      // quick edit demo: bump budget by £10
                      const next = (c.monthlyBudget || 0) + 10;
                      updateCategory(c.id, { monthlyBudget: next });
                    }}
                    className="p-2 rounded-lg hover:bg-white/50 transition-colors"
                    title="+£10 to budget"
                  >
                    <Edit3 className="w-4 h-4 text-gray-600" />
                  </button>
                  <button
                    onClick={() => deleteCategory(c.id)}
                    className="p-2 rounded-lg hover:bg-white/50 transition-colors text-red-600"
                    title="Delete category"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ----------------------- Quick Expense Entry ----------------------- */
function QuickExpenseEntry() {
  const { categories, addTransaction } = useEnhancedBudget();
  const [expense, setExpense] = useState({
    title: "",
    amount: "",
    categoryId: "",
    date: new Date().toISOString().slice(0, 10),
    notes: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expense.title || !expense.amount || !expense.categoryId) return;

    await addTransaction({
      title: expense.title,
      amount: Number(expense.amount),
      categoryId: expense.categoryId,
      date: expense.date,
      type: "expense",
      notes: expense.notes,
      recurring: "none",
    });

    setExpense({
      title: "",
      amount: "",
      categoryId: "",
      date: new Date().toISOString().slice(0, 10),
      notes: "",
    });
  };

  return (
    <Card title="Quick Expense Entry" icon={<CreditCard className="w-5 h-5" />}>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            placeholder="What did you buy?"
            value={expense.title}
            onChange={(e) => setExpense((p) => ({ ...p, title: e.target.value }))}
            required
          />
          <input
            type="number"
            step="0.01"
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            placeholder="£0.00"
            value={expense.amount}
            onChange={(e) => setExpense((p) => ({ ...p, amount: e.target.value }))}
            required
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <select
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            value={expense.categoryId}
            onChange={(e) => setExpense((p) => ({ ...p, categoryId: e.target.value }))}
            required
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
            value={expense.date}
            onChange={(e) => setExpense((p) => ({ ...p, date: e.target.value }))}
          />
        </div>

        <input
          className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"
          placeholder="Notes (optional)"
          value={expense.notes}
          onChange={(e) => setExpense((p) => ({ ...p, notes: e.target.value }))}
        />

        <PrimaryButton type="submit" className="w-full">
          <Plus className="w-4 h-4" />
          Add Expense
        </PrimaryButton>
      </form>
    </Card>
  );
}

/* ----------------------- Savings Goals ----------------------- */
function SavingsGoals() {
  const { goals } = useEnhancedBudget();
  const gbp = (n: number) => `£${n.toLocaleString()}`;

  return (
    <Card title="Savings Goals" icon={<PieChart className="w-5 h-5" />}>
      <div className="space-y-4">
        {goals.map((g) => {
          const pct = g.target ? (g.current / g.target) * 100 : 0;
          const remaining = Math.max(0, g.target - g.current);
          const deadline = new Date(g.deadline);
          const monthsLeft = Math.ceil(
            (deadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30)
          );
          const monthlyTarget = monthsLeft > 0 ? remaining / monthsLeft : remaining;

          return (
            <div key={g.id} className="p-4 rounded-xl border border-gray-200 bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{g.emoji}</span>
                  <h4 className="font-semibold text-gray-900">{g.name}</h4>
                </div>
                <span className="text-sm font-medium text-gray-600">{pct.toFixed(1)}%</span>
              </div>

              <div className="w-full bg-white rounded-full h-3 mb-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-500 to-purple-600 transition-all duration-500"
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>

              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>{gbp(g.current)} saved</span>
                <span>{gbp(g.target)} target</span>
              </div>

              <div className="flex justify-between items-center text-xs text-gray-500">
                <span>{gbp(remaining)} remaining</span>
                <span>{gbp(monthlyTarget)}/month needed</span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ----------------------- Mortgage Helper ----------------------- */
function MortgageTab() {
  const { categories, createCategory, updateCategory } = useEnhancedBudget();
  const [amount, setAmount] = useState("250000");
  const [apr, setApr] = useState("4.5"); // %
  const [years, setYears] = useState("25");
  const [overpay, setOverpay] = useState("0");

  const calc = useMemo(() => {
    const P = Number(amount) || 0;
    const r = ((Number(apr) || 0) / 100) / 12;
    const n = (Number(years) || 0) * 12;
    if (P <= 0 || r <= 0 || n <= 0) return { monthly: 0, interest: 0, total: 0 };

    const base = (P * r) / (1 - Math.pow(1 + r, -n));
    const monthly = base + (Number(overpay) || 0);
    const total = monthly * n;
    const interest = total - P;
    return { monthly, interest, total };
  }, [amount, apr, years, overpay]);

  async function addToBudget() {
    const monthly = Number(calc.monthly.toFixed(2));
    const existing = categories.find((c) => c.name === "Mortgage");
    if (existing) {
      await updateCategory(existing.id, {
        monthlyBudget: monthly,
        type: "essential",
        emoji: "🏠",
        color: "#0ea5e9",
      });
    } else {
      await createCategory({
        name: "Mortgage",
        emoji: "🏠",
        color: "#0ea5e9",
        type: "essential",
        monthlyBudget: monthly,
        description: "Home loan payment",
      } as any);
    }
  }

  return (
    <Card title="Mortgage (simple)" icon={<FileText className="w-5 h-5" />}>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <input
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
          type="number"
          min={0}
          placeholder="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
          type="number"
          step="0.01"
          min={0}
          placeholder="APR %"
          value={apr}
          onChange={(e) => setApr(e.target.value)}
        />
        <input
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
          type="number"
          min={1}
          placeholder="Years"
          value={years}
          onChange={(e) => setYears(e.target.value)}
        />
        <input
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm"
          type="number"
          min={0}
          placeholder="Overpay (opt.)"
          value={overpay}
          onChange={(e) => setOverpay(e.target.value)}
        />
        <PrimaryButton onClick={addToBudget} className="w-full">
          Add to Budget
        </PrimaryButton>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-blue-50 border border-blue-100 p-4">
          <div className="text-sm text-gray-600">Monthly payment</div>
          <div className="text-xl font-semibold">£{calc.monthly.toFixed(2)}</div>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
          <div className="text-sm text-gray-600">Total interest</div>
          <div className="text-xl font-semibold">£{calc.interest.toFixed(2)}</div>
        </div>
        <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-4">
          <div className="text-sm text-gray-600">Total paid</div>
          <div className="text-xl font-semibold">£{calc.total.toFixed(2)}</div>
        </div>
      </div>
    </Card>
  );
}

/* ----------------------- Unwrapped panel ----------------------- */
export function EnhancedHomeBudgetPanelUnwrapped() {
  const [tab, setTab] = useState<TabKey>("budget");

  return (
    <div className="space-y-4" id="budget">
      <div className="inline-flex rounded-xl border bg-white overflow-hidden">
        <button
          onClick={() => setTab("budget")}
          className={`px-4 py-2 text-sm ${tab === "budget" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
        >
          Budget
        </button>
        <button
          onClick={() => setTab("mortgage")}
          className={`px-4 py-2 text-sm border-l ${tab === "mortgage" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
        >
          Mortgage
        </button>
        <button
          onClick={() => setTab("doodle")}
          className={`px-4 py-2 text-sm border-l ${tab === "doodle" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
        >
          Doodle
        </button>
        <button
          onClick={() => setTab("envelopes")}
          className={`px-4 py-2 text-sm border-l ${tab === "envelopes" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
        >
          Envelopes
        </button>
        <button
          onClick={() => setTab("plants")}
          className={`px-4 py-2 text-sm border-l ${tab === "plants" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
        >
          Plants
        </button>
        <button
          onClick={() => setTab("team")}
          className={`px-4 py-2 text-sm border-l ${tab === "team" ? "bg-gray-900 text-white" : "hover:bg-gray-50"}`}
        >
          Team
        </button>
      </div>

      {tab === "budget" && (
        <div className="space-y-6">
          <BudgetOverview />
          <GroupedBudgetSheet />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <QuickExpenseEntry />
            </div>
            <div>
              <SavingsGoals />
            </div>
          </div>
        </div>
      )}

      {tab === "mortgage" && <MortgageTab />}

      {tab === "doodle" && <DoodleBudget />}
      {tab === "envelopes" && <EnvelopesSkin />}
      {tab === "plants" && <PlantsSkin />}
      {tab === "team" && <TeamSkin />}
    </div>
  );
}

/* ----------------------- Default export ----------------------- */
/**
 * This component assumes a parent has already wrapped it with:
 * <HouseholdBudgetProvider householdId={hid}> ... </HouseholdBudgetProvider>
 * (See src/app/dashboard/page.tsx)
 */
export default function EnhancedHomeBudgetPanel() {
  return <EnhancedHomeBudgetPanelUnwrapped />;
}
