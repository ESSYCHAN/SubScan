// components/SubScanDashboardV2.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon, DollarSign, AlertTriangle, Target,
  ChevronLeft, ChevronRight, Search, Upload, Settings, FileText,
  Filter, Clock, Info, Menu
} from 'lucide-react';
import {
  collection, query, where, onSnapshot, Timestamp, addDoc, doc, setDoc
} from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signInAnonymously } from 'firebase/auth';
import { ValidationUtils } from '@/utils/validation';
import { LoadingState } from '@/components/Loading';
import BankStatementParser from '@/utils/bankStatementParser';
import StatementReview, { ParsedResult, Candidate } from '@/components/StatementReview';
import { serverTimestamp, deleteField } from "firebase/firestore";
import HouseholdBudgetProvider from "@/components/HouseholdBudgetProvider";
import { EnhancedHomeBudgetPanelUnwrapped } from "@/components/HomeBudgetExtensions";
import GroupedBudgetSheet from "@/components/GroupedBudgetSheet";
import { useEnhancedBudget } from "@/components/HouseholdBudgetProvider";
import TraditionalBudget from './TraditionalBudget';
import { getDocs, deleteDoc } from 'firebase/firestore';
// Replace your current provider with:
// import { MonthlyBudgetProvider, useMonthlyBudget } from './MonthlyBudgetProvider';
import { useMonthlyBudget } from './MonthlyBudgetProvider';

// Updated Item type to include budget source
export type Item = {
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
};

type FSSubscription = {
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
};

type FSPlanned = {
  userId: string;
  name: string;
  category: Item['category'];
  amount: number;
  frequency: 'once'|'monthly'|'annual';
  date?: string;
  dayOfMonth?: number;
  start?: string;
  end?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

// Keep all your existing helper functions
const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
const monthName = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const isoWeekdayIndex = (jsDay: number) => (jsDay + 6) % 7;
const firstWeekdayOfMonthMonday = (y: number, m: number) => isoWeekdayIndex(new Date(y, m, 1).getDay());
const fmtGBP = (n: number) => `£${(n||0).toFixed(2)}`;
const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const categoryMap: Record<string, Item['category']> = {
  'Entertainment': 'entertainment',
  'Software': 'software', 
  'Fitness': 'fitness',
  'Cloud Storage': 'software',
  'News': 'entertainment',
  'Music': 'entertainment',
  'Video': 'entertainment',
  'Gaming': 'entertainment',
  'Productivity': 'software',
  'Telecom': 'utilities',
  'Transport': 'transport',
  'Food': 'food',
  'Shopping': 'other',
  'Finance': 'other'
};

const emojiMap: Record<string, string> = {
  'Netflix': '📺','Spotify': '🎵','Amazon Prime': '📦','Disney+': '🏰','Apple': '🍎',
  'Microsoft': '💻','Adobe': '🎨','Google': '🔍','Zoom': '📹','Virgin Active': '💪',
  'PureGym': '🏋️','Three': '📱','EE': '📱','O2': '📱','Vodafone': '📱','LinkedIn': '💼',
  'Skillshare': '🎓','Duolingo': '🗣️','HelloFresh': '🥗','Uber Eats': '🍔','Deliveroo': '🚚'
};

const getServiceEmoji = (merchantName: string): string => {
  for (const [service, emoji] of Object.entries(emojiMap)) {
    if ((merchantName||'').toLowerCase().includes(service.toLowerCase())) return emoji;
  }
  return '💳';
};

const round2 = (n:number)=>Math.round(n*100)/100;
const normaliseMonthly = (amount:number, freq?:FSSubscription['frequency'])=>{
  if (!amount || amount<=0) return 0;
  if (freq==='annual') return round2(amount/12);
  if (freq==='weekly') return round2(amount*4.33);
  return round2(amount);
};

const billingDayFromRecord = (rec: FSSubscription): number => {
  const explicit = Number(rec.billingDate ?? rec.dayOfMonth);
  if (Number.isFinite(explicit) && explicit >= 1 && explicit <= 31) return explicit;
  if (rec.nextBilling) {
    const d = new Date(rec.nextBilling);
    if (!isNaN(d.getTime())) return d.getDate();
  }
  const fallback = rec.lastUsed || rec.signUpDate;
  if (fallback) {
    const d = new Date(fallback);
    if (!isNaN(d.getTime())) return d.getDate();
  }
  return 1;
};
const calculateNextBilling = (lastSeen: string): string => {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  
  const historicalDate = new Date(lastSeen);
  const billingDay = isNaN(historicalDate.getTime()) ? 1 : historicalDate.getDate();
  
  // Always calculate for current or future month
  const nextBilling = new Date(currentYear, currentMonth, billingDay);
  
  if (nextBilling < today) {
    nextBilling.setMonth(nextBilling.getMonth() + 1);
  }
  
  return nextBilling.toISOString().slice(0, 10);
};
const intensityEmoji = (amt: number) => (amt===0?'🙂':amt<100?'💨':amt<500?'⚡':amt<1000?'🔥':'💥');

const mapToBudgetCategory = (c: Item['category']): string => {
  switch (c) {
    case 'housing': return 'Mortgage';
    case 'utilities': return 'Utilities (Gas/Electric)';
    case 'food': return 'Groceries & Food';
    case 'transport': return 'Transport & Fuel';
    case 'insurance': return 'Insurance';
    case 'savings': return 'Investments';
    case 'entertainment': return 'Entertainment';
    case 'software': return 'Productivity';
    case 'fitness': return 'Fitness';
    case 'streaming': return 'Entertainment'; 
    default: return 'Other';
  }
};

// Add missing helper functions for budget integration
const mapBudgetTypeToCategory = (budgetType: string): Item['category'] => {
  switch (budgetType) {
    case 'essential': return 'housing';
    case 'lifestyle': return 'entertainment';
    case 'savings': return 'savings';
    case 'debt': return 'other';
    default: return 'other';
  }
};

const getBudgetDay = (category: any): number => {
  const name = category.name.toLowerCase();
  if (name.includes('rent') || name.includes('mortgage')) return 1;
  if (name.includes('utilities') || name.includes('electric') || name.includes('gas')) return 15;
  if (name.includes('groceries') || name.includes('food')) return 5;
  if (name.includes('insurance')) return 20;
  if (name.includes('transport') || name.includes('fuel')) return 10;
  if (name.includes('internet') || name.includes('phone')) return 25;
  return 15; // default middle of month
};

const inferTypeForBudget = (name: string): 'essential'|'lifestyle'|'savings'|'debt' => {
  if (['Mortgage','Council Tax','Utilities (Gas/Electric)','Water','Internet & Phone','Transport & Fuel','Insurance'].includes(name)) return 'essential';
  if (['Emergency Fund','Investments'].includes(name)) return 'savings';
  return 'lifestyle';
};

const pickEmoji = (name: string) => {
  if (name.includes('Mortgage')) return '🏠';
  if (name.includes('Groceries')) return '🛒';
  if (name.includes('Utilities')) return '⚡';
  if (name.includes('Water')) return '💧';
  if (name.includes('Internet') || name.includes('Phone')) return '📶';
  if (name.includes('Transport')) return '🚗';
  if (name.includes('Insurance')) return '🛡️';
  if (name.includes('Entertainment')) return '🎭';
  if (name.includes('Investments')) return '📈';
  return '💰';
};

// Bridge component
function BudgetBridge({ subs, planned }: { subs: Item[]; planned: Item[] }) {
  const { categories, setDerivedSpentLocal } = useEnhancedBudget();
  const { updateActualSpending } = useMonthlyBudget();
  
  const totals = useMemo(() => {
    const m = new Map<string, number>();
    [...subs, ...planned].forEach(it => {
      const name = mapToBudgetCategory(it.category);
      m.set(name, Math.round(((m.get(name) || 0) + (it.cost || 0)) * 100) / 100);
    });
    return m;
  }, [subs, planned]);

  const totalsSig = useMemo(
    () => Array.from(totals.entries())
          .sort(([a],[b]) => a.localeCompare(b))
          .map(([k,v]) => `${k}:${v}`).join('|'),
    [totals]
  );
  const catsSig = useMemo(
    () => categories.map(c => `${c.id}:${c.name}`).sort().join('|'),
    [categories]
  );

  const nextMap = useMemo(() => {
    const map: Record<string, number> = {};
    const namesThisMonth = new Set(Array.from(totals.keys()));

    for (const [name, value] of totals) {
      const cat = categories.find((c) => c.name === name);
      if (cat) map[cat.id] = value;
    }
    for (const c of categories) {
      if (!namesThisMonth.has(c.name)) map[c.id] = 0;
    }
    return map;
  }, [totalsSig, catsSig, categories, totals]);

  const nextSig = useMemo(() => {
    const entries = Object.entries(nextMap).sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([k, v]) => `${k}:${v}`).join('|');
  }, [nextMap]);

  const prevSigRef = React.useRef<string>('');

  useEffect(() => {
  if (prevSigRef.current !== nextSig) {
    setDerivedSpentLocal(nextMap);
    
    // Also update monthly budget
    updateActualSpending(nextMap).catch(console.error);
    
    prevSigRef.current = nextSig;
  }
}, [nextSig, nextMap, setDerivedSpentLocal, updateActualSpending]);

  return null;
}

