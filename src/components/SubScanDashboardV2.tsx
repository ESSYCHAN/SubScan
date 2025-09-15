// components/SubScanDashboardV2.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon, DollarSign, AlertTriangle, Target,
  ChevronLeft, ChevronRight, Search, Upload, Settings, FileText,
  Filter, Clock
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
// ✅ Use the unwrapped budget panel + hook + provider
import HouseholdBudgetProvider from "@/components/HouseholdBudgetProvider";
import { EnhancedHomeBudgetPanelUnwrapped } from "@/components/HomeBudgetExtensions";
// components/EnhancedHomeBudget.tsx (where you render BudgetSheet now)
import GroupedBudgetSheet from "@/components/GroupedBudgetSheet";

// import HouseholdBudgetProvider from "@/components/HouseholdBudgetProvider";
import { useEnhancedBudget } from "@/components/HouseholdBudgetProvider";


// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
export type Item = {
  id: string;
  name: string;
  category: 'streaming'|'software'|'fitness'|'housing'|'food'|'savings'|'insurance'|'transport'|'utilities'|'entertainment'|'other';
  cost: number; // monthly-normalised cost
  day: number;  // billing day of month (1-31)
  emoji?: string;
  type: 'subscription'|'planned';
  priority?: 'essential'|'savings'|'goals';
  savingOpportunity?: number;
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
  billingDate?: number;     // explicit day-of-month
  dayOfMonth?: number;      // alias
  nextBilling?: string;     // YYYY-MM-DD
  lastUsed?: string;        // YYYY-MM-DD
  signUpDate?: string;      // YYYY-MM-DD
  frequency?: 'monthly'|'weekly'|'annual'|'unknown';
  confidence?: number;
  savingOpportunity?: number;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  source?: 'bank_scan'|'manual';
  pausedUntil?: string;     // YYYY-MM-DD — paused through this month
};

type FSPlanned = {
  userId: string;
  name: string;
  category: Item['category'];
  amount: number;
  frequency: 'once'|'monthly'|'annual';
  date?: string;        // for 'once': YYYY-MM-DD
  dayOfMonth?: number;  // for monthly/annual
  start?: string;       // optional start window YYYY-MM-DD
  end?: string;         // optional end window YYYY-MM-DD
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
};

// ──────────────────────────────────────────────────────────────────────────────
const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] as const;
const monthName = (d: Date) => d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const isoWeekdayIndex = (jsDay: number) => (jsDay + 6) % 7; // Mon=0
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

const intensityEmoji = (amt: number) => (amt===0?'🙂':amt<100?'💨':amt<500?'⚡':amt<1000?'🔥':'💥');
const heatClass = (amt: number) => {
  if (amt === 0) return 'bg-white/80';
  if (amt < 100)  return 'bg-sky-50';
  if (amt < 500)  return 'bg-amber-50';
  if (amt < 1000) return 'bg-rose-50';
  return 'bg-fuchsia-50';
};

// Map scanner categories → budget category names
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

// ✅ Bridge subs/planned totals into EnhancedBudget context
// ✅ Bridge subs/planned totals into EnhancedBudget/HouseholdBudget context
function BudgetBridge({ subs, planned }: { subs: Item[]; planned: Item[] }) {
  const { categories, setDerivedSpentLocal } = useEnhancedBudget();

  // Build totals per *category name* (monthly)
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

  useEffect(() => {
    const nextMap: Record<string, number> = {};
    for (const [name, value] of totals) {
      const cat = categories.find(c => c.name === name);
      if (cat) nextMap[cat.id] = value;
    }
    // zero any category not present this month
    const namesThisMonth = new Set(Array.from(totals.keys()));
    for (const c of categories) {
      if (!namesThisMonth.has(c.name)) nextMap[c.id] = 0;
    }
    setDerivedSpentLocal(nextMap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalsSig, catsSig]); // <- stable deps only

  // Build the next map deterministically from the signatures
  const nextMap = useMemo(() => {
    const map: Record<string, number> = {};
    const namesThisMonth = new Set(Array.from(totals.keys()));

    // fill existing category ids that match names
    for (const [name, value] of totals) {
      const cat = categories.find((c) => c.name === name);
      if (cat) map[cat.id] = value;
    }
    // explicit zero for categories not present this month
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
      setDerivedSpentLocal(nextMap); // local-only, NOT persisted
      prevSigRef.current = nextSig;
    }
  }, [nextSig, nextMap, setDerivedSpentLocal]);

  return null;
}



