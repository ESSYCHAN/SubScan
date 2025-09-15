// utils/bankStatementParser.ts
// Robust bank statement → recurring subscription extractor (UK-friendly)
// Works with CSV (common bank exports) and free-text lines.
// Exports keep your names/types so SubScanDashboardV2 just works.

export interface RawTransaction {
  date: string;         // yyyy-mm-dd
  description: string;
  amount: number;       // negative = spend, positive = income
  currency?: string;
  exchangeRate?: number;
}

export interface ParsedSubscription {
  name: string;
  merchant: string;
  serviceName: string;
  category: string; // 'Entertainment' | 'Software' | 'Fitness' | 'Telecom' | ...
  cost: number;     // positive, GBP
  frequency: 'monthly' | 'annual' | 'weekly' | 'unknown';
  billingDate: number; // 1-31
  confidence: number;  // 0-100
  source: 'bank_scan';
  lastUsed: string;    // yyyy-mm-dd
  signUpDate?: string; // yyyy-mm-dd
  nextBilling?: string;// yyyy-mm-dd (best guess)
  dayOfMonth?: number; // convenience alias
}

// Known services → category map (your labels)
const SERVICE_PATTERNS: Array<{ pattern: RegExp; category: string; service: string }> = [
  // Streaming & media
  { pattern: /netflix/i,                    category: 'Entertainment', service: 'Netflix' },
  { pattern: /spotify/i,                    category: 'Music',         service: 'Spotify' },
  { pattern: /prime\s*video/i,               category: 'Video',  service: 'Prime Video' },
  { pattern: /amazon\s*prime(?!\s*video)/i,  category: 'Video',  service: 'Amazon Prime' },
  { pattern: /disney/i,                     category: 'Video',         service: 'Disney+' },
  { pattern: /youtube.*premium/i,           category: 'Video',         service: 'YouTube Premium' },
  
  // Software / tech

  // Replace your Apple line in SERVICE_PATTERNS with:
  { pattern: /(?:apple(?:\s*\.?\s*com)?\s*\/?\s*bill|itunes|apple\s*services|app\s*store)/i,
  category: 'Software', service: 'Apple' },
  { pattern: /adobe/i,                      category: 'Software',      service: 'Adobe' },
  { pattern: /microsoft|office 365/i,       category: 'Software',      service: 'Microsoft' },
  { pattern: /google.*one/i,                category: 'Cloud Storage', service: 'Google One' },
  { pattern: /dropbox/i,                    category: 'Cloud Storage', service: 'Dropbox' },
  { pattern: /notion/i,                     category: 'Productivity',  service: 'Notion' },
  { pattern: /github/i,                     category: 'Software',      service: 'GitHub' },
  { pattern: /zoom/i,                       category: 'Software',      service: 'Zoom' },
  { pattern: /openai/i,                     category: 'Software',      service: 'OpenAI' },
  { pattern: /shopify/i,                    category: 'Software',      service: 'Shopify' },
  { pattern: /docker/i,                     category: 'Software',      service: 'Docker' },
  
  // Fitness
  { pattern: /virgin.*active/i,             category: 'Fitness',       service: 'Virgin Active' },
  { pattern: /puregym/i,                    category: 'Fitness',       service: 'PureGym' },

  // Telecom
  { pattern: /\b(three|h3g)\b/i,            category: 'Telecom',       service: 'Three' },
  { pattern: /vodafone/i,                   category: 'Telecom',       service: 'Vodafone' },
  { pattern: /\bee\b/i,                     category: 'Telecom',       service: 'EE' },
  { pattern: /\bo2\b/i,                     category: 'Telecom',       service: 'O2' },

  // Productivity / education

  { pattern: /skillshare/i,               category: 'Software',      service: 'Skillshare' },
  { pattern: /interview\s*query/i,               category: 'Productivity', service: 'Interview Query' },
  { pattern: /\bihsc\b/i,                        category: 'Other',        service: 'IHSC Membership' },
  { pattern: /startup\s*plan/i,                  category: 'Software',     service: 'Startup Plan' },
  { 
    pattern: /\b(?:linkedin|linked\s*in|lnkd)\b.*\b(premium|prem|subscription|subs|navigator|recruiter)\b/i,
    category: 'Productivity',
    service: 'LinkedIn Premium'
  },
  // Dev tools
  { pattern: /cursor.*ai/i,               category: 'Software',      service: 'Cursor' },
  { pattern: /overleaf|sharelatex/i,      category: 'Software',      service: 'Overleaf' },
  { pattern: /\bindesign\b/i,             category: 'Software',      service: 'InDesign' },
];