// Date helpers
const sameMonth = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
const endOfMonthISO = (y: number, m: number) => new Date(y, m + 1, 0).toISOString().slice(0,10);

function isPausedThisMonth(rec: FSSubscription, month: Date) {
  if (!rec.pausedUntil) return false;
  const pu = new Date(rec.pausedUntil);
  return sameMonth(pu, month);
}

function occursThisMonth(p: FSPlanned, month: Date) {
  const y = month.getFullYear(), m = month.getMonth();

  if (p.frequency === 'once') {
    if (!p.date) return false;
    const d = new Date(p.date);
    return d.getFullYear() === y && d.getMonth() === m;
  }

  if (p.frequency === 'monthly') {
    const afterStart = !p.start || new Date(p.start) <= new Date(y, m, 1);
    const beforeEnd  = !p.end   || new Date(p.end)   >= new Date(y, m + 1, 0);
    return afterStart && beforeEnd;
  }

  if (p.frequency === 'annual') {
    const ref = p.start || p.date;
    if (!ref) return false;
    return new Date(ref).getMonth() === m;
  }

  return false;
}

function dayForPlanned(p: FSPlanned, month: Date) {
  if (p.frequency === 'once' && p.date) return new Date(p.date).getDate();
  return clamp(p.dayOfMonth ?? 1, 1, daysInMonth(month.getFullYear(), month.getMonth()));
}

function occursThisMonthSub(rec: FSSubscription, month: Date) {
  const freq = (rec.frequency||'monthly').toLowerCase();
  
  // Don't show items in past months - only current and future
  const today = new Date();
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  if (month < currentMonth) {
    return false;
  }
  
  if (freq === 'monthly' || freq === 'weekly' || freq === 'unknown') return true;
  
  if (freq === 'annual') {
    const nextBillingDate = rec.nextBilling ? new Date(rec.nextBilling) : new Date();
    return nextBillingDate.getMonth() === month.getMonth();
  }
  
  return true;
}

// Data hooks
function useSubscriptionItems(userId?: string, selectedMonth?: Date) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const y = selectedMonth?.getFullYear();
  const m = selectedMonth?.getMonth();
  const totalDays = (y != null && m != null) ? daysInMonth(y, m) : 31;

  useEffect(() => {
    if (!userId) { 
      setLoading(false); 
      return; 
    }

    setLoading(true);
    const qy = query(collection(db, 'subscriptions'), where('userId', '==', userId));

    const unsub = onSnapshot(qy, (snap) => {
      const arr: Item[] = [];
      
      snap.forEach((sdoc) => {
        const d = sdoc.data() as FSSubscription;

        if (selectedMonth && isPausedThisMonth(d, selectedMonth)) return;
        if (selectedMonth && !occursThisMonthSub(d, selectedMonth)) return;

        const sanitizedName = ValidationUtils.sanitizeMerchantName(
          d.name || d.merchant || d.serviceName || 'Unknown Service'
        );
        
        const cost = normaliseMonthly(d.cost ?? d.amount ?? d.monthlyFee ?? 0, d.frequency);
        
        if (!ValidationUtils.isValidAmount(cost)) {
          console.warn(`Invalid amount for ${sanitizedName}: ${cost}`);
          return;
        }

        const day = clamp(billingDayFromRecord(d), 1, totalDays);
        const category = categoryMap[d.category || ''] || 'other';

        const item: Item = {
          id: sdoc.id,
          name: sanitizedName,
          category,
          cost,
          day,
          emoji: getServiceEmoji(sanitizedName),
          type: 'subscription',
          savingOpportunity: d.savingOpportunity ?? ((d.confidence || 0) < 70 ? cost : 0),
          source: 'subscription',
          raw: d
        };
        
        arr.push(item);
      });
      
      setItems(arr);
      setError(null)
      setLoading(false);
    }, (err) => {
      console.error('SubScan listener error', err);
      setError('Failed to load subscription data');
      setLoading(false);
    });

    return () => unsub();
  }, [userId, y, m, totalDays, selectedMonth]);

  return { items, loading, error };
}

function usePlannedItems(userId?: string, selectedMonth?: Date) {
  const [items, setItems] = useState<Item[]>([]);
  useEffect(() => {
    if (!userId || !selectedMonth) return;
    const qy = query(collection(db, 'plannedItems'), where('userId','==', userId));
    const unsub = onSnapshot(qy, snap => {
      const out: Item[] = [];
      snap.forEach(docu => {
        const p = docu.data() as FSPlanned;
        if (!occursThisMonth(p, selectedMonth)) return;
        out.push({
          id: docu.id,
          name: ValidationUtils.sanitizeMerchantName(p.name || 'Planned item'),
          category: p.category || 'other',
          cost: round2(p.amount || 0),
          day: dayForPlanned(p, selectedMonth),
          emoji: '📝',
          type: 'planned',
          priority: 'goals',
          source: 'planned',
          raw: p
        });
      });
      setItems(out);
    });
    return () => unsub();
  }, [userId, selectedMonth]);
  return items;
}

// Keep all your existing PDF and file processing functions
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
  const isDate = (s: string) => /^\s*\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3}\b/.test(s) || /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(s);
  const looksAmount = (s: string) => /\d{1,3}(?:,\d{3})*(?:\.\d{2})$/.test(s);
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

