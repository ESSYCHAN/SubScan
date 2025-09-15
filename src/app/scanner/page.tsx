'use client';
import React, { useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { subscriptionService, Subscription } from '../../lib/subscriptionService';
import { useRouter } from 'next/navigation';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, ArrowLeft, Zap, Brain } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import { DateUtils } from '@/utils/dateHelpers';
import { ValidationUtils } from '@/utils/validation';
import { BankStatementParser } from '@/utils/bankStatementParser';




// ──────────────────────────────────────────────────────────────────────────────
// TYPES
// ──────────────────────────────────────────────────────────────────────────────
interface TransactionRow {
  description?: string;
  Description?: string;
  Transaction?: string;
  merchant?: string;
  Merchant?: string;
  amount?: string | number;
  Amount?: string | number;
  date?: string;
  Date?: string;
  [key: string]: any;
}

interface MatchedCategory {
  category: string;
  matches: string[];
}

interface ProcessedTransaction extends TransactionRow {
  id: string;
  isSubscription: boolean;
  confidence: number;
  merchantName: string;
  amount: number;
  date: string;
  categories: MatchedCategory[];
  indicators: string[];
  originalDescription: string;
  lastUsed?: string;
  daysSinceUsed?: number;
  usageFrequency?: 'daily' | 'weekly' | 'monthly' | 'rarely';
}

// ──────────────────────────────────────────────────────────────────────────────
// HELPERS: DATES & STRING NORMALIZATION
// ──────────────────────────────────────────────────────────────────────────────
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const;

