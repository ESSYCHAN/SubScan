// src/components/StreamlinedSubScan.tsx
// Single unified system that addresses monthly budgeting needs

'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Calendar as CalendarIcon, DollarSign, AlertTriangle, Target,
  ChevronLeft, ChevronRight, Search, Upload, Settings,
  TrendingUp, TrendingDown, BarChart3, RefreshCw, CheckCircle2
} from 'lucide-react';
import {
  collection, query, where, onSnapshot, Timestamp, addDoc, doc, setDoc, updateDoc
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { ValidationUtils } from '@/utils/validation';
import { LoadingState } from '@/components/Loading';
import BankStatementParser from '@/utils/bankStatementParser';
import StatementReview, { ParsedResult, Candidate } from '@/components/StatementReview';
import { serverTimestamp } from "firebase/firestore";
import { useEnhancedBudget } from "@/components/HouseholdBudgetProvider";
import { getDocs } from 'firebase/firestore';
import AnalyticsPanel from './AnalyticsPanel';

// Core types
export interface Item {
  id: string;
  name: string;
  category: 'streaming'|'software'|'fitness'|'housing'|'food'|'savings'|'insurance'|'transport'|'utilities'|'entertainment'|'other';
  cost: number;
  day: number;
  emoji?: string;
  type: 'subscription'|'planned'|'budget';
  priority?: 'essential'|'savings'|'goals';
  savingOpportunity?: number;
  source?: 'subscription'|'planned'|'budget';
  raw?: any;
}

interface FSSubscription {
  userId: string;
  name?: string;
  merchant?: string;
  serviceName?: string;
  category?: string;
  cost?: number;
  amount?: number;
  monthlyFee?: number;
  billingDate?: number;
  dayOfMonth?: number;
  nextBilling?: string;
  lastUsed?: string;
  signUpDate?: string;
  frequency?: 'monthly'|'weekly'|'annual'|'unknown';
  confidence?: number;
  savingOpportunity?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  source?: 'bank_scan'|'manual';
  pausedUntil?: string;
}

interface BudgetCategory {
  id: string;
  name: string;
  emoji: string;
  monthlyBudget: number;
  spent: number;
}

interface ToastState {
  type: 'success' | 'error' | 'info';
  msg: string;
}

interface ActionModal {
  type: 'budget-adjust' | 'subscription-review' | 'reallocate' | null;
  data?: any;
}

interface Statistics {
  totalMonthly: number;
  totalBudgeted: number;
  totalSpent: number;
  budgetRemaining: number;
  potentialSavings: number;
}

interface Insight {
  type: 'budget' | 'savings' | 'optimization' | 'trend' | 'alert' | 'opportunity';
  message: string;
  severity: 'low' | 'medium' | 'high';
  amount?: number;
  actionable?: boolean;
  category?: string;
}

// Helper functions
const monthName = (d: Date): string => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const daysInMonth = (y: number, m: number): number => new Date(y, m + 1, 0).getDate();
const fmtGBP = (n: number): string => `£${(n||0).toFixed(2)}`;
const clamp = (n: number, min: number, max: number): number => Math.max(min, Math.min(max, n));

const categoryMap: Record<string, Item['category']> = {
  'Entertainment': 'entertainment', 'Software': 'software', 'Fitness': 'fitness',
  'Cloud Storage': 'software', 'News': 'entertainment', 'Music': 'entertainment',
  'Video': 'entertainment', 'Gaming': 'entertainment', 'Productivity': 'software',
  'Telecom': 'utilities', 'Transport': 'transport', 'Food': 'food',
  'Shopping': 'other', 'Finance': 'other'
};

const normaliseMonthly = (amount: number, freq?: FSSubscription['frequency']): number => {
  if (!amount || amount <= 0) return 0;
  if (freq === 'annual') return Math.round((amount / 12) * 100) / 100;
  if (freq === 'weekly') return Math.round((amount * 4.33) * 100) / 100;
  return Math.round(amount * 100) / 100;
};

const calculateNextBilling = (lastSeen: string): string => {
  const today = new Date();
  const historicalDate = new Date(lastSeen);
  const billingDay = isNaN(historicalDate.getTime()) ? 1 : historicalDate.getDate();
  
  const nextBilling = new Date(today.getFullYear(), today.getMonth(), billingDay);
  if (nextBilling < today) {
    nextBilling.setMonth(nextBilling.getMonth() + 1);
  }
  
  return nextBilling.toISOString().slice(0, 10);
};

// PDF Processing Functions
async function extractPdfText(file: File): Promise<string> {
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load pdf.js'));
      document.head.appendChild(s);
    });
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const buf = await file.arrayBuffer();
  const pdf = await (window as any).pdfjsLib.getDocument({ data: buf }).promise;
  let out = '';

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const text = content.items
      .map((it: any) => ((it.str || '') + (it.hasEOL ? '\n' : ' ')))
      .join('')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n');
    out += `\n--- Page ${p} ---\n${text}\n`;
  }
  return out;
}