// Keep all your other helper functions (cleanForFirestore, computeStatsFromParsed, etc.)
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
// Monthly Budget Header Component
interface MonthlyBudgetHeaderProps {
  onOpenBudgetModal: () => void;
  onStartNewMonth: () => void;
}

const MonthlyBudgetHeader = ({ onOpenBudgetModal, onStartNewMonth }: MonthlyBudgetHeaderProps) => {
  const { 
    selectedPeriod, 
    currentPeriod,
    goToNextMonth, 
    goToPreviousMonth,
    getInsights 
  } = useMonthlyBudget();

  const insights = selectedPeriod ? getInsights(selectedPeriod.id) : [];
  const isCurrentMonth = selectedPeriod?.id === currentPeriod?.id;
  const highSeverityInsights = insights.filter(i => i.severity === 'high').length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={goToPreviousMonth}
            className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          
          <div className="text-center">
            <h2 className="text-xl font-bold text-gray-900">
              {selectedPeriod?.name || 'No Budget Period'}
            </h2>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span>Planned: £{selectedPeriod?.totalPlanned.toFixed(0) || 0}</span>
              <span>•</span>
              <span>Actual: £{selectedPeriod?.totalActual.toFixed(0) || 0}</span>
              <span>•</span>
              <span className={`font-medium ${
                (selectedPeriod?.totalVariance || 0) >= 0 ? 'text-red-600' : 'text-green-600'
              }`}>
                {(selectedPeriod?.totalVariance || 0) >= 0 ? '+' : ''}£{selectedPeriod?.totalVariance.toFixed(0) || 0}
              </span>
            </div>
          </div>
          
          <button 
            onClick={goToNextMonth}
            className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
          >
            <ChevronRight className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {highSeverityInsights > 0 && (
            <div className="flex items-center gap-2 px-3 py-1 bg-red-50 border border-red-200 rounded-full">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span className="text-sm font-medium text-red-700">
                {highSeverityInsights} issue{highSeverityInsights > 1 ? 's' : ''}
              </span>
            </div>
          )}

          <button
            onClick={onOpenBudgetModal}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            Adjust Budget
          </button>

          {!isCurrentMonth && (
            <button
              onClick={onStartNewMonth}
              className="px-4 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700"
            >
              Start New Month
            </button>
          )}
        </div>
      </div>

      {insights.length > 0 && (
        <div className="space-y-2">
          {insights.slice(0, 3).map((insight, idx) => (
            <div 
              key={idx}
              className={`flex items-center gap-3 p-3 rounded-lg text-sm ${
                insight.severity === 'high' ? 'bg-red-50 border border-red-200' :
                insight.severity === 'medium' ? 'bg-yellow-50 border border-yellow-200' :
                'bg-blue-50 border border-blue-200'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${
                insight.severity === 'high' ? 'bg-red-500' :
                insight.severity === 'medium' ? 'bg-yellow-500' :
                'bg-blue-500'
              }`} />
              <span className={`font-medium ${
                insight.severity === 'high' ? 'text-red-800' :
                insight.severity === 'medium' ? 'text-yellow-800' :
                'text-blue-800'
              }`}>
                {insight.message}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Budget Setting Modal
interface BudgetSettingModalProps {
  open: boolean;
  onClose: () => void;
}

const BudgetSettingModal = ({ open, onClose }: BudgetSettingModalProps) => {
  const { selectedPeriod, updatePlannedAmount } = useMonthlyBudget();
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (selectedPeriod && open) {
      const initialAmounts: Record<string, string> = {};
      Object.entries(selectedPeriod.categories).forEach(([id, cat]) => {
        initialAmounts[id] = cat.planned.toString();
      });
      setAmounts(initialAmounts);
    }
  }, [selectedPeriod, open]);

  if (!open || !selectedPeriod) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [categoryId, amountStr] of Object.entries(amounts)) {
        const amount = parseFloat(amountStr) || 0;
        const currentAmount = selectedPeriod.categories[categoryId]?.planned || 0;
        if (amount !== currentAmount) {
          await updatePlannedAmount(categoryId, amount);
        }
      }
      onClose();
    } catch (error) {
      console.error('Failed to update budget:', error);
    } finally {
      setSaving(false);
    }
  };

  const totalPlanned = Object.values(amounts).reduce((sum, amountStr) => 
    sum + (parseFloat(amountStr) || 0), 0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-900">
            Set Budget for {selectedPeriod.name}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <span className="text-gray-400 text-xl">×</span>
          </button>
        </div>

        <div className="mb-6 p-4 bg-blue-50 rounded-xl">
          <div className="text-lg font-bold text-blue-900">
            Total Monthly Budget: £{totalPlanned.toFixed(2)}
          </div>
          <div className="text-sm text-blue-700">
            Current spending: £{selectedPeriod.totalActual.toFixed(2)}
          </div>
        </div>

        <div className="space-y-4 mb-6">
          {Object.entries(selectedPeriod.categories).map(([categoryId, category]) => {
            const variance = category.actual - (parseFloat(amounts[categoryId]) || 0);
            
            return (
              <div key={categoryId} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{category.emoji}</span>
                    <div>
                      <div className="font-medium text-gray-900">{category.name}</div>
                      <div className="text-sm text-gray-500">
                        Spent: £{category.actual.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <input
                        type="number"
                        value={amounts[categoryId] || ''}
                        onChange={(e) => setAmounts(prev => ({
                          ...prev,
                          [categoryId]: e.target.value
                        }))}
                        className="w-24 px-3 py-1 text-right border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        step="0.01"
                        min="0"
                      />
                      <div className="text-xs text-gray-500 mt-1">per month</div>
                    </div>
                  </div>
                </div>

                {Math.abs(variance) > 5 && (
                  <div className={`text-sm px-3 py-1 rounded ${
                    variance > 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
                  }`}>
                    {variance > 0 ? 'Over' : 'Under'} by £{Math.abs(variance).toFixed(2)}
                  </div>
                )}

                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setAmounts(prev => ({
                      ...prev,
                      [categoryId]: category.actual.toString()
                    }))}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                  >
                    Match Spending (£{category.actual.toFixed(0)})
                  </button>
                  
                  <button
                    onClick={() => setAmounts(prev => ({
                      ...prev,
                      [categoryId]: Math.ceil(category.actual * 1.1).toString()
                    }))}
                    className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    +10% Buffer (£{Math.ceil(category.actual * 1.1)})
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 pt-4 border-t">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Budget'}
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

// New Month Modal
interface NewMonthModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const NewMonthModal = ({ open, onClose, onSuccess }: NewMonthModalProps) => {
  const { startNewMonth, templates, selectedPeriod } = useMonthlyBudget();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const handleStartMonth = async () => {
    setCreating(true);
    try {
      await startNewMonth(selectedTemplate || undefined);
      onSuccess();
      onClose();
    } catch (error) {
      console.error('Failed to start new month:', error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-gray-900">Start New Month</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <span className="text-gray-400 text-xl">×</span>
          </button>
        </div>

        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Budget Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Copy from last month</option>
              {templates.map(template => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {selectedTemplate ? 'Use saved template' : 'Copy budget amounts from previous month'}
            </p>
          </div>

          {selectedPeriod && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Current Month Summary</h4>
              <div className="space-y-1 text-sm text-gray-600">
                <div>Planned: £{selectedPeriod.totalPlanned.toFixed(2)}</div>
                <div>Actual: £{selectedPeriod.totalActual.toFixed(2)}</div>
                <div className={`font-medium ${
                  selectedPeriod.totalVariance >= 0 ? 'text-red-600' : 'text-green-600'
                }`}>
                  Variance: {selectedPeriod.totalVariance >= 0 ? '+' : ''}£{selectedPeriod.totalVariance.toFixed(2)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleStartMonth}
            disabled={creating}
            className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Start New Month'}
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
// Main component
export default function SubScanDashboardV2() {
  // Auth
  const [user, authLoading] = useAuthState(auth);
  const [householdReady, setHouseholdReady] = useState(false);
  
  useEffect(() => {
    if (!authLoading && !user) signInAnonymously(auth).catch(() => {});
  }, [user, authLoading]);

  useEffect(() => {
    const setupHousehold = async () => {
      if (!user?.uid) return;
      
      try {
        const { ensureSoloHousehold } = await import('@/lib/initHousehold');
        await ensureSoloHousehold(user.uid);
        setHouseholdReady(true);
      } catch (error) {
        console.error('Failed to setup household:', error);
        setHouseholdReady(true);
      }
    };
    
    setupHousehold();
  }, [user?.uid]);

  // UI state
  const [current, setCurrent] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<'all'|Item['category']>('all');
  const [drawer, setDrawer] = useState<null | { day: number; items: Item[] }>(null);
  const [budget, setBudget] = useState<number>(1200);
  const [debugDates, setDebugDates] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{type:'success'|'error'|'info'; msg:string}|null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewResults, setReviewResults] = useState<ParsedResult[]>([]);
  const [reviewStats, setReviewStats] = useState<{ detected:number; monthlyTotal:number; annualTotal:number; avgConfidence:number; windowLabel?:string }>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [newPlanOpen, setNewPlanOpen] = useState<{day:number}|null>(null);
  const { categories: budgetCategories } = useEnhancedBudget();

  const [newPlan, setNewPlan] = useState<{
    name: string; 
    amount: string; 
    freq: 'once'|'monthly'|'annual';
    category: Item['category'];
    dayOfMonth: number;
    date: string;
  }>({
    name: '', 
    amount: '', 
    freq: 'monthly',
    category: 'other',
    dayOfMonth: 1,
    date: new Date().toISOString().slice(0, 10)
  });
  const [upcomingExpanded, setUpcomingExpanded] = useState(false);
  const showToast = (type:'success'|'error'|'info', msg:string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };
  const [activeTab, setActiveTab] = useState('Calendar');

  // Data
  const { items: subs, loading, error } = useSubscriptionItems(user?.uid, current);
  const plannedItems = usePlannedItems(user?.uid, current);
  const isLoading = authLoading || loading;

  // Enhanced merge with budget categories
  const allItems = useMemo(() => {
  const subscriptionItems: Item[] = subs.map(sub => ({
    ...sub,
    source: 'subscription' as const
  }));

  const plannedExpenses: Item[] = plannedItems.map(item => ({
    ...item,
    savingOpportunity: item.savingOpportunity || 0,
    source: 'planned' as const
  }));

  // Convert budget categories to calendar items with proper typing
  const budgetItems: Item[] = budgetCategories
    .filter(cat => (cat.monthlyBudget || 0) > 0)
    .map(cat => {
      const priority: Item['priority'] = cat.type === 'essential' ? 'essential' : 
                                        cat.type === 'savings' ? 'savings' : 'goals';
      return {
        id: `budget-${cat.id}`,
        name: cat.name,
        category: mapBudgetTypeToCategory(cat.type),
        cost: cat.monthlyBudget || 0,
        day: getBudgetDay(cat),
        emoji: cat.emoji || '💰',
        type: 'budget' as const,
        priority,
        savingOpportunity: 0,
        source: 'budget' as const,
        raw: cat
      } as Item;
    });

  return [...subscriptionItems, ...plannedExpenses, ...budgetItems];
}, [subs, plannedItems, budgetCategories]);

  const year = current.getFullYear();
  const month = current.getMonth();
  const totalDays = daysInMonth(year, month);
  const first = firstWeekdayOfMonthMonday(year, month);

  // Enhanced statistics calculation
  const statistics = useMemo(() => {
  const totalMonthly = allItems.reduce((sum: number, item: Item) => sum + (item.cost || 0), 0);
  const budgetRemaining = budget - totalMonthly;
  const potentialSavings = allItems.reduce((sum: number, item: Item) => sum + (item.savingOpportunity || 0), 0);
  
  // Upcoming payments (next 7 days)
  const today = new Date();
  const upcoming = allItems
    .filter((item: Item) => {
      const dayDiff = item.day - today.getDate();
      return dayDiff >= 0 && dayDiff <= 7;
    })
    .slice(0, 4)
    .map((item: Item) => ({
      date: item.day,
      amount: item.cost,
      category: item.category,
      name: item.name,
      source: item.source
    }));

  return {
    totalMonthly,
    budgetRemaining,
    potentialSavings,
    upcoming
  };
}, [allItems, budget, current]);

  // Filter & search
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allItems.filter(i => (
      (filterCat === 'all' || i.category === filterCat) &&
      (!q || `${i.name} ${i.category} ${i.type}`.toLowerCase().includes(q))
    ));
  }, [search, allItems, filterCat]);

  // Group by day
  const perDay: Item[][] = useMemo(() => {
  const arr: Item[][] = Array.from({ length: totalDays + 1 }, () => []);
  
  filtered.forEach((item: Item) => { // Explicitly type the parameter
    const d = clamp(item.day, 1, totalDays);
    arr[d].push(item);
  });
  
  for (let d = 1; d <= totalDays; d++) {
    arr[d].sort((a: Item, b: Item) => {
      // Sort by type priority: subscription > budget > planned
      const typeOrder: Record<Item['type'], number> = { 
        subscription: 1, 
        budget: 2, 
        planned: 3 
      };
      
      if (a.type !== b.type) {
        return (typeOrder[a.type] || 4) - (typeOrder[b.type] || 4);
      }
      return (b.cost || 0) - (a.cost || 0);
    });
  }
  return arr;
}, [filtered, totalDays]);

  const perDayTotals = useMemo(() => perDay.map(items => items.reduce((s, it) => s + (it?.cost || 0), 0)), [perDay]);
  const monthTotal = useMemo(() => perDayTotals.reduce((s, n) => s + (n || 0), 0), [perDayTotals]);
  const totalSavings = useMemo(() => allItems.reduce((s, item) => s + (item.savingOpportunity || 0), 0), [allItems]);

  // Budget progress
  const [budgetInput, setBudgetInput] = useState<string>('1200');
  useEffect(()=>{ setBudgetInput(String(budget)); }, [budget]);
  const budgetUsed = Math.min(monthTotal, budget);
  const budgetPct = clamp((budgetUsed / (budget || 1)) * 100, 0, 100);

  // Calendar matrix
  const matrix: (number|null)[][] = useMemo(() => {
    const rows: (number|null)[][] = [];
    let cursor = 1 - first;
    const weeksNeeded = Math.ceil((totalDays + first) / 7);
    
    for (let r = 0; r < weeksNeeded; r++) {
      const row: (number|null)[] = [];
      for (let c = 0; c < 7; c++) {
        row.push(cursor >= 1 && cursor <= totalDays ? cursor : null);
        cursor++;
      }
      rows.push(row);
    }
    return rows;
  }, [first, totalDays]);

  // Navigation helpers
  const goto = (delta: number) => {
    const d = new Date(current);
    d.setMonth(d.getMonth() + delta);
    
    // Allow reasonable navigation range (1 year back, 1 year forward)
    const today = new Date();
    const earliestAllowed = new Date(today.getFullYear() - 1, today.getMonth(), 1); // 1 year back
    const latestAllowed = new Date(today.getFullYear() + 1, today.getMonth(), 1); // 1 year forward
    
    if (d < earliestAllowed) {
      d.setTime(earliestAllowed.getTime());
    } else if (d > latestAllowed) {
      d.setTime(latestAllowed.getTime());
    }
    
    setCurrent(d);
  };
  
  const isToday = (d: number) => {
    const now = new Date();
    return d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  };

  // Keep your existing file upload handlers
  const handleFileUploadForReview = async (file: File) => {
    const { valid, error } = ValidationUtils.validateFileUpload(file);
    if (!valid) { showToast('error', error || 'Invalid file'); return; }

    setUploading(true);
    try {
      let text: string;
      if (file.type === 'application/pdf') {
        text = await extractPdfText(file);
        const normalized = normalizeSantanderRows(text).join('\n');
        const parsed = BankStatementParser.parseStatementText(normalized);
        if (!parsed.length) {
          showToast('info','No recurring-looking rows detected. Try another export.');
          return;
        }

        const mapped: ParsedResult[] = parsed.map((p:any) => ({
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
        setReviewStats({ ...stats });
      }
      setReviewOpen(true);
    } catch (e) {
      console.error(e);
      showToast('error','Error processing file. Check the format and try again.');
    } finally {
      setUploading(false);
    }
  };
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
      // Check for duplicates in subscriptions collection
      const existingQuery = query(
        collection(db, 'subscriptions'),
        where('userId', '==', user.uid)
      );
      
      const existingSnap = await getDocs(existingQuery);
      
      // Check if there's a similar subscription by name and cost
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

      // Convert frequency to match subscriptions structure
      const frequency: FSSubscription['frequency'] = 
        result.frequency === 'annual' ? 'annual' : 
        result.frequency === 'weekly' ? 'weekly' : 'monthly';

      // Determine billing day from nextBilling or default to 1st
      let billingDay = 1;
      if (result.nextBilling) {
        const billingDate = new Date(result.nextBilling);
        if (!isNaN(billingDate.getTime())) {
          billingDay = billingDate.getDate();
        }
      }

      // Create subscription document matching your FSSubscription type
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
        // KEY CHANGE: Use calculateNextBilling and anchor to today
        nextBilling: calculateNextBilling(result.lastUsed || new Date().toISOString()),
        lastUsed: new Date().toISOString().slice(0, 10), // TODAY, not historical
        signUpDate: new Date().toISOString().slice(0, 10), // TODAY, not historical
      };

      // Save to subscriptions collection using legacy flat structure
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
  const handleAddPlannedExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.uid || !newPlan.name || !newPlan.amount) {
      showToast('error', 'Please fill in all required fields');
      return;
    }

    try {
      const amount = parseFloat(newPlan.amount);
      if (isNaN(amount) || amount <= 0) {
        showToast('error', 'Please enter a valid amount');
        return;
      }

      // Smart consolidation: Check for existing similar items
      const existingItem = plannedItems.find(item => {
        const nameMatch = item.name.toLowerCase().trim() === newPlan.name.toLowerCase().trim();
        const categoryMatch = item.category === newPlan.category;
        const frequencyMatch = item.raw?.frequency === newPlan.freq;
        
        return nameMatch && categoryMatch && frequencyMatch;
      });

      if (existingItem) {
        const shouldUpdate = window.confirm(
          `"${newPlan.name}" already exists with £${existingItem.cost.toFixed(2)}.\n\n` +
          `Choose:\n` +
          `• OK: Update existing to £${(existingItem.cost + amount).toFixed(2)} (adds £${amount.toFixed(2)})\n` +
          `• Cancel: Create separate entry`
        );

        if (shouldUpdate) {
          const plannedDoc = doc(db, 'plannedItems', existingItem.id);
          await setDoc(plannedDoc, {
            amount: existingItem.cost + amount,
            updatedAt: serverTimestamp()
          }, { merge: true });

          showToast('success', `Updated ${newPlan.name}: £${existingItem.cost.toFixed(2)} → £${(existingItem.cost + amount).toFixed(2)}`);
          
          setNewPlan({
            name: '', 
            amount: '', 
            freq: 'monthly',
            category: 'other',
            dayOfMonth: 1,
            date: new Date().toISOString().slice(0, 10)
          });
          setNewPlanOpen(null);
          return;
        }
      }

      // Create new planned item
      const plannedItem: Omit<FSPlanned, 'createdAt' | 'updatedAt'> = {
        userId: user.uid,
        name: newPlan.name.trim(),
        category: newPlan.category,
        amount: amount,
        frequency: newPlan.freq,
        ...(newPlan.freq === 'once' && { date: newPlan.date }),
        ...(newPlan.freq !== 'once' && { dayOfMonth: newPlan.dayOfMonth })
      };

      await addDoc(collection(db, 'plannedItems'), {
        ...cleanForFirestore(plannedItem),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      showToast('success', `Added ${newPlan.name} (£${amount.toFixed(2)}) to your planned expenses`);
      
      setNewPlan({
        name: '', 
        amount: '', 
        freq: 'monthly',
        category: 'other',
        dayOfMonth: 1,
        date: new Date().toISOString().slice(0, 10)
      });
      setNewPlanOpen(null);

    } catch (error) {
      console.error('Error adding planned expense:', error);
      showToast('error', 'Failed to add expense. Please try again.');
    }
  };

  const migratePlannedToSubscriptions = async () => {
    if (!user?.uid) {
      showToast('error', 'Please sign in first');
      return;
    }

    const shouldMigrate = window.confirm(
      `This will move your ${plannedItems.length} planned items to subscriptions and delete the originals. This action cannot be undone. Continue?`
    );
    
    if (!shouldMigrate) return;

    try {
      setUploading(true);
      const plannedQuery = query(
        collection(db, 'plannedItems'),
        where('userId', '==', user.uid)
      );
      const plannedSnap = await getDocs(plannedQuery);
      
      let migratedCount = 0;
      let skippedCount = 0;
      
      for (const docSnap of plannedSnap.docs) {
        const data = docSnap.data() as FSPlanned;
        
        // Skip one-time payments as they're not subscriptions
        if (data.frequency === 'once') {
          skippedCount++;
          continue;
        }
        
        // Check for duplicates in subscriptions collection
        const existingQuery = query(
          collection(db, 'subscriptions'),
          where('userId', '==', user.uid),
          where('name', '==', data.name)
        );
        const existingSnap = await getDocs(existingQuery);
        
        if (existingSnap.size > 0) {
          skippedCount++;
          continue; // Skip duplicates
        }
        
        // Convert planned item to subscription format
        const subscriptionData: Omit<FSSubscription, 'createdAt' | 'updatedAt'> = {
          userId: user.uid,
          name: data.name,
          serviceName: data.name,
          merchant: data.name,
          category: data.category as Item['category'],
          cost: data.amount,
          amount: data.amount,
          monthlyFee: data.amount,
          frequency: data.frequency === 'annual' ? 'annual' : 'monthly',
          billingDate: data.dayOfMonth || 1,
          dayOfMonth: data.dayOfMonth || 1,
          source: 'manual',
          confidence: 85,
        };
        
        await addDoc(collection(db, 'subscriptions'), {
          ...cleanForFirestore(subscriptionData),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        
        // Delete the old planned item
        await deleteDoc(docSnap.ref);
        migratedCount++;
      }
      
      showToast('success', `Migrated ${migratedCount} items to subscriptions, skipped ${skippedCount} items`);
      
    } catch (error) {
      console.error('Migration error:', error);
      showToast('error', 'Migration failed: ' + (error as Error).message);
    } finally {
      setUploading(false);
    }
  };
  
  const [budgetModalOpen, setBudgetModalOpen] = useState(false);
  const [newMonthModalOpen, setNewMonthModalOpen] = useState(false);
  // Loading states
  if (isLoading) {
    return <LoadingState message="Loading your subscription data" type="dashboard" />;
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Try Again</button>
        </div>
      </div>
    );
  }

  if (!householdReady && user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-[#f3f6ff] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p>Setting up your budget...</p>
        </div>
      </div>
    );
  }

  return (
    <HouseholdBudgetProvider householdId={user?.uid ? `solo:${user.uid}` : undefined}>
      <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-[#f3f6ff]">
        <BudgetBridge subs={subs} planned={plannedItems} />
        
        {/* Enhanced Header */}
        <header className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b">
          <div className="max-w-7xl mx-auto px-5 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-sm rotate-[-3deg]">
                <span className="text-white font-bold">S</span>
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold text-gray-900">SubScan</h1>
                <span className="hidden sm:inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                  <CalendarIcon className="w-3.5 h-3.5" /> live data
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-gray-400" />
              <Menu className="w-5 h-5 text-gray-400" />
            </div>
          </div>
        </header>

        {/* Toast */}
        {toast && (
          <div className={[
            "fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm text-white",
            toast.type === 'success' ? 'bg-emerald-600' :
            toast.type === 'error'   ? 'bg-rose-600'    :
                                      'bg-slate-700'
          ].join(' ')}>
            {toast.msg}
          </div>
        )}

        <main className="max-w-7xl mx-auto px-5 py-6 space-y-6">
          {/* Professional Statistics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Monthly - Professional */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-xs text-gray-500 font-medium">MONTHLY TOTAL</div>
              </div>
              <div className="space-y-1">
                <div className="text-2xl font-bold text-gray-900">£{Math.round(statistics.totalMonthly)}</div>
                <div className="text-sm text-gray-600">
                  {subs.length} subscriptions • {plannedItems.length} planned • {budgetCategories.filter(c => (c.monthlyBudget || 0) > 0).length} budget
                </div>
              </div>
            </div>

            {/* Budget Progress - Professional */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center">
                  <Target className="w-5 h-5 text-green-600" />
                </div>
                <div className="text-xs text-gray-500 font-medium">BUDGET STATUS</div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <div className="text-2xl font-bold text-gray-900">£{Math.round(statistics.budgetRemaining)}</div>
                  <div className="text-sm text-gray-600">remaining this month</div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Budget:</span>
                  <input
                    className="w-16 px-2 py-1 text-sm font-semibold bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    onBlur={() => setBudget(Number(budgetInput) || 0)}
                  />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-gray-500">
                    <span>Used</span>
                    <span>{Math.round((statistics.totalMonthly / budget) * 100)}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full transition-all duration-500 ${
                        (statistics.totalMonthly / budget) > 0.9 ? 'bg-red-500' :
                        (statistics.totalMonthly / budget) > 0.75 ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${Math.min(100, (statistics.totalMonthly / budget) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Potential Savings - Professional */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-purple-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-xs text-gray-500 font-medium">SAVINGS OPPORTUNITY</div>
              </div>
              
              <div className="space-y-3">
                <div>
                  <div className="text-2xl font-bold text-gray-900">£{Math.round(statistics.potentialSavings)}</div>
                  <div className="text-sm text-gray-600">per month</div>
                </div>
                
                {statistics.potentialSavings > 0 && (
                  <div className="p-3 bg-purple-50 rounded-xl">
                    <div className="text-xs text-purple-600 font-medium mb-1">Annual Impact</div>
                    <div className="text-lg font-bold text-purple-900">£{Math.round(statistics.potentialSavings * 12)}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Upcoming Payments - Enhanced */}
            <div className="bg-white rounded-2xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="text-xs text-gray-500 font-medium">UPCOMING</div>
              </div>
              
              <div className="space-y-3">
                {statistics.upcoming.length > 0 ? (
                  <>
                    <div>
                      <div className="text-2xl font-bold text-gray-900">{statistics.upcoming.length}</div>
                      <div className="text-sm text-gray-600">payments due</div>
                    </div>
                    
                    <div className="space-y-2">
                      {statistics.upcoming
                        .slice(0, upcomingExpanded ? statistics.upcoming.length : 2)
                        .map((payment, idx) => (
                        <div key={idx} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs font-bold text-gray-600 shadow-sm">
                              {payment.date}
                            </div>
                            <span className="text-sm text-gray-700 truncate max-w-20">
                              {payment.name || 'Payment'}
                            </span>
                            {payment.source === 'budget' && (
                              <span className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded">
                                Budget
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-semibold text-gray-900">£{Math.round(payment.amount)}</span>
                        </div>
                      ))}
                      
                      {statistics.upcoming.length > 2 && (
                        <button
                          onClick={() => setUpcomingExpanded(!upcomingExpanded)}
                          className="w-full text-xs text-blue-600 hover:text-blue-800 font-medium py-2 px-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors text-center"
                        >
                          {upcomingExpanded 
                            ? 'Show Less' 
                            : `+${statistics.upcoming.length - 2} more`
                          }
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4">
                    <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-2">
                      <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="text-sm font-medium text-gray-700">All clear</div>
                    <div className="text-xs text-gray-500">No payments due</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Simplified Tab Navigation */}
          <div className="flex border-b mb-6 -mx-2 overflow-x-auto">
            {['Calendar', 'Budget', 'Analytics'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Enhanced Calendar View */}
          {activeTab === 'Calendar' && (
            <>
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between p-6 border-b border-gray-100">
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => goto(-1)}
                      className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <ChevronLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <div className="text-center">
                      <h2 className="text-xl font-bold text-gray-900">{monthName(current)}</h2>
                      <p className="text-sm text-gray-500">
                        {filtered.length} items • £{Math.round(monthTotal)} spending vs £{budget} budget
                      </p>
                    </div>
                    <button 
                      onClick={() => goto(1)}
                      className="p-2 rounded-xl bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <ChevronRight className="w-5 h-5 text-gray-600" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search..."
                        className="pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>

                    <select
                      value={filterCat}
                      onChange={(e) => setFilterCat(e.target.value as any)}
                      className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Categories</option>
                      <option value="housing">Housing</option>
                      <option value="utilities">Utilities</option>
                      <option value="food">Food & Groceries</option>
                      <option value="transport">Transport</option>
                      <option value="entertainment">Entertainment</option>
                      <option value="software">Software & Apps</option>
                      <option value="fitness">Health & Fitness</option>
                      <option value="other">Other</option>
                    </select>

                    <button 
                      onClick={() => setNewPlanOpen({ 
                        day: new Date().getDate() 
                      })}
                      className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700"
                    >
                      Add Expense
                    </button>
                  </div>
                </div>

                {/* Weekday Header */}
                <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                    <div key={day} className="p-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Enhanced Calendar Grid */}
                <div className="grid grid-cols-7">
                  {matrix.map((row, ri) => (
                    row.map((day, ci) => {
                      if (!day) {
                        return (
                          <div 
                            key={`empty-${ri}-${ci}`} 
                            className="h-20 border-r border-b border-gray-100 bg-gray-25"
                          />
                        );
                      }

                      const dayItems = perDay[day] || [];
                      const dayTotal = perDayTotals[day] || 0;
                      const hasItems = dayItems.length > 0;
                      const today = isToday(day);

                      const getHeatColor = (amount: number) => {
                        if (amount === 0) return 'bg-white';
                        if (amount < 50) return 'bg-blue-50 border-blue-100';
                        if (amount < 150) return 'bg-blue-100 border-blue-200';
                        if (amount < 300) return 'bg-blue-200 border-blue-300';
                        return 'bg-blue-300 border-blue-400';
                      };

                      return (
                        <button
                          key={`${ri}-${ci}-${day}`}
                          onClick={() => hasItems && setDrawer({ day, items: dayItems })}
                          className={`
                            h-20 p-2 border-r border-b border-gray-100 text-left 
                            transition-all duration-200 hover:bg-gray-50
                            ${getHeatColor(dayTotal)}
                            ${today ? 'ring-2 ring-blue-400 ring-inset' : ''}
                            ${hasItems ? 'cursor-pointer hover:scale-[1.02] hover:shadow-sm' : 'cursor-default'}
                          `}
                        >
                          <div className={`text-sm font-medium mb-1 ${
                            today ? 'text-blue-600 font-bold' : 'text-gray-700'
                          }`}>
                            {day}
                          </div>

                          {hasItems && (
                            <div className="space-y-1">
                              {dayItems.slice(0, 2).map((item, idx) => (
                                <div key={idx} className="flex items-center gap-1 text-xs">
                                  <span className="text-sm">{item.emoji}</span>
                                  <span className="truncate text-gray-600 flex-1 max-w-16">
                                    {item.name}
                                  </span>
                                </div>
                              ))}

                              <div className="flex items-center justify-between mt-1">
                                <span className="text-xs font-semibold text-gray-900">
                                  £{Math.round(dayTotal)}
                                </span>
                                {dayItems.length > 2 && (
                                  <span className="text-xs text-gray-500">
                                    +{dayItems.length - 2}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}
                        </button>
                      );
                    })
                  ))}
                </div>

                {/* Calendar Footer Stats */}
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <span className="text-gray-600">
                        <strong className="text-gray-900">{allItems.length}</strong> total items
                      </span>
                      <span className="text-gray-600">
                        <strong className="text-gray-900">{subs.length}</strong> subscriptions
                      </span>
                      <span className="text-gray-600">
                        <strong className="text-gray-900">{plannedItems.length}</strong> planned
                      </span>
                      <span className="text-gray-600">
                        <strong className="text-gray-900">{budgetCategories.filter(c => (c.monthlyBudget || 0) > 0).length}</strong> budget
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <span className="text-gray-600">Monthly total:</span>
                      <span className="text-lg font-bold text-gray-900">£{Math.round(monthTotal)}</span>
                      {totalSavings > 0 && (
                        <span className="text-sm text-purple-600 font-medium">
                          (Save £{Math.round(totalSavings)})
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Heat map legend */}
              <div className="flex items-center justify-center gap-6 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-white border border-gray-200 rounded"></div>
                  <span>No spending</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-50 border border-blue-100 rounded"></div>
                  <span>£1-49</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-100 border border-blue-200 rounded"></div>
                  <span>£50-149</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-200 border border-blue-300 rounded"></div>
                  <span>£150-299</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-300 border border-blue-400 rounded"></div>
                  <span>£300+</span>
                </div>
              </div>
            </>
          )}

          {/* Traditional Budget Tab */}
          {activeTab === 'Budget' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Monthly Income</h3>
                    <DollarSign className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="space-y-2">
                    <input
                      type="number"
                      placeholder="Enter monthly income"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      value={budget}
                      onChange={(e) => setBudget(Number(e.target.value) || 0)}
                    />
                    <p className="text-sm text-gray-500">Your total monthly income</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Fixed Expenses</h3>
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="text-2xl font-bold text-gray-900">£{Math.round(statistics.totalMonthly)}</div>
                  <p className="text-sm text-gray-500">{subs.length} subscriptions + {plannedItems.length} planned expenses</p>
                </div>

                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">Available</h3>
                    <Target className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className={`text-2xl font-bold ${statistics.budgetRemaining >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    £{Math.round(statistics.budgetRemaining)}
                  </div>
                  <p className="text-sm text-gray-500">
                    {statistics.budgetRemaining >= 0 ? 'Available to spend' : 'Over budget'}
                  </p>
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-100">
                  <h3 className="font-semibold text-gray-900">Spending by Category</h3>
                  <p className="text-sm text-gray-500 mt-1">Track your monthly expenses across different categories</p>
                </div>
                
                <div className="p-6">
                  <div className="space-y-4">
                    {Object.entries(
                      allItems.reduce((acc, item) => {
                        acc[item.category] = (acc[item.category] || 0) + item.cost;
                        return acc;
                      }, {} as Record<string, number>)
                    )
                      .sort(([,a], [,b]) => b - a)
                      .map(([category, total]) => {
                        const percentage = budget > 0 ? (total / budget) * 100 : 0;
                        const categoryItems = allItems.filter(item => item.category === category);
                        
                        return (
                          <div key={category} className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-lg">{categoryItems[0]?.emoji || '💰'}</span>
                                <span className="font-medium text-gray-900 capitalize">{category}</span>
                                <span className="text-sm text-gray-500">({categoryItems.length} items)</span>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-gray-900">£{Math.round(total)}</div>
                                <div className="text-xs text-gray-500">{Math.round(percentage)}% of income</div>
                              </div>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div 
                                className={`h-2 rounded-full transition-all duration-500 ${
                                  percentage > 30 ? 'bg-red-500' :
                                  percentage > 20 ? 'bg-yellow-500' : 'bg-blue-500'
                                }`}
                                style={{ width: `${Math.min(100, percentage)}%` }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>

              <TraditionalBudget />
            </div>
          )}

          {/* Analytics Tab */}
          {activeTab === 'Analytics' && (
            <div className="space-y-6">
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="font-semibold text-gray-900 mb-4">Spending Analysis</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-700">Subscription Health</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Active subscriptions</span>
                        <span className="text-sm font-medium">{subs.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Potential savings</span>
                        <span className="text-sm font-medium text-green-600">£{Math.round(statistics.potentialSavings)}/mo</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Avg. cost per subscription</span>
                        <span className="text-sm font-medium">£{subs.length ? Math.round(statistics.totalMonthly / subs.length) : 0}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-700">Budget Performance</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Budget utilization</span>
                        <span className="text-sm font-medium">{Math.round((statistics.totalMonthly / budget) * 100)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Fixed vs Variable</span>
                        <span className="text-sm font-medium">{Math.round((subs.length / allItems.length) * 100)}% fixed</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">Days until next payment</span>
                        <span className="text-sm font-medium">
                          {statistics.upcoming.length > 0 ? `${statistics.upcoming[0].date - new Date().getDate()} days` : 'None scheduled'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actionable Insights */}
                <div className="border-t pt-6">
                  <h4 className="font-medium text-gray-700 mb-3">Insights & Recommendations</h4>
                  <div className="space-y-3">
                    {statistics.potentialSavings > 50 && (
                      <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
                        <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
                        <div>
                          <p className="text-sm font-medium text-green-800">High savings potential</p>
                          <p className="text-sm text-green-700">You could save £{Math.round(statistics.potentialSavings)} per month by reviewing underutilized subscriptions.</p>
                        </div>
                      </div>
                    )}
                    
                    {statistics.budgetRemaining < 0 && (
                      <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
                        <div className="w-2 h-2 bg-red-500 rounded-full mt-2"></div>
                        <div>
                          <p className="text-sm font-medium text-red-800">Budget exceeded</p>
                          <p className="text-sm text-red-700">Your fixed expenses exceed your budget by £{Math.abs(Math.round(statistics.budgetRemaining))}.</p>
                        </div>
                      </div>
                    )}
                    
                    {statistics.upcoming.length > 3 && (
                      <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
                        <div>
                          <p className="text-sm font-medium text-blue-800">Upcoming payment cluster</p>
                          <p className="text-sm text-blue-700">{statistics.upcoming.length} payments due in the next 7 days. Consider spreading them out.</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Enhanced drawer with budget support */}
          {drawer && (
            <div className="fixed inset-0 z-40 flex">
              <div className="flex-1 bg-black/40" onClick={() => setDrawer(null)} />
              <div className="w-full max-w-md bg-white h-full shadow-xl p-6 overflow-y-auto rounded-l-3xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-extrabold">Day {drawer.day}</h3>
                  <button onClick={() => setDrawer(null)} className="px-2 py-1 rounded-xl hover:bg-gray-100">Close</button>
                </div>

                <div className="space-y-3">
                  {drawer.items.length === 0 && (
                    <div className="rounded-2xl border p-4 bg-gray-50 text-sm text-gray-600">
                      No items on this day.
                    </div>
                  )}

                  {drawer.items.map((item) => (
                    <div
                      key={item.id}
                      className={`border rounded-2xl p-3 flex items-center justify-between ${
                        item.source === 'budget' 
                          ? 'bg-gradient-to-r from-blue-50 to-blue-100 border-blue-200' 
                          : 'bg-gradient-to-r from-white to-gray-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{item.emoji}</span>
                          <p className="font-semibold text-gray-900 truncate">{item.name}</p>
                          {item.source === 'budget' && (
                            <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                              Budget
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">
                          {item.source === 'budget' ? 'Monthly budget' : item.type} • 
                          <span className="capitalize"> {item.category}</span> • 
                          £{Math.round(item.cost)}
                          {item.savingOpportunity ? ` • Save £${Math.round(item.savingOpportunity)}` : ''}
                        </p>
                      </div>
                      
                      {item.source === 'budget' && (
                        <div className="text-xs text-blue-600">
                          Adjust in Budget tab
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Add Expense Modal */}
          {newPlanOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              <div className="fixed inset-0 bg-black/40" onClick={() => setNewPlanOpen(null)} />
              <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl p-6 w-full max-w-md mx-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-gray-900">Add Planned Expense</h3>
                  <button 
                    onClick={() => setNewPlanOpen(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg"
                  >
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleAddPlannedExpense} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Expense Name
                    </label>
                    <input
                      type="text"
                      value={newPlan.name}
                      onChange={(e) => setNewPlan(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., Gym membership, Netflix, Groceries"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Amount (£)
                    </label>
                    <input
                      type="number"
                      value={newPlan.amount}
                      onChange={(e) => setNewPlan(prev => ({ ...prev, amount: e.target.value }))}
                      placeholder="25.00"
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Category
                    </label>
                    <select
                      value={newPlan.category}
                      onChange={(e) => setNewPlan(prev => ({ ...prev, category: e.target.value as Item['category'] }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="housing">🏠 Housing</option>
                      <option value="utilities">⚡ Utilities</option>
                      <option value="food">🛒 Food & Groceries</option>
                      <option value="transport">🚗 Transport</option>
                      <option value="entertainment">🎭 Entertainment</option>
                      <option value="software">💻 Software & Apps</option>
                      <option value="fitness">💪 Health & Fitness</option>
                      <option value="insurance">🛡️ Insurance</option>
                      <option value="savings">📈 Savings & Investments</option>
                      <option value="other">💰 Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Frequency
                    </label>
                    <select
                      value={newPlan.freq}
                      onChange={(e) => setNewPlan(prev => ({ ...prev, freq: e.target.value as 'once'|'monthly'|'annual' }))}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="once">One-time payment</option>
                      <option value="monthly">Monthly recurring</option>
                      <option value="annual">Annual recurring</option>
                    </select>
                  </div>

                  {(newPlan.freq === 'monthly' || newPlan.freq === 'annual') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Day of Month
                      </label>
                      <select
                        value={newPlan.dayOfMonth}
                        onChange={(e) => setNewPlan(prev => ({ ...prev, dayOfMonth: Number(e.target.value) }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                          <option key={day} value={day}>{day}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {newPlan.freq === 'once' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Date
                      </label>
                      <input
                        type="date"
                        value={newPlan.date}
                        onChange={(e) => setNewPlan(prev => ({ ...prev, date: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        required
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setNewPlanOpen(null)}
                      className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!newPlan.name || !newPlan.amount}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Add Expense
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Enhanced Upload Section */}
          <div className="bg-blue-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-blue-900 font-medium">
                Upload your bank statements to find subscriptions
              </span>
              <div className="flex gap-2">
                <label
                  className={`bg-white text-blue-600 px-4 py-2 rounded-lg text-sm font-medium border border-blue-200 flex items-center gap-2 cursor-pointer hover:bg-gray-50 ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  <Upload className="w-4 h-4" />
                  {uploading ? 'Processing...' : 'Upload & review'}
                  <input
                    type="file"
                    accept=".txt,.csv,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUploadForReview(file);
                    }}
                    disabled={uploading}
                  />
                </label>
                
                {plannedItems.length > 0 && (
                  <button
                    onClick={migratePlannedToSubscriptions}
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                    disabled={uploading}
                  >
                    {uploading ? 'Migrating...' : `Migrate ${plannedItems.length} Planned Items`}
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-green-700">
              <div className="w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs">✓</span>
              </div>
              <span className="text-sm">
                {subs.length} subscriptions tracked • {plannedItems.length} planned items • {allItems.length} total items
              </span>
            </div>
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

        </main>
      </div>
    </HouseholdBudgetProvider>
  );
}