function parseLeadingStatementDate(line: string, fallbackYear?: number): string | null {
  const m = line.match(/^\s*(\d{1,2})(st|nd|rd|th)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
  if (!m) return null;
  const day = m[1].padStart(2, '0');
  const mon = MONTHS.indexOf(m[3].toLowerCase() as typeof MONTHS[number]);
  if (mon < 0) return null;
  const yearMatch = line.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : (fallbackYear ?? new Date().getFullYear());
  const d = new Date(year, mon, Number(day));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function convertSantanderDate(dateStr: string): string {
  const [day, month, year] = dateStr.split('-');
  return `${year}-${month}-${day}`;
}

function normalizeBrandAliases(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace('amazon prime*', 'amazon prime')
    .replace('prime video*', 'prime video')
    .replace('apple.com/bill', 'apple services')
    .replace('apple.com', 'apple services')
    .replace('linkedinprea', 'linkedin premium')
    .replace('h3g', 'three')
    .replace('vodafone uk', 'vodafone')
    .trim();
}

const SERVICE_MAP: Record<string, string> = {
  'netflix': 'Netflix',
  'amazon prime': 'Amazon Prime',
  'prime video': 'Amazon Prime Video',
  'spotify': 'Spotify',
  'apple services': 'Apple Services',
  'apple music': 'Apple Music',
  'google one': 'Google One',
  'linkedin premium': 'LinkedIn Premium',
  'skillshare': 'Skillshare',
  'cursor': 'Cursor AI',
  'adobe': 'Adobe Creative Cloud',
  'microsoft 365': 'Microsoft 365',
  'office 365': 'Office 365',
  'virgin active': 'Virgin Active',
  'puregym': 'PureGym',
  'openai': 'OpenAI',
  'chatgpt plus': 'ChatGPT Plus',
  'three': 'Three (H3G)',
  'o2': 'O2',
  'vodafone': 'Vodafone',
  'bt broadband': 'BT Broadband',
  'virgin media': 'Virgin Media',
  'now tv': 'NOW TV',
  'disney+': 'Disney+',
  'disney plus': 'Disney+',
  'guardian': 'The Guardian',
  'financial times': 'Financial Times',
  'economist': 'The Economist'
};

function cleanMerchantName(name: string) {
  return name
    .replace(/CARD PAYMENT TO\s*/i,'')
    .replace(/DIRECT DEBIT PAYMENT TO\s*/i,'')
    .replace(/\(VIA APPLE PAY\)/i,'')
    .replace(/\s+ON\s*$/i,'')
    .replace(/\s{2,}/g,' ')
    .replace(/[^a-zA-Z0-9\s.&-]/g,' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function mapBrandAliases(n: string) {
  const s = n.toLowerCase();
  if (s.includes('apple.com') || s.includes('apple bill')) return 'Apple Services';
  if (s.includes('prime video') || s.includes('amazon prime')) return 'Amazon Prime';
  if (s.includes('google one')) return 'Google One';
  if (s.includes('linkedin premium') || s.includes('linkedinprea')) return 'LinkedIn Premium';
  // add more as needed
  return cleanMerchantName(n);
}

function isLikelySubscription(merchantName: string, amount: number): boolean {
  const subscriptionKeywords = [
    'netflix','spotify','apple','amazon prime','prime video','google one','microsoft','adobe',
    'linkedin','skillshare','virgin active','three','openai','shopify','cursor','indesign','startup plan',
    'now tv','disney+','disney plus','bt broadband','virgin media','o2','vodafone','guardian',
    'financial times','economist','dropbox','notion','zoom','figma','github'
  ];
  const merchant = merchantName.toLowerCase();
  const keywordHit = subscriptionKeywords.some(k => merchant.includes(k));
  const pricey = amount >= 4.5 && amount <= 120;
  const psychology = (amount.toFixed(2).endsWith('.99') || amount.toFixed(2).endsWith('.95'));
  const roundSmall = (amount <= 50 && amount % 5 === 0);
  return keywordHit || (pricey && (psychology || roundSmall));
}

function calculateNextBilling(lastSeen: string): string {
  const d = new Date(lastSeen);
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0,10);
  const day = d.getDate();
  const target = new Date(d);
  target.setMonth(target.getMonth() + 1);
  if (target.getDate() !== day) {
    target.setDate(0);
  }
  return target.toISOString().slice(0, 10);
}

// ──────────────────────────────────────────────────────────────────────────────
// PDF → TRANSACTIONS EXTRACTOR (Santander-focused)
// ──────────────────────────────────────────────────────────────────────────────
// utils/pdfSantander.ts
export async function extractSantanderTransactionsV2(arrayBuffer: ArrayBuffer) {
  const pdfjsLib: any = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

  type Tx = {
    id: string;
    description: string;
    originalDescription: string;
    merchantName: string;
    amount: number;
    date: string;
    type: 'card_payment'|'apple_pay'|'direct_debit'|'unknown';
    category: 'subscription'|'unknown';
  };

  const out: Tx[] = [];
  let id = 1;
  // const ordinalRx = /^\s*(\d{1,2})(st|nd|rd|th)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b.*\b(20\d{2})\b/i;
  const dayRx = /\b(\d{2})-(\d{2})-(\d{4})\b/;               // dd-mm-yyyy
  const moneyRx = /(?<!\d)(\d{1,6}\.\d{2})(?!\d)/;          // 8.99, 203.00 etc
  const lineJoin = (parts: string[]) => parts.join(' ').replace(/\s{2,}/g,' ').trim();

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();

    // 1) group by y (line)
    const lines = new Map<number, Array<{x:number,y:number,str:string}>>();
    for (const it of tc.items as any[]) {
      if (!('str' in it) || !it.str?.trim()) continue;
      const x = it.transform[4], y = Math.round(it.transform[5]); // snapped y
      const bucketY = y;                                          // tight bucket; tweak +/- if needed
      if (!lines.has(bucketY)) lines.set(bucketY, []);
      lines.get(bucketY)!.push({ x, y: bucketY, str: it.str.trim() });
    }

    // 2) process each line left→right
    const sortedY = [...lines.keys()].sort((a,b)=>b-a);           // pdf.js y desc
    for (const y of sortedY) {
      const items = lines.get(y)!.sort((a,b)=>a.x-b.x);
      const raw = lineJoin(items.map(i=>i.str));
      const ordinalRx = /^\s*(\d{1,2})(st|nd|rd|th)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b.*\b(20\d{2})\b/i;
      const hasDdmm = dayRx.test(raw);
      const hasOrdinal = ordinalRx.test(raw);

      if (!hasDdmm && !hasOrdinal) continue;

      // Figure out dateISO and an x-threshold (dateX) to split the line
      let dateISO: string | null = null;
      let dateX = Number.NEGATIVE_INFINITY;
      let dateToken = items.find(i => dayRx.test(i.str));

      if (dateToken) {
        // Normal dd-mm-yyyy case
        const m = dateToken.str.match(dayRx) || raw.match(dayRx)!;
        const [_, dd, mm, yyyy] = m;
        dateISO = `${yyyy}-${mm}-${dd}`;
        dateX = dateToken.x;
      } else {
        // Leading ordinal date like "7th Aug 2025 ..."
        const m = raw.match(ordinalRx)!;
        const day = m[1].padStart(2, '0');
        const monIdx = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
          .indexOf(m[3].toLowerCase());
        const year = Number(m[4]);
        const d = new Date(year, monIdx, Number(day));
        dateISO = isNaN(d.getTime()) ? null : d.toISOString().slice(0,10);

        // Best-effort split: treat everything to the right of the leftmost token as "after date"
        dateX = Math.min(...items.map(i => i.x)) + 1;
      }
      if (!dateISO) continue;

      // Amounts AFTER the date (avoids picking the running balance on the left)
      const afterDate = items.filter(i => i.x > dateX);
      const nums = afterDate
        .map(i => {
          const m = i.str.match(moneyRx);
          return m ? { x: i.x, val: parseFloat(m[1]) } : null;
        })
        .filter(Boolean) as Array<{ x:number, val:number }>;
      if (nums.length === 0) continue;
      nums.sort((a,b)=>a.x-b.x);
      let amount = nums[0].val;
      if (nums.length >= 2) amount = Math.min(nums[0].val, nums[1].val);

      // Text on each side of the date split (needed because DD lines put the date first)
      const textBeforeDate = lineJoin(items.filter(i => i.x < dateX).map(i => i.str));
      const textAfterDate  = lineJoin(items.filter(i => i.x > dateX).map(i => i.str));

      // Merchant extraction — try both sides and then the whole line
      let merchant = (() => {
        const sources = [textBeforeDate, textAfterDate, raw];

        for (const src of sources) {
          let m = src.match(/CARD PAYMENT TO\s+(.+?)\s+(?:ON\b|£|\d{2}-\d{2}-\d{4}|$)/i);
          if (m) return cleanMerchantName(m[1]);

          m = src.match(/(.+?)\s*\(VIA APPLE PAY\)/i);
          if (m) return cleanMerchantName(m[1]);

          m = src.match(/DIRECT DEBIT PAYMENT TO\s+(.+?)\s+REF/i);
          if (m) return cleanMerchantName(m[1]);
        }

        // Fallback: last 4–6 words nearby
        const words = (textBeforeDate || textAfterDate || raw).split(/\s+/).slice(-6);
        return cleanMerchantName(words.join(' '));
      })();

      // filter out obvious non-subs rows (optional)
      if (amount < 0.5 || amount > 1000) continue;

      out.push({
        id: `santander_${id++}`,
        description: raw,
        originalDescription: raw,
        merchantName: mapBrandAliases(merchant),
        amount,
        date: dateISO,
        type: /apple pay/i.test(raw) ? 'apple_pay'
            : /direct debit/i.test(raw) ? 'direct_debit'
            : /card payment/i.test(raw) ? 'card_payment'
            : 'unknown',
        category: 'subscription'
      });
    }
  }

  return out;
}



// ──────────────────────────────────────────────────────────────────────────────
// RECURRENCE BOOST HELPERS
// ──────────────────────────────────────────────────────────────────────────────
function normKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function daysBetween(aISO: string, bISO: string): number {
  const a = new Date(aISO);
  const b = new Date(bISO);
  return Math.abs(Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)));
}