function normalizeSantanderRows(fullText: string): string[] {
  const isDate = (s: string): boolean => /^\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3}\b/.test(s) || /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(s);
  const looksAmount = (s: string): boolean => /\d{1,3}(?:,\d{3})*(?:\.\d{2})$/.test(s);
  const raw = fullText.split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  const lines: string[] = [];
  let cur = '';

  for (let i = 0; i < raw.length; i++) {
    const a = raw[i], b = raw[i + 1] || '', c = raw[i + 2] || '';

    if (isDate(a)) {
      if (cur) { lines.push(cur.trim()); cur = ''; }
      cur = a;
      if (b && !isDate(b)) {
        cur += ' ' + b;
        if (!looksAmount(b) && c && !isDate(c)) {
          cur += ' ' + c;
          i += 2;
        } else {
          i += 1;
        }
      }
      continue;
    }

    if (cur) {
      cur += ' ' + a;
      if (looksAmount(a)) { lines.push(cur.trim()); cur = ''; }
    }
  }
  if (cur) lines.push(cur.trim());
  return lines;
}

function cleanForFirestore<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (typeof v === 'number' && Number.isNaN(v)) continue;
    out[k] = v;
  }
  return out;
}

const computeStatsFromParsed = (rows: any[]) => {
  const detected = rows.length;
  const monthlyTotal = rows.reduce((s, r) => {
    const amt = Number(r.cost || 0);
    const f = String(r.frequency || 'monthly');
    if (f === 'annual') return s + (amt/12);
    if (f === 'weekly') return s + (amt*4.33);
    return s + amt;
  }, 0);
  const annualTotal = rows.filter(r => (r.frequency||'').toLowerCase() === 'annual')
                          .reduce((s, r) => s + Number(r.cost || 0), 0);
  const avgConfidence = (rows.reduce((s, r) => s + Number(r.confidence ?? 85), 0) / Math.max(1, rows.length));
  return { detected, monthlyTotal, annualTotal, avgConfidence };
};

// Action Modal Components
interface BudgetAdjustModalProps {
  category: BudgetCategory | null;
  onClose: () => void;
  onSave: (categoryId: string, newBudget: number) => Promise<void>;
}