function isKnownServiceLine(s: string) {
  return SERVICE_PATTERNS.some(p => p.pattern.test(s));
}


// Merchants that mask service names (Apple.com/Bill, Google, etc):
const AMOUNT_SPLIT_MERCHANTS = [
  /apple(\s*\.?\s*com)?\s*\/?\s*bill/i,
  /apple\s*services|app\s*store/i,
  /google\s*(one|play|storage)/i,
  /amazon\s*digital/i, 
  /\b(three|vodafone|o2|ee)\b/i,
  /paypal/i, 
];

const MONTHLY_LIKELY = /(netflix|prime\s*video|amazon\s*prime|spotify|google\s*one|apple|openai|three|virgin\s*active|skillshare|notion|docker|overleaf|cursor|shopify|indesign|adobe|interview\s*query|linkedin\s*premium)/i;
const CSV_SPLIT = /,(?=(?:[^"]*"[^"]*")*[^"]*$)/;
const YEARLY_OPTION_BRANDS = /(amazon\s*prime|prime\s*video|skillshare|linkedin\s*premium|dropbox|adobe|microsoft|github|notion|zoom)/i;
const SINGLE_ANNUAL_MIN = 60;  // typical floor for annual lumpsums

// ---- helpers ----
function dequote(s: string) {
  const t = s.trim();
  return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}
function toNumber(n: string): number | null {
  if (n == null) return null;
  const cleaned = String(n).replace(/[£,\s]/g, '').replace(/\u2212/g, '-'); // handle comma thousands + unicode minus
  const v = Number(cleaned);
  return Number.isFinite(v) ? v : null;
}
function toISO(y:number,m:number,d:number){
  
  return new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10); 
}
function parseDateLoose(s: string): string | null {
  // 2025-08-03
  const iso = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return toISO(+iso[1], +iso[2], +iso[3]);
  // 03/08/2025 or 03-08-25
  const dmy = s.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (dmy) return toISO(dmy[3].length <= 2 ? +dmy[3] + 2000 : +dmy[3], +dmy[2], +dmy[1]);
  // "27th Jul" (assume current year)
  const domMon = s.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})\b/);
  if (domMon) {
    const monthIndex = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(domMon[2].slice(0,3).toLowerCase());
    if (monthIndex >= 0) return toISO(new Date().getFullYear(), monthIndex + 1, +domMon[1]);
  }
  return null;
}
function daysBetween(a: Date, b: Date) { return Math.abs((+a - +b) / 86400000); }
function inferFrequency(sortedDates: Date[]): ParsedSubscription['frequency'] {
  if (sortedDates.length < 2) return 'unknown';
  const gaps: number[] = [];
  for (let i = 1; i < sortedDates.length; i++) gaps.push(daysBetween(sortedDates[i], sortedDates[i - 1]));
  const median = gaps.sort((x, y) => x - y)[Math.floor(gaps.length / 2)];
  if (median >= 6 && median <= 8) return 'weekly';
  if (median >= 26 && median <= 35) return 'monthly';
  if (median >= 360 && median <= 380) return 'annual';
  return 'unknown';
}
function typicalAmount(amts: number[]) {
  const vals = amts.map(a => Math.abs(a)).filter(a => a > 0);
  if (!vals.length) return 0;
  const s = vals.sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function sanitizeMerchant(raw: string) {
  const s = (raw || '')
    .replace(/\bfaster\s*payments\s*(receipt|received|to|from)\b/gi, '')
    .replace(/^(CARD PAYMENT TO|BILL PAYMENT VIA FASTER PAYMENT TO|DIRECT DEBIT PAYMENT TO)\s*/i, '')
    .replace(/\(VIA (APPLE|GOOGLE) PAY\)/i, '')
    // --- PayPal wrappers ---
    .replace(/\bpaypal(?:\s*\*|\s+payment|\s+ecom|\s+intl)?\s*/gi, '')
    .replace(/\bpp\*\s*/gi, '')
    // ------------------------
    .replace(/\b(REF|REFERENCE|CARD|POS|CONTACTLESS|ONLINE|ECOM|E-COMMERCE)\b/gi, '')
    .replace(/\b(UK|GB|GBP)\b/gi, '')
    .replace(/\b(LTD|LIMITED|PLC|LLC|INC)\b/gi, '')
    .replace(/[0-9]{2,}/g, '')
    .replace(/[^a-zA-Z\s+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s.split(' ').map(w => w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : '').join(' ') || 'Unknown Service';
}
function categorize(serviceName: string): string {
  for (const { pattern, category } of SERVICE_PATTERNS) {
    if (pattern.test(serviceName)) return category;
  }
  return 'Other';
}
function matchService(desc: string): { name: string; merchant: string; conf: number } {
  const cleaned = desc.trim();
  for (const { pattern, service } of SERVICE_PATTERNS) {
    if (pattern.test(cleaned)) return { name: service, merchant: cleaned, conf: 95 };
  }
  const fallback = sanitizeMerchant(cleaned);
  return { name: fallback, merchant: cleaned, conf: 60 };
}
function extractFXInfo(description: string): { currency: 'GBP' | 'USD' | 'EUR' | 'AUD' | 'CAD'; amount?: number; rate?: number } {
  // Examples it handles:
  //  ",24.00 USD, RATE 0.7400/GBP"
  //  "EUR 12.99 FX RATE 0.86/GBP"
  //  ", 9.99 AUD RATE: 0.52/GBP"
  const m = description.match(/[, ](\d+(?:\.\d{2})?)\s*(USD|EUR|AUD|CAD)\b.*?(?:FX\s*RATE|RATE)[:\s]*([\d.]+)\s*\/?\s*GBP/i);
  if (m) return { currency: m[2] as any, amount: Number(m[1]), rate: Number(m[3]) };
  return { currency: 'GBP' };
}

function convertToGBP(amount: number, currency: string, rate?: number) {
  if (currency !== 'GBP' && rate) return amount * rate;
  return amount;
}

// ---- parsers ----
function isCSV(text: string) {
  const first = (text.split(/\r?\n/)[0] || '').toLowerCase();
  return first.includes(',') && /date|description|amount|merchant|details/.test(first);
}

function parseCSV(text: string): RawTransaction[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(CSV_SPLIT).map(dequote);
  const idx = { date: -1, desc: -1, amount: -1, inAmt: -1, outAmt: -1, curr: -1, rate: -1 };

  header.forEach((h, i) => {
    const k = h.toLowerCase().trim();
    if (/(^| )date( |$)|transaction date|posted date/.test(k)) idx.date = i;
    if (/description|details|merchant|narrative|transaction description|name/.test(k)) idx.desc = i;
    if (/amount(?!.*(in|out))/.test(k)) idx.amount = i;
    if (/money in|credit amount|paid in|deposit/.test(k)) idx.inAmt = i;
    if (/money out|debit amount|paid out|withdrawal/.test(k)) idx.outAmt = i;
    if (/currency/.test(k)) idx.curr = i;
    if (/rate|exchange/.test(k)) idx.rate = i;
  });

  const txns: RawTransaction[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(CSV_SPLIT).map(dequote);
    const rawDate = idx.date >= 0 ? cols[idx.date] : undefined;
    const rawDesc = idx.desc >= 0 ? cols[idx.desc] : undefined;

    let amt: number | null = null;
    if (idx.amount >= 0) amt = toNumber(cols[idx.amount] || '');
    else if (idx.inAmt >= 0 || idx.outAmt >= 0) {
      const inn = idx.inAmt >= 0 ? toNumber(cols[idx.inAmt] || '0') : 0;
      const out = idx.outAmt >= 0 ? toNumber(cols[idx.outAmt] || '0') : 0;
      amt = (inn || 0) - (out || 0);
    }

    const iso = rawDate ? (parseDateLoose(rawDate) || null) : null;
    if (!iso || !rawDesc || !Number.isFinite(amt)) continue;

    const currency = idx.curr >= 0 ? (cols[idx.curr] || 'GBP') : 'GBP';
    const rate = idx.rate >= 0 ? toNumber(cols[idx.rate] || '') || undefined : undefined;

    txns.push({ date: iso, description: rawDesc, amount: amt!, currency, exchangeRate: rate });
  }
  return txns;
}

function parsePlain(text: string): RawTransaction[] {
  const txns: RawTransaction[] = [];
  const lines = text.split(/\r?\n/).filter(Boolean);
  
  for (const line of lines) {
  const lo = line.toLowerCase();
  const isKnown = isKnownServiceLine(line);

  if (!isKnown && BALANCE_LINE_RX.test(lo)) continue;
  if (!isKnown && CREDIT_HINTS.some(h => lo.includes(h))) continue;
  

  const iso = parseDateLoose(line);

    if (!iso) continue;

    const amtAbs = extractAmount(line);
    if (!amtAbs) continue;

    const { currency, amount: fxAmt, rate } = extractFXInfo(line);
    const spend = currency !== 'GBP' && fxAmt ? convertToGBP(fxAmt, currency, rate) : amtAbs;


    const amount = -Math.abs(spend); // expenses are negative
    let desc = line
      .replace(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,}(?:\s+\d{2,4})?)\b/, '')
      .replace(/(\(?[-–−]?\s*£?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?)(?:\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?)?\s*$/, '')
      .trim() || 'Unknown Service';

    txns.push({ date: iso, description: desc, amount, currency, exchangeRate: rate });
  }
  return txns;
}

const STRONG_SUB_REGEX = /(subscription|subscrip|premium|membership|plan|renewal|direct\s*debit|mandate\s*no|autor?enew|annual|yearly)/i;
function hasStrongSubHints(s: string) { return STRONG_SUB_REGEX.test(s); }

function toSubscriptions(txns: RawTransaction[]): ParsedSubscription[] {
  // group by merchant (sanitized)
  const groups = new Map<string, RawTransaction[]>();
  for (const t of txns) {
    if (t.amount >= 0) continue; // only debits
    const name = sanitizeMerchant(t.description);
    if (!name || name === 'Unknown Service') continue;

    // if merchant is an "aggregator", split by rounded absolute amount
    const rawDesc = t.description.toLowerCase();
    const isAggregator = AMOUNT_SPLIT_MERCHANTS.some(rx => rx.test(rawDesc));

    const amountKey = isAggregator ? String(Math.round(Math.abs(t.amount) * 100)) : 'all';
    const key = `${name.toLowerCase()}__${amountKey}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  const subs: ParsedSubscription[] = [];
  for (const [key, arr] of groups.entries()) {
    const sampleDesc = (arr[0]?.description || key);
    const descBlob   = arr.map(a => a.description).join(' ').toLowerCase();
    const looksP2P = /\bmandate\s*no\b/i.test(descBlob)
      && !SERVICE_PATTERNS.some(p => p.pattern.test(descBlob))
      && ((descBlob.match(/\b[A-Z][a-z]{2,}\b/g) || []).length >= 2)
      && descBlob.length < 200; // guard against long merchant boilerplate
    if (looksP2P && arr.length < 2) continue;
    // drop obvious credits/refunds
    if (/(refund|reversal|chargeback|interest|paid in|credit|deposit)/.test(descBlob)) continue;

    const { name, merchant, conf } = matchService(sampleDesc);
    const category = categorize(name);

    const dates = arr.map(a => new Date(a.date)).filter(d => !Number.isNaN(d.getTime())).sort((a,b)=>+a-+b);
    if (!dates.length) continue;

    const amountsAbs = arr.map(a => Math.abs(a.amount)).sort((x,y)=>x-y);
    const base = amountsAbs[Math.floor(amountsAbs.length/2)];

    const variance = (conf >= 90 || /\bmandate\s*no\b/i.test(descBlob)) ? 0.12 : 0.06;
    const stable = amountsAbs.every(v => Math.abs(v - base) <= Math.max(1, base * variance));
    const looksRecurring = arr.length >= 2 && stable;

    const knownService = conf >= 90;
    if (knownService && arr.length < 2 && base < 2) continue;

    const strongText  = hasStrongSubHints(descBlob);
    const isHighValue = base >= 500;
    const mentionsAnnualish =
      /\b(membership|annual|yearly|12\s*months|per\s*year|subscription|subscrip|plan|renewal)\b/i.test(descBlob);

    const isMandate = /\bmandate\s*no\b/i.test(descBlob);
    const strongButNotMandate = strongText && !isMandate;

    const RELAXED_SINGLETONS = true;

    const accept =
      looksRecurring ||
      knownService ||
      (RELAXED_SINGLETONS && strongButNotMandate) ||
      (isHighValue && (mentionsAnnualish || knownService));

    if (looksP2P && !knownService && !looksRecurring && base < 500) continue;
    if (!accept) continue;

    // --- compute representative amount early (used for both freq + final amount) ---
    const rawAmtForFreq = looksRecurring
      ? typicalAmount(arr.map(a => a.amount))
      : Math.abs(arr[0].amount);
    const amtCandidate = Number(Math.abs(rawAmtForFreq).toFixed(2));
    if (amtCandidate <= 0) continue;

    // --- frequency inference (uses amtCandidate for annual-ish singleton heuristic) ---
    let freq: ParsedSubscription['frequency'] = 'unknown';
    if (looksRecurring) {
      freq = inferFrequency(dates);
    } else if (mentionsAnnualish) {
      freq = 'annual';
    } else if (
      (arr.length === 1) &&
      (knownService || isKnownServiceLine(sampleDesc)) &&
      YEARLY_OPTION_BRANDS.test(name) &&
      amtCandidate >= SINGLE_ANNUAL_MIN
    ) {
      freq = 'annual';
    } else if ((knownService || isKnownServiceLine(sampleDesc)) && MONTHLY_LIKELY.test(name)) {
      freq = 'monthly';
    }

    // confidence bump for DD/Mandate
    const ddBoost = /\b(direct\s*debit|mandate\s*no)\b/i.test(descBlob) ? 5 : 0;

    // nextBilling guess
    let nextBilling: string | undefined;
    const last  = dates[dates.length - 1];
    const first = dates[0];
    if (freq === 'monthly')  { const nx = new Date(last); nx.setMonth(nx.getMonth()+1);  nextBilling = nx.toISOString().slice(0,10); }
    else if (freq === 'weekly'){ const nx = new Date(last); nx.setDate(nx.getDate()+7);   nextBilling = nx.toISOString().slice(0,10); }
    else if (freq === 'annual'){ const nx = new Date(last); nx.setFullYear(nx.getFullYear()+1); nextBilling = nx.toISOString().slice(0,10); }

    // ✅ use the precomputed amount here
    const amt = amtCandidate;

    subs.push({
      name,
      merchant,
      serviceName: name,
      category,
      cost: amt,
      frequency: freq,
      billingDate: last.getDate(),
      dayOfMonth: last.getDate(),
      confidence: Math.min(100, conf + (freq === 'unknown' ? 0 : 5) + ddBoost),
      source: 'bank_scan',
      lastUsed: last.toISOString().slice(0,10),
      signUpDate: first.toISOString().slice(0,10),
      ...(nextBilling ? { nextBilling } : {}),
    });
  }

  return subs;
}

// --- Greedy helpers for messy PDF text ---------------------------------------

const NOISE = [
  'important information', 'compensation', 'fscs', 'account name', 'sort code',
  'statement number', 'page number', 'date description money in money out balance',
  'authorised by the prudential regulation authority', 'financial conduct authority',
  'registered office', 'gross rate', 'aer', 'ear', 'overdraft', 'terms and conditions'
].map(s=>s.toLowerCase());

const CREDIT_HINTS = [
  'refund','reversal','chargeback','interest',
  'paid in','credit','deposit','cashback',
  'faster payments receipt','faster payments received','transfer from',
  'incoming','salary','wages','hmrc','benefit','rebate','receipt'
].map(s => s.toLowerCase());
// put near NOISE / CREDIT_HINTS

const BALANCE_LINE_RX =
  /(balance\s*(carried|brought)\s*forward|opening\s*balance|closing\s*balance|balance\s*[cb]\/f|\bb\/f\b|\bc\/f\b|balance\s+forward|carried\s+forward)/i;


function looksLikeDate(line:string){
  return /^\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3}\b/.test(line) ||
         /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/.test(line);
}

function parseDate(line:string):string|null{
  let m = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (m) return toISO(+m[1],+m[2],+m[3]);
  m = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
  if (m) return toISO((m[3].length<=2?+m[3]+2000:+m[3]), +m[2], +m[1]);
  m = line.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})(?:\s+(\d{2,4}))?\b/);
  if (m){
    const mi = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
      .indexOf(m[2].slice(0,3).toLowerCase());
    if (mi>=0) return toISO(m[3]? (m[3].length<=2?+m[3]+2000:+m[3]) : new Date().getFullYear(), mi+1, +m[1]);
  }
  return null;
}

function extractAmount(line: string): number {
  const tail = line.slice(-140);

  const toNum = (raw: string) => {
    const neg = /^\(.*\)$/.test(raw);
    const v = Number(raw.replace(/[()£,\s]/g, '').replace(/\u2212/g, '-'));
    return Number.isFinite(v) ? Math.abs(neg ? -v : v) : NaN;
  };

  const rawTokens = Array.from(
    tail.matchAll(/£?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g)
  ).map(m => m[0]);

  let tokens = rawTokens.map((t, i) => ({
    value: toNum(t),
    hasPound: /£/.test(t),
    has2dp: /\.\d{2}\b/.test(t),
    i
  })).filter(t => Number.isFinite(t.value) && t.value > 0 && t.value <= 200000);

  if (!tokens.length) return 0;

  // Prefer “real prices”: must have £ or two decimals
  const pricey = tokens.filter(t => t.hasPound || t.has2dp);
  if (!pricey.length) return 0;      // ← drop integer-only artifacts like “658”
  tokens = pricey;

  // If a bigger candidate exists, drop tiny integers (<£5)
  const hasBigger = tokens.some(t => t.value >= 5);
  if (hasBigger) tokens = tokens.filter(t => t.value >= 5);

  const nums = tokens.map(t => t.value);

  // Heuristic tails: [In, Out, Balance] or [Out, Balance]
  if (tokens.length >= 3) {
  const last3 = tokens.slice(-3).map(t => t.value);
  const [a, b, c] = last3;
  // If last looks like balance (largest), pick the middle = Money Out
  if (c >= Math.max(a, b)) return b;
}

  if (nums.length >= 2) {
    const [prev, last] = nums.slice(-2);
    if (last > prev * 1.5) return prev;
    return Math.min(prev, last);
  }
  return nums[0];
}





function greedyFromPdfText(text:string): RawTransaction[] {
  const raw = text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
    .filter(l=>!/^--- Page \d+ ---$/i.test(l))
    .filter(l=>{
      const lo=l.toLowerCase();
      if (NOISE.some(n=>lo.includes(n))) return false;
      const digits=(lo.match(/\d/g)||[]).length;
      return !(lo.length>180 && digits<6);
    });

  const merged:string[] = [];
  let cur='';

  for (let i=0;i<raw.length;i++){
    const a=raw[i], b=raw[i+1]||'';
    if (looksLikeDate(a)){
      if (cur){ merged.push(cur.trim()); cur=''; }
      cur=a; if (b && !looksLikeDate(b)){ cur+=' '+b; i++; }
      continue;
    }
    if (cur){
      cur+=' '+a;
      if (/\d{1,3}(?:,\d{3})*(?:\.\d{2})$/.test(a)){ merged.push(cur.trim()); cur=''; }
    }
  }
  if (cur) merged.push(cur.trim());

  const txns: RawTransaction[] = [];
  for (const ln of merged){
    
    const lo = ln.toLowerCase();
    const isKnown = isKnownServiceLine(ln);

    if (!isKnown && BALANCE_LINE_RX.test(lo)) continue;
    if (!isKnown && CREDIT_HINTS.some(h => lo.includes(h))) continue;

    const iso = parseDate(ln);
    const amt = extractAmount(ln);
    if (!iso || !amt) continue;


    let desc = ln
      .replace(/\b(20\d{2}|\d{2}[\/\-]\d{2}[\/\-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,}(?:\s+\d{2,4})?)\b/,'')
      .replace(/(\(?[-–−]?\s*£?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?)(?:\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?)?\s*$/,'')
      .trim() || 'Unknown Service';

    txns.push({ date: iso, description: desc, amount: -amt });

    
  }
  
  return txns;
}



// Public API (keeps your signatures)
export class BankStatementParser {
  static parseTransactions(transactions: RawTransaction[]): ParsedSubscription[] {
    return toSubscriptions(transactions);
  }

  static parseStatementText(text: string): ParsedSubscription[] {
    const txns = isCSV(text) ? parseCSV(text) : parsePlain(text);
    let subs = toSubscriptions(txns);

    // Fallback for messy PDFs
    if (subs.length < 3) {
      const greedyTx = greedyFromPdfText(text);
      const merged = toSubscriptions(greedyTx);
      const key = (s: ParsedSubscription) => `${s.name.toLowerCase()}_${Math.round(s.cost*100)}_${s.frequency}`;
      const map = new Map<string, ParsedSubscription>();
      for (const s of [...subs, ...merged]) map.set(key(s), s);
      subs = [...map.values()];
    }
    return subs;
  }
}

export default BankStatementParser;