// ──────────────────────────────────────────────────────────────────────────────
// DATE HELPERS FOR PAUSE / PLANNED
// ──────────────────────────────────────────────────────────────────────────────
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
  if (freq === 'monthly' || freq === 'weekly' || freq === 'unknown') return true;
  const pick = rec.nextBilling || rec.signUpDate;
  if (!pick) return false;
  const d = new Date(pick);
  return !isNaN(d.getTime()) && d.getMonth() === month.getMonth();
}

// ──────────────────────────────────────────────────────────────────────────────
// DATA HOOKS
// ──────────────────────────────────────────────────────────────────────────────
function useSubscriptionItems(userId?: string, selectedMonth?: Date) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const y = selectedMonth?.getFullYear();
  const m = selectedMonth?.getMonth();
  const totalDays = (y!=null && m!=null) ? daysInMonth(y, m) : 31;

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

        if (selectedMonth && (isPausedThisMonth(d, selectedMonth) || !occursThisMonthSub(d, selectedMonth))) return;

        const sanitizedName = ValidationUtils.sanitizeMerchantName(
          d.name || d.merchant || d.serviceName || 'Unknown Service'
        );
        
        const cost = normaliseMonthly(d.cost ?? d.amount ?? d.monthlyFee ?? 0, d.frequency);
        if (!ValidationUtils.isValidAmount(cost)) {
          console.warn(`Invalid amount for ${sanitizedName}: ${cost}`);
          return;
        }

        const day = clamp(billingDayFromRecord(d), 1, totalDays);
        const category = categoryMap[d.category||''] || 'other';

        arr.push({
          id: sdoc.id,
          name: sanitizedName,
          category,
          cost,
          day,
          emoji: getServiceEmoji(sanitizedName),
          type: 'subscription',
          savingOpportunity: d.savingOpportunity ?? ((d.confidence||0) < 70 ? cost : 0),
          raw: d
        });
      });
      setItems(arr);
      setError(null);
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
          raw: p
        });
      });
      setItems(out);
    });
    return () => unsub();
  }, [userId, selectedMonth]);
  return items;
}

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS
// ──────────────────────────────────────────────────────────────────────────────
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