function priceSimilar(a: number, b: number): boolean {
  if (!isFinite(a) || !isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= 1) return true;
  const pct = diff / Math.max(a, b);
  return pct <= 0.06; // 6%
}

function buildOccurrenceIndex(rows: Array<{ merchantName: string; date: string; amount: number }>) {
  const map = new Map<string, { name: string; entries: Array<{ date: string; amount: number }> }>();

  for (const r of rows) {
    const key = normKey(r.merchantName || '');
    if (!key) continue;
    if (!map.has(key)) map.set(key, { name: r.merchantName, entries: [] });
    map.get(key)!.entries.push({ date: r.date, amount: r.amount });
  }

  for (const v of map.values()) {
    v.entries = v.entries
      .filter(e => !!e.date && !isNaN(new Date(e.date).getTime()))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }
  return map;
}

function computeRecurrenceBoost(entries: Array<{ date: string; amount: number }>): { boost: number; notes: string[] } {
  if (!entries || entries.length < 2) return { boost: 0, notes: [] };

  let monthlyPairs = 0;
  let stablePairs = 0;
  let chainLen = 1;
  const notes: string[] = [];

  for (let i = 1; i < entries.length; i++) {
    const d = daysBetween(entries[i - 1].date, entries[i].date);
    const monthly = d >= 25 && d <= 35;
    const stable = priceSimilar(entries[i - 1].amount, entries[i].amount);

    if (monthly) {
      monthlyPairs++;
      if (stable) stablePairs++;
      chainLen++;
    } else {
      chainLen = 1;
    }
  }

  let boost = 0;
  if (monthlyPairs >= 1) { boost += 0.20; notes.push('monthly cadence'); }
  if (stablePairs >= 1) { boost += 0.10; notes.push('stable pricing'); }
  if (chainLen >= 3)   { boost += 0.15; notes.push('3+ consecutive months'); }
  if (boost > 0.40) boost = 0.40;

  return { boost, notes };
}