function BudgetAdjustModal({ 
  category, 
  onClose, 
  onSave 
}: BudgetAdjustModalProps) {
  const [newBudget, setNewBudget] = useState(category?.monthlyBudget || 0);
  const [saving, setSaving] = useState(false);
  
  if (!category) return null;
  
  const spent = category.spent || 0;
  const currentBudget = category.monthlyBudget || 0;
  const overage = spent - currentBudget;
  const suggestedBudget = Math.ceil(spent * 1.1); // 10% buffer

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(category.id, newBudget);
      onClose();
    } catch (error) {
      console.error('Failed to update budget:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Adjust {category.name} Budget</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <span className="text-gray-400 text-xl">×</span>
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-medium text-red-800 mb-2">Current Issue</h4>
            <p className="text-sm text-red-700">
              You&apos;ve spent <strong>£{spent.toFixed(2)}</strong> but budgeted only <strong>£{currentBudget.toFixed(2)}</strong>
              <br />
              <span className="font-medium">Overage: £{overage.toFixed(2)}</span>
            </p>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              New Monthly Budget
            </label>
            <input
              type="number"
              value={newBudget}
              onChange={(e) => setNewBudget(Number(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              step="0.01"
              min="0"
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => setNewBudget(suggestedBudget)}
                className="text-sm px-3 py-1 bg-blue-50 text-blue-700 rounded-full hover:bg-blue-100"
              >
                Use Suggested: £{suggestedBudget}
              </button>
              <button
                onClick={() => setNewBudget(spent)}
                className="text-sm px-3 py-1 bg-gray-50 text-gray-700 rounded-full hover:bg-gray-100"
              >
                Match Spending: £{spent.toFixed(0)}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Updating...' : 'Update Budget'}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SubscriptionReviewModalProps {
  subscriptions: Item[];
  onClose: () => void;
}

const SubscriptionReviewModal = ({ subscriptions, onClose }: SubscriptionReviewModalProps) => {
  const underutilizedSubs = subscriptions.filter(sub => (sub.savingOpportunity || 0) > 0);
  const totalSavings = underutilizedSubs.reduce((sum, sub) => sum + (sub.savingOpportunity || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Review Subscriptions</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <span className="text-gray-400 text-xl">×</span>
          </button>
        </div>

        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h4 className="font-medium text-green-800 mb-1">Potential Monthly Savings</h4>
            <p className="text-2xl font-bold text-green-900">£{totalSavings.toFixed(2)}</p>
            <p className="text-sm text-green-700">
              By reviewing {underutilizedSubs.length} underutilized subscriptions
            </p>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium text-gray-900">Subscriptions to Review</h4>
            {underutilizedSubs.map(sub => (
              <div key={sub.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{sub.emoji}</span>
                    <div>
                      <div className="font-medium text-gray-900">{sub.name}</div>
                      <div className="text-sm text-gray-500 capitalize">{sub.category}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-gray-900">£{sub.cost.toFixed(2)}/mo</div>
                    <div className="text-xs text-amber-600">
                      Save £{(sub.savingOpportunity || 0).toFixed(2)}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 mt-3">
                  <button className="text-sm px-3 py-1 bg-red-50 text-red-700 rounded hover:bg-red-100">
                    Cancel Service
                  </button>
                  <button className="text-sm px-3 py-1 bg-yellow-50 text-yellow-700 rounded hover:bg-yellow-100">
                    Pause Temporarily
                  </button>
                  <button className="text-sm px-3 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100">
                    Keep & Monitor
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

interface ReallocateModalProps {
  categories: BudgetCategory[];
  onClose: () => void;
  onSave: (adjustments: Record<string, number>) => Promise<void>;
}

const ReallocateModal = ({ 
  categories, 
  onClose, 
  onSave 
}: ReallocateModalProps) => {
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  // Find categories with unused budget
  const underutilizedCategories = categories.filter(cat => {
    const spent = cat.spent || 0;
    const budget = cat.monthlyBudget || 0;
    return budget > 50 && spent < budget * 0.6;
  });

  // Find categories that are over budget
  const overBudgetCategories = categories.filter(cat => {
    const spent = cat.spent || 0;
    const budget = cat.monthlyBudget || 0;
    return budget > 0 && spent > budget;
  });

  const handleAdjustment = (categoryId: string, newAmount: number) => {
    setAdjustments(prev => ({
      ...prev,
      [categoryId]: newAmount
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(adjustments);
      onClose();
    } catch (error) {
      console.error('Failed to reallocate budget:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-3xl mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Reallocate Budget</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <span className="text-gray-400 text-xl">×</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-gray-900 mb-3">Reduce From (Underutilized)</h4>
            <div className="space-y-3">
              {underutilizedCategories.map(cat => {
                const unused = (cat.monthlyBudget || 0) - (cat.spent || 0);
                const newAmount = adjustments[cat.id] !== undefined ? 
                  adjustments[cat.id] : cat.monthlyBudget || 0;
                
                return (
                  <div key={cat.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{cat.emoji}</span>
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <div className="text-sm text-gray-600 mb-2">
                      Budgeted: £{(cat.monthlyBudget || 0).toFixed(0)} • 
                      Spent: £{(cat.spent || 0).toFixed(0)} • 
                      Unused: £{unused.toFixed(0)}
                    </div>
                    <input
                      type="number"
                      value={newAmount}
                      onChange={(e) => handleAdjustment(cat.id, Number(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                      step="10"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <h4 className="font-medium text-gray-900 mb-3">Increase For (Over Budget)</h4>
            <div className="space-y-3">
              {overBudgetCategories.map(cat => {
                const overage = (cat.spent || 0) - (cat.monthlyBudget || 0);
                const newAmount = adjustments[cat.id] !== undefined ? 
                  adjustments[cat.id] : cat.monthlyBudget || 0;
                
                return (
                  <div key={cat.id} className="border border-red-200 rounded-lg p-3 bg-red-50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{cat.emoji}</span>
                      <span className="font-medium">{cat.name}</span>
                    </div>
                    <div className="text-sm text-red-700 mb-2">
                      Budgeted: £{(cat.monthlyBudget || 0).toFixed(0)} • 
                      Spent: £{(cat.spent || 0).toFixed(0)} • 
                      Over: £{overage.toFixed(0)}
                    </div>
                    <input
                      type="number"
                      value={newAmount}
                      onChange={(e) => handleAdjustment(cat.id, Number(e.target.value) || 0)}
                      className="w-full px-2 py-1 border border-gray-200 rounded text-sm"
                      step="10"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-6 border-t">
          <button
            onClick={handleSave}
            disabled={saving || Object.keys(adjustments).length === 0}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Apply Changes'}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// Monthly Budget Management Hook
function useMonthlyBudgetManagement() {
  const { categories, updateCategory } = useEnhancedBudget();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Check if we're in a new month and should offer reset
  const shouldOfferMonthlyReset = useMemo(() => {
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return thisMonth !== currentMonth && now.getDate() <= 5; // First 5 days of month
  }, [currentMonth]);

  const startNewMonth = useCallback(async (adjustments?: Record<string, number>) => {
    const now = new Date();
    const newMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    // Apply any budget adjustments
    if (adjustments) {
      for (const [categoryId, newAmount] of Object.entries(adjustments)) {
        await updateCategory(categoryId, { monthlyBudget: newAmount });
      }
    }
    
    setCurrentMonth(newMonth);
    return newMonth;
  }, [updateCategory]);

  return {
    currentMonth,
    shouldOfferMonthlyReset,
    startNewMonth
  };
}

const useSubscriptionItems = (userId?: string, selectedMonth?: Date) => {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    const qy = query(collection(db, 'subscriptions'), where('userId', '==', userId));
    const unsub = onSnapshot(qy, (snap) => {
      const arr: Item[] = [];
      
      snap.forEach((sdoc) => {
        const d = sdoc.data() as FSSubscription;
        const sanitizedName = ValidationUtils.sanitizeMerchantName(
          d.name || d.merchant || d.serviceName || 'Unknown Service'
        );
        const cost = normaliseMonthly(d.cost ?? d.amount ?? d.monthlyFee ?? 0, d.frequency);
        
        if (!ValidationUtils.isValidAmount(cost)) return;

        const day = clamp(d.billingDate || d.dayOfMonth || 1, 1, 31);
        const category = categoryMap[d.category || ''] || 'other';

        arr.push({
          id: sdoc.id,
          name: sanitizedName,
          category,
          cost,
          day,
          emoji: '💳',
          type: 'subscription',
          savingOpportunity: d.savingOpportunity ?? ((d.confidence || 0) < 70 ? cost : 0),
          source: 'subscription',
          raw: d
        });
      });
      
      setItems(arr);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  return { items, loading };
};

interface MonthlyBudgetResetProps {
  categories: BudgetCategory[];
  onStartNewMonth: (adjustments: Record<string, number>) => Promise<void>;
  onDismiss: () => void;
}

const MonthlyBudgetReset = ({ 
  categories, 
  onStartNewMonth, 
  onDismiss 
}: MonthlyBudgetResetProps) => {
  const [adjustments, setAdjustments] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);

  const handleAdjustment = (categoryId: string, newAmount: number) => {
    setAdjustments(prev => ({
      ...prev,
      [categoryId]: newAmount
    }));
  };

  const handleStartNewMonth = async () => {
    setSaving(true);
    try {
      await onStartNewMonth(adjustments);
      onDismiss();
    } catch (error) {
      console.error('Failed to start new month:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <RefreshCw className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h3 className="font-semibold text-blue-900">New Month - Adjust Your Budget</h3>
          <p className="text-sm text-blue-700">Review and adjust your monthly budget amounts based on last month's performance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {categories.filter(cat => (cat.monthlyBudget || 0) > 0).map(category => {
          const currentBudget = category.monthlyBudget || 0;
          const adjustment = adjustments[category.id];
          const finalAmount = adjustment !== undefined ? adjustment : currentBudget;

          return (
            <div key={category.id} className="bg-white rounded-lg p-4 border border-blue-100">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{category.emoji}</span>
                <span className="font-medium">{category.name}</span>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Last month:</span>
                  <span>{fmtGBP(currentBudget)}</span>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">This month:</span>
                  <input
                    type="number"
                    value={finalAmount}
                    onChange={(e) => handleAdjustment(category.id, Number(e.target.value) || 0)}
                    className="flex-1 px-2 py-1 border border-gray-200 rounded text-sm"
                    step="0.01"
                    min="0"
                  />
                </div>

                {adjustment !== undefined && adjustment !== currentBudget && (
                  <div className={`text-xs font-medium ${
                    adjustment > currentBudget ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {adjustment > currentBudget ? '+' : ''}{fmtGBP(adjustment - currentBudget)} change
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleStartNewMonth}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 animate-spin border-2 border-white border-t-transparent rounded-full" />
              Starting...
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              Start New Month
            </>
          )}
        </button>
        <button
          onClick={onDismiss}
          className="px-4 py-2 text-blue-700 hover:bg-blue-100 rounded-lg"
        >
          Maybe Later
        </button>
      </div>
    </div>
  );
};

interface EnhancedInsightsProps {
  categories: BudgetCategory[];
  subscriptions: Item[];
  onTakeAction: (actionType: string, data: any) => void;
}

const EnhancedInsights = ({ 
  categories, 
  subscriptions,
  onTakeAction 
}: EnhancedInsightsProps) => {
  const insights = useMemo((): Insight[] => {
    const results: Insight[] = [];

    // Advanced budget insights
    categories.forEach(cat => {
      const spent = cat.spent || 0;
      const budget = cat.monthlyBudget || 0;
      
      if (spent > budget && budget > 0) {
        const overage = spent - budget;
        const severity: Insight['severity'] = overage > budget * 0.2 ? 'high' : 
                        overage > budget * 0.1 ? 'medium' : 'low';
        
        results.push({
          type: 'budget',
          message: `${cat.name} is £${overage.toFixed(2)} over budget (${((overage/budget)*100).toFixed(0)}% over)`,
          severity,
          amount: overage,
          actionable: true,
          category: cat.name
        });
      }

      // Underutilized budget insight
      if (spent < budget * 0.6 && budget > 50) {
        const unused = budget - spent;
        results.push({
          type: 'optimization',
          message: `${cat.name} budget underused by £${unused.toFixed(2)} - consider reallocating`,
          severity: 'low',
          amount: unused,
          actionable: true,
          category: cat.name
        });
      }
    });

    // Advanced subscription insights
    const totalSubCost = subscriptions.reduce((sum, sub) => sum + (sub.cost || 0), 0);
    const potentialSavings = subscriptions.reduce((sum, sub) => sum + (sub.savingOpportunity || 0), 0);
    
    if (potentialSavings > 50) {
      results.push({
        type: 'savings',
        message: `Review ${subscriptions.filter(s => (s.savingOpportunity || 0) > 0).length} underutilized subscriptions to save £${potentialSavings.toFixed(2)}/month`,
        severity: 'medium',
        amount: potentialSavings,
        actionable: true
      });
    }

    // Subscription concentration insight
    if (subscriptions.length > 8) {
      results.push({
        type: 'optimization',
        message: `You have ${subscriptions.length} active subscriptions costing £${totalSubCost.toFixed(2)}/month - consider consolidating`,
        severity: 'medium',
        amount: totalSubCost,
        actionable: true
      });
    }

    // Budget efficiency insight
    const totalBudget = categories.reduce((sum, cat) => sum + (cat.monthlyBudget || 0), 0);
    const totalSpent = categories.reduce((sum, cat) => sum + (cat.spent || 0), 0);
    
    if (totalSpent > totalBudget * 1.15) {
      results.push({
        type: 'budget',
        message: `Overall spending is £${(totalSpent - totalBudget).toFixed(2)} over total budget - review high-spend categories`,
        severity: 'high',
        amount: totalSpent - totalBudget,
        actionable: true
      });
    }

    // Seasonal/timing insights
    const now = new Date();
    const dayOfMonth = now.getDate();
    
    if (dayOfMonth <= 5) {
      results.push({
        type: 'trend',
        message: `Early month - good time to review last month's performance and adjust budgets`,
        severity: 'low',
        actionable: true
      });
    }

    if (dayOfMonth >= 25) {
      const remainingBudget = totalBudget - totalSpent;
      if (remainingBudget > 0) {
        results.push({
          type: 'trend',
          message: `£${remainingBudget.toFixed(2)} budget remaining for this month - track spending carefully`,
          severity: 'low',
          amount: remainingBudget
        });
      }
    }

    return results.sort((a, b) => {
      const severityOrder = { high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    });
  }, [categories, subscriptions]);

  if (insights.length === 0) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-6">
        <div className="flex items-center gap-3 text-green-700">
          <CheckCircle2 className="w-6 h-6" />
          <div>
            <span className="font-semibold text-green-800">Budget on track!</span>
            <p className="text-sm text-green-600 mt-1">
              No major concerns detected. Your spending appears well-managed this month.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {insights.slice(0, 4).map((insight, idx) => (
        <div 
          key={idx} 
          className={`rounded-xl border p-4 ${
            insight.severity === 'high' ? 'bg-red-50 border-red-200' :
            insight.severity === 'medium' ? 'bg-yellow-50 border-yellow-200' :
            'bg-blue-50 border-blue-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
              insight.severity === 'high' ? 'bg-red-500' :
              insight.severity === 'medium' ? 'bg-yellow-500' :
              'bg-blue-500'
            }`} />
            <div className="flex-1">
              <p className={`font-medium text-sm ${
                insight.severity === 'high' ? 'text-red-800' :
                insight.severity === 'medium' ? 'text-yellow-800' :
                'text-blue-800'
              }`}>
                {insight.message}
              </p>
              
              {insight.actionable && (
                <div className="mt-2 flex items-center gap-2">
                  <button 
                    onClick={() => {
                      if (insight.type === 'budget' && insight.category) {
                        const category = categories.find(c => c.name === insight.category);
                        onTakeAction('budget-adjust', category);
                      } else if (insight.type === 'savings') {
                        onTakeAction('subscription-review', subscriptions);
                      } else if (insight.type === 'optimization') {
                        onTakeAction('reallocate', categories);
                      }
                    }}
                    className={`text-xs px-3 py-1 rounded-full font-medium transition-colors ${
                    insight.severity === 'high' ? 'bg-red-100 text-red-700 hover:bg-red-200' :
                    insight.severity === 'medium' ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' :
                    'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  }`}>
                    Take Action
                  </button>
                  
                  {insight.amount && insight.type === 'savings' && (
                    <span className="text-xs text-green-600 font-medium">
                      Potential: £{insight.amount.toFixed(0)}/mo savings
                    </span>
                  )}
                  
                  {insight.amount && insight.type === 'budget' && insight.severity === 'high' && (
                    <span className="text-xs text-red-600 font-medium">
                      Impact: £{insight.amount.toFixed(0)} over budget
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      
      {insights.length > 4 && (
        <div className="text-center">
          <button className="text-sm text-gray-600 hover:text-gray-800 font-medium">
            View {insights.length - 4} more insights →
          </button>
        </div>
      )}
    </div>
  );
};

// Main Component
export default function StreamlinedSubScan() {
  const [user] = useAuthState(auth);
  const { categories, updateCategory, setDerivedSpentLocal } = useEnhancedBudget();
  const { currentMonth, shouldOfferMonthlyReset, startNewMonth } = useMonthlyBudgetManagement();
  
  // UI State
  const [current, setCurrent] = useState(() => new Date());
  const [showMonthlyReset, setShowMonthlyReset] = useState(shouldOfferMonthlyReset);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewResults, setReviewResults] = useState<ParsedResult[]>([]);
  const [reviewStats, setReviewStats] = useState<{ detected: number; monthlyTotal: number; annualTotal: number; avgConfidence: number } | undefined>(undefined);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [actionModal, setActionModal] = useState<ActionModal>({ type: null, data: undefined });

  // Data
  const { items: subs, loading } = useSubscriptionItems(user?.uid, current);

  // Calculate spending for display (no automatic provider updates to avoid loops)
  const spendingByCategory = useMemo(() => {
    const spending: Record<string, number> = {};
    
    subs.forEach(sub => {
      const budgetCategory = categories.find(cat => 
        cat.name.toLowerCase().includes(sub.category.toLowerCase()) ||
        cat.name.toLowerCase() === 'other'
      );
      
      if (budgetCategory) {
        spending[budgetCategory.id] = 
          (spending[budgetCategory.id] || 0) + sub.cost;
      }
    });

    return spending;
  }, [subs, categories]);

  const statistics: Statistics = useMemo(() => {
    const totalMonthly = subs.reduce((sum, item) => sum + item.cost, 0);
    const totalBudgeted = categories.reduce((sum, cat) => sum + (cat.monthlyBudget || 0), 0);
    const potentialSavings = subs.reduce((sum, item) => sum + (item.savingOpportunity || 0), 0);
    
    // Calculate total spent from local spending data
    const totalSpent = Object.values(spendingByCategory).reduce((sum, amount) => sum + amount, 0);
    
    return {
      totalMonthly,
      totalBudgeted,
      totalSpent,
      budgetRemaining: totalBudgeted - totalSpent,
      potentialSavings
    };
  }, [subs, categories, spendingByCategory]);

  const showToast = (type: ToastState['type'], msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  // Complete file upload handler with PDF processing
  const handleFileUpload = async (file: File) => {
    const { valid, error } = ValidationUtils.validateFileUpload(file);
    if (!valid) { 
      showToast('error', error || 'Invalid file'); 
      return; 
    }

    setUploading(true);
    try {
      let text: string;
      if (file.type === 'application/pdf') {
        text = await extractPdfText(file);
        const normalized = normalizeSantanderRows(text).join('\n');
        const parsed = BankStatementParser.parseStatementText(normalized);
        
        if (!parsed.length) {
          showToast('info','No recurring transactions detected. Try another export format.');
          return;
        }

        const mapped: ParsedResult[] = parsed.map((p: any) => ({
          name: p.name,
          category: p.category || 'other',
          cost: Number(p.cost || 0),
          frequency: p.frequency || 'monthly',
          nextBilling: p.nextBilling || '',
          lastUsed: p.lastUsed || '',
          confidence: p.confidence ?? 90,
          meta: p
        }));
        
        setReviewResults(mapped);
        const stats = computeStatsFromParsed(parsed);
        setReviewStats(stats);
        setReviewOpen(true);
      } else {
        // Handle CSV/TXT files
        const text = await file.text();
        const parsed = BankStatementParser.parseStatementText(text);
        
        if (!parsed.length) {
          showToast('info','No recurring transactions detected.');
          return;
        }

        const mapped: ParsedResult[] = parsed.map((p: any) => ({
          name: p.name,
          category: p.category || 'other',
          cost: Number(p.cost || 0),
          frequency: p.frequency || 'monthly',
          nextBilling: p.nextBilling || '',
          lastUsed: p.lastUsed || '',
          confidence: p.confidence ?? 90,
          meta: p
        }));
        
        setReviewResults(mapped);
        const stats = computeStatsFromParsed(parsed);
        setReviewStats(stats);
        setReviewOpen(true);
      }
    } catch (e) {
      console.error(e);
      showToast('error','Error processing file. Check the format and try again.');
    } finally {
      setUploading(false);
    }
  };

  // Save subscriptions to database
  const handleSaveAllToSubscriptions = async (results: ParsedResult[]) => {
    if (!user?.uid) {
      showToast('error', 'Please sign in to save subscriptions');
      return;
    }

    if (results.length === 0) {
      showToast('error', 'No subscriptions to save');
      return;
    }

    try {
      setUploading(true);
      let savedCount = 0;
      let duplicateCount = 0;

      for (const result of results) {
        // Check for duplicates
        const existingQuery = query(
          collection(db, 'subscriptions'),
          where('userId', '==', user.uid)
        );
        
        const existingSnap = await getDocs(existingQuery);
        
        const isDuplicate = existingSnap.docs.some(doc => {
          const existing = doc.data();
          const nameMatch = existing.name === result.name || 
                           existing.serviceName === result.name ||
                           existing.merchant === result.name;
          if (nameMatch) {
            const costDiff = Math.abs((existing.cost || existing.amount || existing.monthlyFee || 0) - result.cost) / result.cost;
            return costDiff < 0.1; // Within 10%
          }
          return false;
        });

        if (isDuplicate) {
          duplicateCount++;
          continue;
        }

        // Convert frequency
        const frequency: FSSubscription['frequency'] = 
          result.frequency === 'annual' ? 'annual' : 
          result.frequency === 'weekly' ? 'weekly' : 'monthly';

        // Determine billing day
        let billingDay = 1;
        if (result.nextBilling) {
          const billingDate = new Date(result.nextBilling);
          if (!isNaN(billingDate.getTime())) {
            billingDay = billingDate.getDate();
          }
        }

        // Create subscription document
        const subscriptionData: Omit<FSSubscription, 'createdAt' | 'updatedAt'> = {
          userId: user.uid,
          name: result.name.trim(),
          serviceName: result.name.trim(),
          merchant: result.name.trim(),
          category: result.category,
          cost: result.cost,
          amount: result.cost,
          monthlyFee: result.cost,
          frequency: frequency,
          billingDate: billingDay,
          dayOfMonth: billingDay,
          confidence: result.confidence || 90,
          source: 'bank_scan',
          nextBilling: calculateNextBilling(result.lastUsed || new Date().toISOString()),
          lastUsed: new Date().toISOString().slice(0, 10),
          signUpDate: new Date().toISOString().slice(0, 10),
        };

        await addDoc(collection(db, 'subscriptions'), {
          ...cleanForFirestore(subscriptionData),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        savedCount++;
      }

      // Show results
      if (savedCount > 0) {
        showToast('success', `Added ${savedCount} subscription${savedCount === 1 ? '' : 's'} to your account`);
      }
      
      if (duplicateCount > 0) {
        showToast('info', `Skipped ${duplicateCount} duplicate${duplicateCount === 1 ? '' : 's'}`);
      }

      if (savedCount === 0 && duplicateCount === 0) {
        showToast('info', 'No new subscriptions found to add');
      }

      // Close the review modal
      setReviewOpen(false);
      setReviewResults([]);
      setReviewStats(undefined);

    } catch (error) {
      console.error('Error saving subscriptions:', error);
      showToast('error', 'Failed to save subscriptions. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleStartNewMonth = async (adjustments: Record<string, number>) => {
    try {
      await startNewMonth(adjustments);
      showToast('success', 'New month started with updated budgets');
    } catch (error) {
      showToast('error', 'Failed to start new month');
    }
  };

  // Action handlers for insights
  const handleInsightAction = (actionType: string, data: any) => {
    if (actionType === 'budget-adjust') {
      setActionModal({ type: 'budget-adjust', data });
    } else if (actionType === 'subscription-review') {
      setActionModal({ type: 'subscription-review', data });
    } else if (actionType === 'reallocate') {
      setActionModal({ type: 'reallocate', data });
    }
  };

  const handleBudgetAdjust = async (categoryId: string, newBudget: number) => {
    try {
      await updateCategory(categoryId, { monthlyBudget: newBudget });
      showToast('success', 'Budget updated successfully');
    } catch (error) {
      showToast('error', 'Failed to update budget');
    }
  };

  const handleBudgetReallocate = async (adjustments: Record<string, number>) => {
    try {
      for (const [categoryId, newAmount] of Object.entries(adjustments)) {
        await updateCategory(categoryId, { monthlyBudget: newAmount });
      }
      showToast('success', 'Budget reallocated successfully');
    } catch (error) {
      showToast('error', 'Failed to reallocate budget');
    }
  };

  if (loading) {
    return <LoadingState message="Loading your financial data" type="dashboard" />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-[#f3f6ff]">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b">
        <div className="max-w-7xl mx-auto px-5 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-sm">
                <span className="text-white font-bold">S</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900">SubScan</h1>
              <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                Financial Dashboard
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Toast */}
      {toast && (
        <div className={[
          "fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm text-white",
          toast.type === 'success' ? 'bg-emerald-600' :
          toast.type === 'error'   ? 'bg-rose-600'    : 'bg-slate-700'
        ].join(' ')}>
          {toast.msg}
        </div>
      )}

      <main className="max-w-7xl mx-auto px-5 py-6 space-y-6">
        {/* Monthly Budget Reset */}
        {showMonthlyReset && (
          <MonthlyBudgetReset
            categories={categories}
            onStartNewMonth={handleStartNewMonth}
            onDismiss={() => setShowMonthlyReset(false)}
          />
        )}

        {/* Key Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">MONTHLY SPENDING</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{fmtGBP(statistics.totalMonthly)}</div>
            <div className="text-sm text-gray-600">{subs.length} active subscriptions</div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                <Target className="w-5 h-5 text-green-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">BUDGET STATUS</span>
            </div>
            <div className={`text-2xl font-bold ${statistics.budgetRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmtGBP(Math.abs(statistics.budgetRemaining))}
            </div>
            <div className="text-sm text-gray-600">
              {statistics.budgetRemaining >= 0 ? 'under budget' : 'over budget'}
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-purple-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">POTENTIAL SAVINGS</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">{fmtGBP(statistics.potentialSavings)}</div>
            <div className="text-sm text-gray-600">per month</div>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-orange-600" />
              </div>
              <span className="text-xs text-gray-500 font-medium">BUDGET HEALTH</span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {Math.round(statistics.totalBudgeted > 0 ? (statistics.totalMonthly / statistics.totalBudgeted) * 100 : 0)}%
            </div>
            <div className="text-sm text-gray-600">of budget used</div>
          </div>
        </div>

        {/* Enhanced Insights */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Insights</h3>
          <EnhancedInsights 
            categories={categories} 
            subscriptions={subs} 
            onTakeAction={handleInsightAction}
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Quick Actions</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="bg-blue-50 border border-blue-200 rounded-xl p-4 cursor-pointer hover:bg-blue-100 transition-colors">
              <div className="flex items-center gap-3">
                <Upload className="w-8 h-8 text-blue-600" />
                <div>
                  <div className="font-semibold text-blue-900">Upload Statement</div>
                  <div className="text-sm text-blue-700">Find new subscriptions</div>
                </div>
              </div>
              <input
                type="file"
                accept=".pdf,.csv,.txt"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
            </label>

            <button 
              onClick={() => setShowMonthlyReset(true)}
              className="bg-green-50 border border-green-200 rounded-xl p-4 hover:bg-green-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <RefreshCw className="w-8 h-8 text-green-600" />
                <div className="text-left">
                  <div className="font-semibold text-green-900">Adjust Budget</div>
                  <div className="text-sm text-green-700">Update monthly amounts</div>
                </div>
              </div>
            </button>

            <button 
            onClick={() => setShowAnalytics(true)}
            className="bg-purple-50 border border-purple-200 rounded-xl p-4 hover:bg-purple-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-purple-600" />
              <div className="text-left">
                <div className="font-semibold text-purple-900">View Analytics</div>
                <div className="text-sm text-purple-700">Spending trends & insights</div>
              </div>
            </div>
          </button>
          </div>
        </div>

        {/* Subscriptions Summary */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Subscriptions</h3>
          
          {subs.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <DollarSign className="w-8 h-8 text-gray-400" />
              </div>
              <h4 className="font-medium text-gray-900 mb-2">No subscriptions found</h4>
              <p className="text-gray-600 mb-4">Upload a bank statement to automatically detect your subscriptions</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {subs.slice(0, 6).map(sub => (
                <div key={sub.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-xl">{sub.emoji}</span>
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{sub.name}</div>
                      <div className="text-sm text-gray-500 capitalize">{sub.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">{fmtGBP(sub.cost)}</div>
                      <div className="text-xs text-gray-500">monthly</div>
                    </div>
                  </div>
                  {(sub.savingOpportunity || 0) > 0 && (
                    <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                      Potential saving: {fmtGBP(sub.savingOpportunity || 0)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Statement Review Modal */}
        <StatementReview
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          results={reviewResults}
          stats={reviewStats}
          candidates={candidates}
          onAddManual={() => {}}
          onSaveAll={async () => await handleSaveAllToSubscriptions(reviewResults)}
          onExportCSV={() => {
            const csvContent = "data:text/csv;charset=utf-8," + 
              "Name,Category,Cost,Frequency,Confidence\n" +
              reviewResults.map(r => `${r.name},${r.category},${r.cost},${r.frequency},${r.confidence}`).join("\n");
            
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "subscriptions_export.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            showToast('success', 'CSV exported successfully');
          }}
        />

        {/* Analytics Panel */}
        <AnalyticsPanel
          categories={categories}
          subscriptions={subs}
          isOpen={showAnalytics}
          onClose={() => setShowAnalytics(false)}
        />

        {/* Action Modals */}
        {actionModal.type === 'budget-adjust' && (
          <BudgetAdjustModal
            category={actionModal.data}
            onClose={() => setActionModal({ type: null })}
            onSave={handleBudgetAdjust}
          />
        )}

        {actionModal.type === 'subscription-review' && (
          <SubscriptionReviewModal
            subscriptions={actionModal.data}
            onClose={() => setActionModal({ type: null })}
          />
        )}

        {actionModal.type === 'reallocate' && (
          <ReallocateModal
            categories={actionModal.data}
            onClose={() => setActionModal({ type: null })}
            onSave={handleBudgetReallocate}
          />
        )}
      </main>
    </div>
  );
}