const exportCSV = (rows: ParsedResult[]) => {
  const header = ['name','category','cost','frequency','nextBilling','lastUsed','confidence'];
  const lines = [
    header.join(','),
    ...rows.map(r => [
      JSON.stringify(r.name || ''),
      JSON.stringify(r.category || ''),
      (r.cost ?? 0),
      JSON.stringify(r.frequency || ''),
      JSON.stringify(r.nextBilling || ''),
      JSON.stringify(r.lastUsed || ''),
      (r.confidence ?? '')
    ].join(','))
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'subscan_review.csv';
  a.click();
  URL.revokeObjectURL(url);
};

const fmtShort = (d: Date) =>
  d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const toDate = (s?: string) => {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

function deriveWindowLabel(rows: any[]): string | undefined {
  const dates: Date[] = [];
  for (const r of rows) {
    const a = toDate(r.lastUsed);
    const b = toDate(r.nextBilling);
    const c = toDate(r.signUpDate);
    if (a) dates.push(a);
    if (b) dates.push(b);
    if (c) dates.push(c);
  }
  if (dates.length < 1) return undefined;
  const min = new Date(Math.min(...dates.map(d => d.getTime())));
  const max = new Date(Math.max(...dates.map(d => d.getTime())));
  if (min.getTime() === max.getTime()) return fmtShort(min);
  return `${fmtShort(min)} – ${fmtShort(max)}`;
}
function pickFocusMonthFromRows(rows:any[]): Date | null {
  const dates: Date[] = [];
  rows.forEach(r=>{
    [r.lastUsed, r.nextBilling, r.signUpDate].forEach((x:string)=>{ 
      const d = x ? new Date(x) : null;
      if (d && !isNaN(d.getTime())) dates.push(d);
    });
  });
  if (!dates.length) return null;
  const max = new Date(Math.max(...dates.map(d=>d.getTime())));
  return new Date(max.getFullYear(), max.getMonth(), 1);
}

const AMOUNT_RE = /(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+(?:\.\d{2}))/;
const looksLikeMoney = (s:string) => AMOUNT_RE.test(s);

function extractNameAndAmount(line:string){
  const m = line.match(AMOUNT_RE);
  if (!m) return null;
  const amount = Number(m[1].replace(/,/g,''));
  let name = line.slice(0, m.index!).trim();
  name = name.replace(/^(\d{1,2}[\-\/ ][A-Za-z]{3}|\d{1,2}[\-\/]\d{1,2}[\-\/]\d{2,4})\s+/,'');
  name = name.replace(/\bPOS\b|\bCARD\b|\bDD\b|\bDIRECT\s+DEBIT\b|\bVISA\b|\bMASTERCARD\b/gi,'').trim();
  return { name, amount };
}

function findPotentialCandidates(fullText: string, detected: ParsedResult[]): Candidate[] {
  const detectedNames = new Set(detected.map(r => r.name.toLowerCase()));
  const lines = fullText.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);

  const HINTS = [
    /premium/i, /membership/i, /subscribe/i, /subscription/i, /auto-?renew/i,
    /direct\s*debit|\bDD\b/i, /annual/i, / renewal/i, /plan\b/i
  ];

  const out: Candidate[] = [];

  for (const raw of lines) {
    if (!looksLikeMoney(raw)) continue;
    if (!HINTS.some(rx => rx.test(raw))) continue;

    const parsed = extractNameAndAmount(raw);
    if (!parsed) continue;

    const canonical = parsed.name.toLowerCase();
    if (!canonical || detectedNames.has(canonical)) continue;
    if (canonical.length < 3) continue;

    let frequency: Candidate['frequency'] = 'unknown';
    if (/annual/i.test(raw) || /\byr\b|\bye?a?r/i.test(raw)) frequency = 'annual';
    else if (/monthly|per\s*month|\/\s*m(o|th)/i.test(raw)) frequency = 'monthly';
    else if (/\bweekly|\bper\s*week|\/\s*w(k|eek)/i.test(raw)) frequency = 'weekly';

    const ref = raw.length > 120 ? raw.slice(0, 120) + '…' : raw;

    out.push({
      name: parsed.name,
      ref,
      amount: parsed.amount,
      frequency
    });
  }

  const dedup = new Map<string, Candidate>();
  out.forEach(c => {
    const key = `${c.name.toLowerCase()}__${c.amount.toFixed(2)}`;
    if (!dedup.has(key)) dedup.set(key, c);
  });

  const filtered = Array.from(dedup.values()).filter(c =>
    !Array.from(detectedNames).some(dn => dn.includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(dn))
  );

  return filtered.slice(0, 25);
}

const plannedMonthTotal = (items: Item[]) =>
  items.filter(i => i.type === 'planned').reduce((s, i) => s + (i.cost || 0), 0);

function exportPlannedToICS(planned: Item[], month: Date) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const pad = (n:number)=>String(n).padStart(2,'0');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SubScan//Planner//EN',
  ];

  planned.forEach(p => {
    const day = clamp(p.day, 1, daysInMonth(y, m));
    const dt = `${y}${pad(m+1)}${pad(day)}`;
    const uid = `${y}${m+1}${day}-${encodeURIComponent(p.id)}@subscan`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${y}${pad(m+1)}${pad(day)}T000000Z`,
      `DTSTART;VALUE=DATE:${dt}`,
      `SUMMARY:${p.name} (${fmtGBP(p.cost)})`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');

  const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `subscan-${y}-${m+1}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ──────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────────────────────────────────────
export default function SubScanDashboardV2() {
  // Auth
  const [user, authLoading] = useAuthState(auth);
  useEffect(() => {
    if (!authLoading && !user) signInAnonymously(auth).catch(() => {});
  }, [user, authLoading]);

  // UI state
  const [current, setCurrent] = useState(() => new Date());
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<'all'|Item['category']>('all');
  const [drawer, setDrawer] = useState<null | { day: number; items: Item[] }>(null);
  const [budget, setBudget] = useState<number>(1200);
  const [debugDates, setDebugDates] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{type:'success'|'error'|'info'; msg:string}|null>(null);

  const showToast = (type:'success'|'error'|'info', msg:string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewResults, setReviewResults] = useState<ParsedResult[]>([]);
  const [reviewStats, setReviewStats] = useState<{ detected:number; monthlyTotal:number; annualTotal:number; avgConfidence:number; windowLabel?:string }>();
  const [candidates, setCandidates] = useState<Candidate[]>([]);

  const [newPlanOpen, setNewPlanOpen] = useState<{day:number}|null>(null);
  const [newPlan, setNewPlan] = useState<{name:string; amount:string; freq:'once'|'monthly'|'annual'}>({name:'', amount:'', freq:'once'});

  const [manageCatsOpen, setManageCatsOpen] = useState(false);
  const [customCats, setCustomCats] = useState<string[]>(['Travel', 'Side Hustle']);
  const [newCat, setNewCat] = useState('');

  // Upload handler (CSV/TXT/PDF) – saves to Firestore
  const handleFileUpload = async (file: File) => {
    if (!user?.uid) return;

    const { valid, error } = ValidationUtils.validateFileUpload(file);
    if (!valid) { showToast('error', error || 'Invalid file'); return; }

    if (!ValidationUtils.checkRateLimit(`upload:${user.uid}`, 4, 30_000)) {
      showToast('error','Too many uploads. Please wait a few seconds and try again.');
      return;
    }

    setUploading(true);
    try {
      let text: string;
      if (file.type === 'application/pdf') {
        text = await extractPdfText(file);
        text = normalizeSantanderRows(text).join('\n');
      } else {
        text = await file.text();
      }

      const parsed = BankStatementParser.parseStatementText(text);
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
      setReviewStats({ ...stats, windowLabel: deriveWindowLabel(parsed) });
      setReviewOpen(true);

      const batched: Promise<any>[] = [];
      const slug = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64);
      const to2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

      for (const s of parsed) {
        const id = `scan_${user.uid}_${slug(s.name)}_${Math.round(to2(s.cost) * 100)}_${s.frequency}`;
        const ref = doc(collection(db, 'subscriptions'), id);

        const docData = cleanForFirestore({
          userId: user.uid,
          ...s,
          cost: to2(s.cost),
          amount: to2(s.cost),
          monthlyFee: to2(s.cost),
          dayOfMonth: s.billingDate,
          updatedAt: Timestamp.now(),
          createdAt: Timestamp.now(),
        });

        batched.push(setDoc(ref, docData, { merge: true }));
      }

      await Promise.all(batched);
      showToast('success', `Saved ${parsed.length} subscription${parsed.length > 1 ? 's' : ''}`);
    } catch (e) {
      console.error(e);
      showToast('error','Error processing file. Check the format and try again.');
    } finally {
      setUploading(false);
    }
  };

  // Upload & Review only (no writes)
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
        setReviewStats({ ...stats, windowLabel: deriveWindowLabel(parsed) });
        setCandidates(findPotentialCandidates(text, mapped));
      } else {
        text = await file.text();
        const parsed = BankStatementParser.parseStatementText(text);
        if (!parsed.length) {
          showToast('info','No recurring-looking rows detected. Try another export.');
          return;
        }

        const focus = pickFocusMonthFromRows(parsed);
        if (focus) setCurrent(focus);

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
        setReviewStats({ ...stats, windowLabel: deriveWindowLabel(parsed) });
        setCandidates(findPotentialCandidates(text, mapped));
      }

      setReviewOpen(true);
    } catch (e) {
      console.error(e);
      showToast('error','Error processing file. Check the format and try again.');
    } finally {
      setUploading(false);
    }
  };

  const saveAllFromReview = async () => {
    if (!user?.uid || !reviewResults.length) return;
    try {
      setUploading(true);
      const batched: Promise<any>[] = [];
      const slug = (s: string) =>
        s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64);
      const to2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

      for (const r of reviewResults) {
        const id = `scan_${user.uid}_${slug(r.name)}_${Math.round(to2(r.cost) * 100)}_${r.frequency}`;
        const ref = doc(collection(db, 'subscriptions'), id);
        const docData = cleanForFirestore({
          userId: user.uid,
          name: r.name,
          category: r.category,
          cost: to2(r.cost),
          amount: to2(r.cost),
          monthlyFee: to2(r.cost),
          frequency: r.frequency || 'monthly',
          nextBilling: r.nextBilling || undefined,
          lastUsed: r.lastUsed || undefined,
          confidence: r.confidence ?? 90,
          dayOfMonth: r.meta?.billingDate,
          updatedAt: Timestamp.now(),
          createdAt: Timestamp.now(),
          source: 'bank_scan'
        });
        batched.push(setDoc(ref, docData, { merge: true }));
      }

      await Promise.all(batched);
      showToast('success', `Saved ${reviewResults.length} subscription${reviewResults.length>1?'s':''}`);
      setReviewOpen(false);
    } catch (e) {
      console.error(e);
      showToast('error','Failed to save subscriptions.');
    } finally {
      setUploading(false);
    }
  };

  // Data
  const { items: subs, loading, error } = useSubscriptionItems(user?.uid, current);
  const plannedItems = usePlannedItems(user?.uid, current);
  const isLoading = authLoading || loading;

  // Merge
  const allItems = useMemo(() => [...subs, ...plannedItems], [subs, plannedItems]);

  const year = current.getFullYear();
  const month = current.getMonth();
  const totalDays = daysInMonth(year, month);
  const first = firstWeekdayOfMonthMonday(year, month);

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
    filtered.forEach(i => {
      const d = clamp(i.day, 1, totalDays);
      arr[d].push(i);
    });
    for (let d=1; d<=totalDays; d++) {
      arr[d].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'subscription' ? -1 : 1;
        return (b.cost||0) - (a.cost||0);
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
    for (let r=0; r<6; r++){
      const row: (number|null)[] = [];
      for (let c=0; c<7; c++) {
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
    setCurrent(d);
  };
  const isToday = (d: number) => {
    const now = new Date();
    return d === now.getDate() && month === now.getMonth() && year === now.getFullYear();
  };

  // Pause / Resume
  async function pauseForThisMonth(item: Item) {
    if (!user?.uid || item.type !== 'subscription') return;
    const y = current.getFullYear();
    const m = current.getMonth();
    const ref = doc(db, 'subscriptions', item.id);
    await setDoc(ref, {
      userId: user.uid,                       // keep ownership invariant for rules
      pausedUntil: endOfMonthISO(y, m),       // string
      updatedAt: serverTimestamp(),
    }, { merge: true });
    showToast('info', `Paused ${item.name} for ${monthName(current)}`);
  }
  async function resume(item: Item) {
    if (!user?.uid || item.type !== 'subscription') return;
    const ref = doc(db, 'subscriptions', item.id);
    await setDoc(ref, {
      userId: user.uid,                       // again, keep invariant
      pausedUntil: deleteField(),             // remove the field
      updatedAt: serverTimestamp(),
    }, { merge: true });
    showToast('success', `Resumed ${item.name}`);
  }

  const onAddManual = (c: Candidate) => {
    const freq = c.frequency || (c.amount > 1000 ? 'annual' : 'monthly');
    setReviewResults(prev => [...prev, {
      name: ValidationUtils.sanitizeMerchantName(c.name) || 'Unknown Service',
      category: 'other',
      cost: Math.round((c.amount + Number.EPSILON) * 100) / 100,
      frequency: freq,
      confidence: 60,
      meta: { source: 'candidate', ref: c.ref }
    }]);
    setCandidates(prev => prev.filter(x => !(x.name === c.name && x.amount === c.amount)));
    showToast('info', `Added "${c.name}" to review`);
  };

  // Loading / error
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#fafafa] to-[#f3f6ff]">
      {/* Header */}
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
          <div className="hidden sm:flex items-center gap-2">
            <label
              className={`px-3 py-1.5 text-sm bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg flex items-center gap-2 shadow hover:brightness-105 cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Processing…' : 'Upload & Review'}
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
            <button
              onClick={() => { window.location.hash = '#budget'; }}
              className="underline"
            >
              Plan budget →
            </button>

            <button onClick={() => window.location.href = '/pdf-extractor'} className="px-3 py-1.5 text-sm bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg flex items-center gap-2 shadow hover:brightness-105">
              <FileText className="w-4 h-4" /> PDF Extract
            </button>

            <button onClick={() => window.location.href = '/settings'} className="px-3 py-1.5 text-sm bg-white border rounded-lg flex items-center gap-2 hover:bg-gray-50">
              <Settings className="w-4 h-4" /> Settings
            </button>
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
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm/5 opacity-90">Total Monthly</p>
                <p className="text-2xl font-bold">{fmtGBP(monthTotal)}</p>
                <p className="text-xs opacity-75">{subs.length} subscriptions</p>
              </div>
              <DollarSign className="w-8 h-8 opacity-90" />
            </div>
          </div>
          <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-sm/5 opacity-90">Budget</p>
                <div className="flex items-center gap-2 mt-1">
                  <input
                    className="w-28 px-2 py-1 rounded bg-white/90 text-gray-900 text-sm"
                    value={budgetInput}
                    onChange={(e)=>setBudgetInput(e.target.value)}
                    onBlur={()=>setBudget(Number(budgetInput) || 0)}
                  />
                  <span className="text-sm/5 opacity-90">Remaining</span>
                </div>
                <p className="text-2xl font-bold mt-1">{fmtGBP((Number(budgetInput)||0) - monthTotal)}</p>
              </div>
              <Target className="w-8 h-8 opacity-90" />
            </div>
            <div className="mt-3 h-2.5 w-full bg-white/30 rounded-full overflow-hidden">
              <div className="h-full bg-white/90" style={{ width: `${budgetPct}%` }} />
            </div>
          </div>
          <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm/5 opacity-90">Potential Savings</p>
                <p className="text-2xl font-bold">{fmtGBP(totalSavings)}</p>
                <p className="text-xs opacity-75">Optimise or cancel</p>
              </div>
              <Target className="w-8 h-8 opacity-90" />
            </div>
          </div>
          <div className="bg-gradient-to-r from-rose-500 to-rose-600 rounded-2xl p-5 text-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm/5 opacity-90">Upcoming Week</p>
                <p className="text-2xl font-bold">
                  {fmtGBP(perDayTotals.slice(new Date().getDate(), new Date().getDate()+7).reduce((a,b)=>a+(b||0),0))}
                </p>
                <p className="text-xs opacity-75">Bills due</p>
              </div>
              <AlertTriangle className="w-8 h-8 opacity-90" />
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button onClick={() => goto(-1)} className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200">
              <ChevronLeft className="w-5 h-5 text-gray-700" />
            </button>
            <h2 className="text-xl font-extrabold text-gray-900">{monthName(current)}</h2>
            <button onClick={() => goto(1)} className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200">
              <ChevronRight className="w-5 h-5 text-gray-700" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search subscriptions..."
                className="pl-8 pr-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="relative">
              <Filter className="w-4 h-4 absolute left-2 top-2.5 text-gray-400" />
              <select
                value={filterCat}
                onChange={(e)=>setFilterCat(e.target.value as any)}
                className="pl-8 pr-3 py-2 bg-gray-50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All</option>
                {['streaming','software','fitness','housing','food','savings','insurance','transport','utilities','entertainment','other']
                  .map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <button
              onClick={()=>setDebugDates(v=>!v)}
              className={`px-3 py-2 rounded-xl text-sm border ${debugDates?'bg-yellow-50 border-yellow-300':'bg-white hover:bg-gray-50'}`}
            >
              <Clock className="inline w-4 h-4 mr-1"/> {debugDates? 'Hide' : 'Show'} date debug
            </button>
          </div>
        </div>

        {/* ✅ Single provider + bridge + unwrapped panel */}
        {/* <EnhancedBudgetProvider>
          <BudgetBridge subs={subs} planned={plannedItems} />
          <EnhancedHomeBudgetPanelUnwrapped /> 
        </EnhancedBudgetProvider>
   */}


      {/* parent provides the context */}
<HouseholdBudgetProvider>
  <BudgetBridge subs={subs} planned={plannedItems} />
  <EnhancedHomeBudgetPanelUnwrapped />
</HouseholdBudgetProvider>
{/* (Optional) keep GroupedBudgetSheet here OR show it on the page, but not both */}


        {/* Weekday header */}
        <div className="grid grid-cols-7 bg-gray-50 border-b rounded-2xl">
          {weekdays.map((w) => (
            <div key={w} className="p-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wide">{w}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-2 p-3">
          {matrix.map((row, ri) => (
            <React.Fragment key={ri}>
              {row.map((d, ci) => {
                if (!d) return <div key={`${ri}-${ci}`} className="h-24 rounded-2xl border border-dashed border-gray-200 bg-gray-50" />;
                const items = perDay[d];
                const total = perDayTotals[d] || 0;
                const today = isToday(d);
                return (
                  <button key={`${ri}-${ci}`} onClick={() => setDrawer({ day: d, items })} className={[
                    'relative h-24 p-2 rounded-2xl border text-left shadow-[0_1px_0_rgba(0,0,0,0.02)] transition will-change-transform',
                    'hover:shadow-sm hover:-translate-y-0.5 hover:rotate-[-0.25deg]',
                    heatClass(total), today ? 'ring-2 ring-blue-400 bg-blue-50' : ''
                  ].join(' ')}>
                    <div className="absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full bg-gradient-to-br from-yellow-200 to-pink-200 shadow border border-white rotate-[-6deg]" />
                    <div className={`text-xs font-bold mb-1 ${today ? 'text-blue-700' : 'text-gray-700'}`}>{d}</div>
                    <div className="space-y-1 overflow-hidden">
                      {items.slice(0,2).map(it => (
                        <div key={it.id} className="rounded-xl px-2 py-1 bg-white/70 backdrop-blur border border-white/60 flex justify-between items-center">
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-xs">{it.emoji}</span>
                            <span className="text-[11px] truncate">{it.name}</span>
                          </div>
                          <span className="text-[11px] font-semibold text-gray-800">{fmtGBP(it.cost)}</span>
                        </div>
                      ))}
                      {items.length > 2 && (
                        <div className="text-[11px] text-gray-500 text-center">+{items.length - 2} more</div>
                      )}
                    </div>
                    {total > 0 && (
                      <div className="absolute bottom-1 right-1 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/80 border border-white/70 text-[11px] text-gray-800">
                        <span>{intensityEmoji(total)}</span>
                        <span>{fmtGBP(total)}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>

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

                {drawer.items.map((it) => {
                  const pausedNow =
                    it.type === 'subscription' &&
                    it.raw?.pausedUntil &&
                    isPausedThisMonth(it.raw as FSSubscription, current);

                  return (
                    <div
                      key={it.id}
                      className="border rounded-2xl p-3 flex items-center justify-between bg-gradient-to-r from-white to-gray-50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{it.emoji}</span>
                          <p className="font-semibold text-gray-900 truncate">{it.name}</p>
                        </div>
                        <p className="text-sm text-gray-600">
                          {it.type} • <span className="capitalize">{it.category}</span> • {fmtGBP(it.cost)}
                          {it.savingOpportunity ? ` • Save ${fmtGBP(it.savingOpportunity)}` : ''}
                        </p>

                        {debugDates && it.raw && (
                          <div className="mt-1 text-xs text-gray-500">
                            {it.type === 'subscription' ? (
                              <>
                                <div>nextBilling: {it.raw.nextBilling || '-'}</div>
                                <div>billingDate/dayOfMonth: {it.raw.billingDate ?? it.raw.dayOfMonth ?? '-'}</div>
                                <div>lastUsed: {it.raw.lastUsed || '-'} • signUpDate: {it.raw.signUpDate || '-'}</div>
                                <div>pausedUntil: {it.raw.pausedUntil || '-'}</div>
                              </>
                            ) : (
                              <>
                                <div>planned.freq: {it.raw.frequency}</div>
                                <div>planned.date: {it.raw.date || '-'}</div>
                                <div>planned.dayOfMonth: {it.raw.dayOfMonth || '-'}</div>
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {it.type === 'subscription' ? (
                        <button
                          onClick={() => (pausedNow ? resume(it) : pauseForThisMonth(it))}
                          className="px-2.5 py-1.5 text-sm rounded-xl border bg-white hover:bg-gray-50"
                        >
                          {pausedNow ? 'Resume' : 'Pause (this month)'}
                        </button>
                      ) : (
                        <button className="px-2.5 py-1.5 text-sm rounded-xl border bg-white hover:bg-gray-50">
                          Edit
                        </button>
                      )}
                    </div>
                  );
                })}

                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => setNewPlanOpen({ day: drawer.day })}
                    className="px-3 py-2 rounded-xl text-sm border bg-white hover:bg-gray-50"
                  >
                    Add item to this day
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New planned item modal */}
        {newPlanOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
            <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow">
              <h4 className="text-lg font-semibold mb-3">Add planned item — {monthName(current)} {newPlanOpen.day}</h4>
              <div className="space-y-3">
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Name (e.g., School Fees)"
                  value={newPlan.name}
                  onChange={e=>setNewPlan(p=>({...p, name:e.target.value}))}
                />
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Amount (e.g., 120.00)"
                  value={newPlan.amount}
                  onChange={e=>setNewPlan(p=>({...p, amount:e.target.value}))}
                />
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={newPlan.freq}
                  onChange={e=>setNewPlan(p=>({...p, freq:e.target.value as any}))}
                >
                  <option value="once">One-off</option>
                  <option value="monthly">Monthly</option>
                  <option value="annual">Annual</option>
                </select>
              </div>
              <div className="mt-4 flex gap-2 justify-end">
                <button className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50" onClick={()=>setNewPlanOpen(null)}>Cancel</button>
                <button
                  className="px-3 py-2 rounded-lg text-white bg-gray-900 hover:bg-black"
                  onClick={async ()=>{
                    if (!user?.uid) return;
                    const y = current.getFullYear(), m = current.getMonth();
                    const day = newPlanOpen.day;
                    const amount = Number(newPlan.amount||'0');
                    if (!newPlan.name || !amount || amount<=0) return;

                    await addDoc(collection(db,'plannedItems'), {
                      userId: user.uid,
                      name: ValidationUtils.sanitizeMerchantName(newPlan.name),
                      category: 'other',
                      amount,
                      frequency: newPlan.freq,
                      ...(newPlan.freq==='once'
                        ? { date: new Date(y, m, day).toISOString().slice(0,10) }
                        : { dayOfMonth: clamp(day,1,31) }),
                      createdAt: serverTimestamp(),
                      updatedAt: serverTimestamp()
                    } as FSPlanned);

                    setNewPlan({name:'', amount:'', freq:'once'});
                    setNewPlanOpen(null);
                    showToast('success','Planned item added');
                  }}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        )}

        {manageCatsOpen && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
            <div className="w-full max-w-md bg-white rounded-2xl p-5 shadow">
              <h4 className="text-lg font-semibold mb-3">Manage categories</h4>

              <div className="flex gap-2 mb-3">
                <input
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  placeholder="Add category (e.g., Travel)"
                  value={newCat}
                  onChange={e=>setNewCat(e.target.value)}
                  onKeyDown={e=>{
                    if(e.key==='Enter' && newCat.trim()){
                      setCustomCats(cs => Array.from(new Set([...cs, newCat.trim()])));
                      setNewCat('');
                    }
                  }}
                />
                <button
                  className="px-3 py-2 rounded-lg text-sm border bg-white hover:bg-gray-50"
                  onClick={()=>{
                    if(!newCat.trim()) return;
                    setCustomCats(cs => Array.from(new Set([...cs, newCat.trim()])));
                    setNewCat('');
                  }}
                >
                  Add
                </button>
              </div>

              <div className="flex flex-wrap gap-2">
                {customCats.map(c=>(
                  <span key={c} className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-gray-100 text-gray-800 text-xs">
                    {c}
                    <button
                      className="text-gray-500 hover:text-gray-700"
                      onClick={()=>setCustomCats(cs=>cs.filter(x=>x!==c))}
                      aria-label={`remove ${c}`}
                      title={`remove ${c}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50" onClick={()=>setManageCatsOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Footer CTA */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-3xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-lg font-bold">Upload bank statements to auto-detect subscriptions</h4>
            <p className="text-sm/6 opacity-90">Paste your bank statement text or upload CSV files to automatically find recurring payments.</p>
          </div>
          <label
            className={`px-4 py-2 bg-white text-gray-900 rounded-xl font-semibold flex items-center gap-2 hover:bg-gray-100 transition-colors cursor-pointer ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Processing…' : 'Upload & Review'}
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
        </div>

        <StatementReview
          open={reviewOpen}
          onClose={() => setReviewOpen(false)}
          results={reviewResults}
          stats={reviewStats}
          candidates={candidates}
          onAddManual={onAddManual}
          onSaveAll={saveAllFromReview}
          onExportCSV={() => exportCSV(reviewResults)}
        />
      </main>
    </div>
  );
}