// ──────────────────────────────────────────────────────────────────────────────
// CORE DETECTOR (with recurrence boost)
// ──────────────────────────────────────────────────────────────────────────────
const detectSubscriptions = async (data: TransactionRow[]): Promise<ProcessedTransaction[]> => {
  const excludePatterns = [
    'uber','lyft','taxi','bus','train','tfl travel','stagecoach','lothian buses','oxford bus',
    'restaurant','cafe','coffee','pub','takeaway','pizza','mcdonald','costa coffee','starbucks',
    'greggs','tesco stores','asda stores','sainsburys','waitrose','co-op group','newington green fruit',
    'ebay','argos','john lewis','marks spencer','matalan store','primark','h&m','zara',
    'fuel','petrol','diesel','parking','toll','insurance','dentist','doctor','pharmacy','hospital',
    'church','donation','wedding','funeral','charity','bill payment via faster payment',
    'council tax','water bill','gas bill','electricity'
  ];

  const subscriptionPatterns: Record<string, string[]> = {
    streaming: ['netflix','amazon prime video','prime video','disney plus','disney+','now tv','sky go','spotify','apple music','youtube premium','bbc iplayer','itv hub'],
    software: ['adobe','microsoft 365','office 365','google workspace','google one','canva pro','notion','slack','zoom','teams','dropbox pro','linkedin premium','skillshare','cursor','github','figma','openai','chatgpt plus','apple.com/bill','apple.com','apple services','startup plan'],
    telecom: ['virgin media','bt broadband','ee monthly','three contract','o2 monthly','vodafone contract','three','o2','vodafone'],
    fitness: ['virgin active','puregym','the gym group','david lloyd','nuffield health','peloton','fitness first'],
    news: ['times subscription','guardian','financial times','economist','new york times','washington post']
  };

  const subscriptionIndicators: string[] = [
    'subscription','monthly membership','annual plan','premium','pro plan','plus subscription'
  ];

  const prelim = (data || []).map((row: TransactionRow): ProcessedTransaction | null => {
    const description = (row.description || row.Description || row.Transaction || '').toLowerCase();
    const searchText = description;

    if (excludePatterns.some(p => searchText.includes(p))) return null;

    const amount = Math.abs(parseFloat(row.amount?.toString() || row.Amount?.toString() || '0')) || 0;

    const matchedCategories: MatchedCategory[] = [];
    let confidence = 0.1;

    Object.entries(subscriptionPatterns).forEach(([category, keywords]) => {
      const matches = keywords.filter(k => searchText.includes(k));
      if (matches.length) {
        matchedCategories.push({ category, matches });
        confidence += 0.6;
      }
    });

    const indicatorMatches = subscriptionIndicators.filter(ind => searchText.includes(ind));
    if (indicatorMatches.length) confidence += 0.3;

    if (amount > 0) {
      if (amount >= 4.99 && amount <= 99.99) confidence += 0.2;
      const amtStr = amount.toFixed(2);
      if (amtStr.endsWith('.99') || amtStr.endsWith('.95')) confidence += 0.2;
      if (amount <= 50 && amount % 5 === 0) confidence += 0.1;
    }

    if (searchText.includes('direct debit') || searchText.includes('dd payment')) {
      confidence += 0.3;
    }

    const dateISO = (() => {
      let d = (row.date || row.Date || '').toString();
      if (!d) return new Date().toISOString().split('T')[0];
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? new Date().toISOString().split('T')[0] : dt.toISOString().split('T')[0];
    })();

    const merchantName = extractMerchantName(searchText, matchedCategories);
if (searchText.includes('amazon.co.uk') && !/prime|digital|membership/.test(searchText)) {
  return null; // marketplace shopping – not a sub
}
    return {
      ...row,
      id: `scan_${Math.random().toString(36).substr(2, 9)}`,
      isSubscription: false,
      confidence: Math.min(confidence, 1.0),
      merchantName,
      amount,
      date: dateISO,
      categories: matchedCategories,
      indicators: indicatorMatches,
      originalDescription: description,
      lastUsed: dateISO,
      daysSinceUsed: Math.floor((Date.now() - new Date(dateISO).getTime()) / 86400000),
      usageFrequency: 'weekly'
    };
  }).filter((x): x is ProcessedTransaction => !!x);

  const occIndex = buildOccurrenceIndex(
    prelim.map(p => ({ merchantName: p.merchantName, date: p.date, amount: p.amount }))
  );

  for (const p of prelim) {
    const key = normKey(p.merchantName);
    const bucket = occIndex.get(key);
    if (bucket && bucket.entries.length >= 2) {
      const { boost, notes } = computeRecurrenceBoost(bucket.entries);
      if (boost > 0) {
        p.confidence = Math.min(1, p.confidence + boost);
        p.indicators = [...new Set([...(p.indicators || []), ...notes])];
      }
    }
    p.isSubscription = p.confidence >= 0.45;
  }

  return prelim;
};

// ──────────────────────────────────────────────────────────────────────────────
// MERCHANT NAME EXTRACTION (unchanged, slight tweaks for mapping)
// ──────────────────────────────────────────────────────────────────────────────
function extractMerchantName(description: string, categories: MatchedCategory[]): string {
  const serviceMap: Record<string, string> = {
    'netflix': 'Netflix',
    'amazon prime video': 'Amazon Prime Video',
    'prime video': 'Amazon Prime Video',
    'spotify': 'Spotify',
    'apple music': 'Apple Music',
    'google one': 'Google One',
    'linkedin premium': 'LinkedIn Premium',
    'skillshare': 'Skillshare',
    'cursor': 'Cursor AI',
    'adobe': 'Adobe Creative Cloud',
    'microsoft 365': 'Microsoft 365',
    'office 365': 'Office 365',
    'virgin active': 'Virgin Active',
    'puregym': 'PureGym',
    'openai': 'OpenAI',
    'chatgpt plus': 'ChatGPT Plus',
    'apple.com/bill': 'Apple Services',
    'apple services': 'Apple Services',
    'three': 'Three (H3G)'
  };

  for (const [key, name] of Object.entries(serviceMap)) {
    if (description.includes(key)) return name;
  }

  if (categories.length > 0 && categories[0].matches.length > 0) {
    const match = categories[0].matches[0];
    return serviceMap[match] || (match.charAt(0).toUpperCase() + match.slice(1));
  }

  const cleanDesc = description
    .replace(/card payment to /gi, '')
    .replace(/direct debit payment to /gi, '')
    .replace(/bill payment via faster payment to /gi, '')
    .replace(/\(via apple pay\)/gi, '')
    .replace(/on \d{2}-\d{2}-\d{4}/gi, '')
    .replace(/[^a-zA-Z\s]/g, ' ')
    .trim();

  const words = cleanDesc.split(/\s+/).filter(w => w.length > 2);
  return words.slice(0, 2).join(' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown Service';
}

// ──────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ──────────────────────────────────────────────────────────────────────────────
export default function ScannerPageV8() {
  const { user } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState('');
  const [processedCount, setProcessedCount] = useState(0);

  // UTILITY FUNCTIONS - Add these inside your component
  const extractAmount = (text: string): number => {
    return DateUtils.extractAmount(text);
  };

  const extractDate = (text: string): string | null => {
    return DateUtils.parseStatementDate(text);
  };

  const categorizeSubscription = (name: string): string => {
    const lower = name.toLowerCase();
    if (['netflix','disney','amazon prime','spotify','apple music'].some(s => lower.includes(s))) return 'streaming';
    if (['gym','fitness','peloton','virgin active'].some(s => lower.includes(s))) return 'fitness';
    if (['adobe','microsoft','google','linkedin'].some(s => lower.includes(s))) return 'software';
    if (['deliveroo','uber eats','hello fresh'].some(s => lower.includes(s))) return 'food';
    return 'other';
  };

  const estimateUsage = (name: string): string => {
    const lower = name.toLowerCase();
    if (['spotify','apple music','microsoft'].some(s => lower.includes(s))) return 'daily';
    if (['netflix','disney'].some(s => lower.includes(s))) return 'weekly';
    if (['gym','adobe'].some(s => lower.includes(s))) return 'monthly';
    return 'rarely';
  };

  const calculateRisk = (sub: any): string => {
    if (sub.confidence < 0.6) return 'medium';
    if (sub.amount > 30) return 'high';
    return 'low';
  };

  const calculateDaysSince = (dateStr: string): number => {
    const date = new Date(dateStr);
    const now = new Date();
    return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  };

  // ENHANCED PARSE FILE FUNCTION
  const parseFileEnhanced = async (f: File) => {
    console.log('parseFileEnhanced called with file:', f.name);
    if (!user) return;

    setIsProcessing(true);
    setProcessedCount(0);

    try {
      const reader = new FileReader();

      reader.onload = async (e) => {
        try {
          let data: any[] = [];

          if (f.name.endsWith('.csv') || f.type === 'text/csv') {
            const text = e.target?.result as string;
            const lines = text.split('\n').filter(line => line.trim());
            if (lines.length < 2) { setError('CSV file appears to be empty or invalid'); return; }
            const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
            data = lines.slice(1).map((line, index) => {
              const values = line.split(',').map(v => v.trim().replace(/['"]/g, ''));
              const row: any = {};
              headers.forEach((header, idx) => { row[header] = values[idx] || ''; });
              row.originalIndex = index;
              return row;
            }).filter(row => Object.values(row).some(val => val !== ''));

          } else if (f.name.match(/\.xlsx?$/i)) {
            try {
              const XLSX = await import('xlsx');
              const arrayBuffer = e.target?.result as ArrayBuffer;
              const workbook = XLSX.read(arrayBuffer, { type: 'array' });
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              data = XLSX.utils.sheet_to_json(worksheet);
            } catch (xlsxError) {
              setError('Excel file processing requires additional setup. Please use CSV format for now.');
              return;
            }

          } else if (f.name.endsWith('.pdf') || f.type === 'application/pdf') {
            console.log('PDF detected, processing...'); // ADD THIS
            try {
              const arrayBuffer = e.target?.result as ArrayBuffer;
              console.log('ArrayBuffer size:', arrayBuffer.byteLength); // ADD THIS
              let txs = await extractSantanderTransactionsV2(arrayBuffer);
              data = txs;

              if (!data || data.length === 0) {
                console.log('No data from Santander extractor, trying fallback'); // ADD THIS
                const pdfjsLib: any = await import('pdfjs-dist');
                pdfjsLib.GlobalWorkerOptions.workerSrc =
                  new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

                const uint8Array = new Uint8Array(arrayBuffer);
                const pdf = await pdfjsLib.getDocument({ data: uint8Array }).promise;

                let completeText = '';
                for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
                  const page = await pdf.getPage(pageNum);
                  const textContent = await page.getTextContent();
                  const textItems = textContent.items.filter((it: any) => 'str' in it && 'transform' in it);
                  const sorted = textItems.sort((a: any, b: any) => {
                    const yDiff = Math.abs(b.transform[5] - a.transform[5]);
                    return yDiff > 2 ? b.transform[5] - a.transform[5] : a.transform[4] - b.transform[4];
                  });
                  let pageText = '';
                  let lastY: number | null = null;
                  for (const item of sorted) {
                    const currentY = Math.round(item.transform[5]);
                    const t = item.str.trim();
                    if (t) {
                      if (lastY !== null && Math.abs(currentY - lastY) > 2) pageText += '\n';
                      else if (pageText && !pageText.endsWith(' ')) pageText += ' ';
                      pageText += t;
                      lastY = currentY;
                    }
                  }
                  completeText += pageText + '\n';
                }

                data = completeText.split('\n').map((line, i) => ({
                  id: `fallback_${i}`,
                  description: line.trim(),
                  amount: extractAmount(line),
                  date: extractDate(line) || new Date().toISOString().slice(0,10),
                  category: 'Unknown'
                })).filter(r => r.amount > 0);
              }

              console.log('PDF parsed transactions:', data.slice(0, 10));

            } catch (pdfError) {
              console.error('PDF parsing error:', pdfError);
              setError('Could not process PDF. Please try exporting as CSV from your online banking instead.');
              return;
            }

          } else {
            // NEW: Enhanced text file processing using BankStatementParser
            const text = e.target?.result as string;
            
            try {
              const parsedSubscriptions = BankStatementParser.parseStatementText(text);
              
              if (parsedSubscriptions.length > 0) {
                console.log(`Bank parser found ${parsedSubscriptions.length} subscriptions`);
                
                data = parsedSubscriptions.map((sub, index) => ({
                  id: `bank_${index}`,
                  description: sub.merchant,
                  originalDescription: sub.merchant,
                  merchantName: sub.name,
                  amount: sub.cost,
                  date: sub.lastUsed,
                  category: sub.category
                }));
              } else {
                const lines = text.split('\n').filter(line => line.trim());
                data = lines.map((line, index) => ({
                  id: index + 1,
                  description: line.trim(),
                  amount: extractAmount(line),
                  date: extractDate(line) || new Date().toISOString().split('T')[0],
                  category: 'Unknown'
                }));
              }
            } catch (bankParserError) {
              console.log('Bank parser failed, using fallback:', bankParserError);
              const lines = text.split('\n').filter(line => line.trim());
              data = lines.map((line, index) => ({
                id: index + 1,
                description: line.trim(),
                amount: extractAmount(line),
                date: extractDate(line) || new Date().toISOString().split('T')[0],
                category: 'Unknown'
              }));
            }
          }

          if (data.length === 0) { setError('No valid transactions found in the file'); return; }
          
          data = (data || []).filter((r: any) => {
            const desc = (r.description || '').toLowerCase();
            if (desc.includes('balance')) return false;
            return r.amount >= 0.5 && r.amount <= 1000;
          });
          
          console.log('[SCAN] raw parsed rows:', data.length);

          const processedData = await detectSubscriptions(data);
          console.log('[SCAN] after detectSubscriptions:', processedData.length);

          const yes = processedData.filter(x => x.isSubscription);
          const maybe = processedData.filter(x => x.confidence >= 0.35 && x.confidence < 0.45);
          console.log('[SCAN] subs>=0.45:', yes.length, ' maybe 0.35–0.44:', maybe.length);

          console.table(yes.slice(0,15).map(x => ({
            date: x.date, merchant: x.merchantName, amt: x.amount, conf: x.confidence
          })));

          const subscriptionData = processedData.filter(item => item.isSubscription && item.confidence > 0.3);

          if (subscriptionData.length === 0) {
            setSuccess(`Analyzed ${processedData.length} transactions but found no clear subscription patterns. Try uploading a statement with more recurring payments.`);
            return;
          }

          let savedCount = 0;
          for (const sub of subscriptionData) {
            try {
              const subName = (sub.merchantName || 'Unknown Service').trim();
              const now = new Date();
              const subscription: Omit<Subscription, 'id'> = {
                userId: user.uid,
                name: subName,
                cleanName: sub.merchantName,
                originalName: sub.originalDescription || sub.description || 'Unknown',
                cost: sub.amount,
                billingCycle: 'monthly',
                nextBilling: calculateNextBilling(sub.date),
                category: categorizeSubscription(sub.merchantName),
                lastUsed: sub.date,
                usageFrequency: (estimateUsage(sub.merchantName) as any),
                signUpDate: sub.date,
                source: 'bank_scan',
                confidence: sub.confidence,
                risk: (calculateRisk(sub) as any),
                daysSinceUsed: calculateDaysSince(sub.date),
                createdAt: Timestamp.fromDate(now),
                updatedAt: Timestamp.fromDate(now)
              };

              await subscriptionService.createSubscription(user.uid, subscription);
              savedCount++;
              setProcessedCount(savedCount);
            } catch (saveError) {
              console.error('Error saving subscription:', saveError);
            }
          }

          setSuccess(`Successfully processed ${savedCount} subscriptions from ${processedData.length} transactions!`);
          setTimeout(() => { router.push('/dashboard'); }, 2000);

        } catch (parseError) {
          console.error('Parse error:', parseError);
          setError('Error parsing file. Please check the format and try again.');
        } finally {
          setIsProcessing(false);
        }
      };

      if (f.name.match(/\.xlsx?$/i) || f.name.endsWith('.pdf')) {
        reader.readAsArrayBuffer(f);
      } else {
        reader.readAsText(f);
      }

    } catch (error) {
      console.error('File read error:', error);
      setError('Error reading file');
      setIsProcessing(false);
    }
  };

  const handleFiles = useCallback(async (files: FileList) => {
    console.log('handleFiles called with:', files.length, 'files');
    if (!files || files.length === 0 || !user) return;

    const f = files[0];
    console.log('Processing file:', f.name, f.type);
    const validation = ValidationUtils.validateFileUpload(f);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file type');
      return;
    }

    if (!ValidationUtils.checkRateLimit(`upload_${user.uid}`, 5, 60000)) {
      setError('Too many uploads. Please wait a minute before trying again.');
      return;
    }

    setFile(f);
    setError('');
    setSuccess('');
    await parseFileEnhanced(f); // Call the enhanced version
  }, [user]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFiles(e.dataTransfer.files);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault(); if (e.target.files && e.target.files[0]) handleFiles(e.target.files);
  };

  if (!user) return null;

  // Keep all your existing JSX exactly the same
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Your existing JSX stays the same */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button onClick={() => router.push('/dashboard')} className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors">
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Dashboard</span>
              </button>
              <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Brain className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-sm text-gray-600">{user.displayName || user.email}</div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center space-x-2 bg-blue-50 text-blue-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
            <Zap className="h-4 w-4" />
            <span>Enhanced AI-Powered Subscription Detection v8.2</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Bank Statement Scanner</h1>
          <p className="text-gray-600 text-lg">Upload your bank statement (PDF/CSV/TXT) and let our enhanced AI find all subscriptions</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div
            className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
              dragActive ? 'border-blue-500 bg-blue-50 scale-105' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".csv,.xls,.xlsx,.txt,.pdf"
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isProcessing}
            />

            <div className="space-y-6">
              {isProcessing ? (
                <div className="space-y-4">
                  <Loader2 className="mx-auto h-16 w-16 text-blue-500 animate-spin" />
                  <div>
                    <p className="text-xl font-semibold text-gray-900">Enhanced processing your file...</p>
                    <p className="text-gray-600">Advanced AI is analyzing your transactions</p>
                    {processedCount > 0 && (
                      <p className="text-blue-600 mt-2">Saved {processedCount} subscriptions to your account</p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <Upload className="mx-auto h-16 w-16 text-gray-400" />
                  <div>
                    <p className="text-xl font-semibold text-gray-900">Drop your statement here, or click to browse</p>
                    <p className="text-gray-600 mt-2">Enhanced support for CSV, Excel (XLS/XLSX), PDF, and TXT files</p>
                  </div>
                </div>
              )}

              {file && !isProcessing && (
                <div className="flex items-center justify-center space-x-3 text-gray-600 bg-gray-50 p-4 rounded-lg">
                  <FileText className="h-5 w-5" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-sm">{(file.size / 1024).toFixed(1)} KB</span>
                </div>
              )}
            </div>
          </div>

          {error && (
            <div className="mt-6 flex items-start space-x-3 text-red-600 bg-red-50 p-4 rounded-lg border border-red-200">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Upload Error</p>
                <p className="text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {success && (
            <div className="mt-6 flex items-start space-x-3 text-green-600 bg-green-50 p-4 rounded-lg border border-green-200">
              <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Success!</p>
                <p className="text-sm mt-1">{success}</p>
                <p className="text-sm mt-1">Redirecting to your dashboard...</p>
              </div>
            </div>
          )}

          <div className="mt-8 text-center">
            <div className="grid md:grid-cols-3 gap-4 text-sm text-gray-500">
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span>100% Private & Secure</span>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span>Enhanced AI Detection v8.2</span>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span>Saves to Your Account</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 bg-green-50 rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 mb-4">🚀 Enhanced PDF Processing v8.2</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
            <div>• Leading-date capture for DD rows</div>
            <div>• Santander transaction pattern recognition</div>
            <div>• Recurrence-based confidence boost</div>
            <div>• Expanded service alias normalization</div>
            <div>• Better merchant name extraction</div>
            <div>• Safer next-billing calculation</div>
          </div>
        </div>

        <div className="mt-4 bg-blue-50 rounded-xl p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Supported UK Banks</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-700">
            <div>• Lloyds Banking Group</div>
            <div>• Barclays</div>
            <div>• HSBC</div>
            <div>• <strong>Santander UK ✨</strong></div>
            <div>• NatWest Group</div>
            <div>• Monzo</div>
            <div>• Starling Bank</div>
            <div>• Revolut</div>
          </div>
        </div>
      </div>
    </div>
  );
}