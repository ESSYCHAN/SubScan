'use client';
import React, { useState } from 'react';
import { Upload, Download, FileText, AlertCircle, Save, Check } from 'lucide-react';
import { ValidationUtils } from '@/utils/validation';
import { DateUtils } from '@/utils/dateHelpers';
import { BankStatementParser, ParsedSubscription } from '@/utils/bankStatementParser';

import { db, auth } from '@/lib/firebase';
import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';

type TransactionLine = {
  lineNumber: number;
  text: string;
  hasAmount: boolean;
  hasDate: boolean;
  potentialTransaction: boolean;
  length: number;
};

type TxRow = {
  date: string;
  description: string;
  amount: number;      // negative for spend, positive for credit
  money_out: number;
  money_in: number;
  balance?: number;
  currency: 'GBP';
  source_line: string; // raw merged line for audit
};

export default function PDFTextExtractor() {
  const [user] = useAuthState(auth);

  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState<string>('');
  const [transactionLines, setTransactionLines] = useState<TransactionLine[]>([]);
  const [detectedSubs, setDetectedSubs] = useState<ParsedSubscription[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [saveDone, setSaveDone] = useState<boolean>(false);

  // ─────────────────────────────────────────────────────────────
  // Santander row normaliser (you already had this)
  // ─────────────────────────────────────────────────────────────
  function startsWithStatementDate(line: string): boolean {
    // e.g., "27th Jul", "31st Jul", "1st Aug", etc.
    return /^\s*\d{1,2}(st|nd|rd|th)?\s+[A-Za-z]{3}\b/.test(line);
  }

  function normalizeSantanderRows(fullText: string): string[] {
    const raw = fullText.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

    const lines: string[] = [];
    let current = '';

    for (let i = 0; i < raw.length; i++) {
      const a = raw[i];
      const b = raw[i + 1] || '';
      const c = raw[i + 2] || '';

      if (startsWithStatementDate(a)) {
        if (current) { lines.push(current.trim()); current = ''; }

        current = a;
        if (b && !startsWithStatementDate(b)) current += ' ' + b;

        // If third line looks like "amount balance" append it, else if b ends with amount append b
        if (/\d{1,3}(?:,\d{3})*(?:\.\d{2})\s+\d{1,3}(?:,\d{3})*(?:\.\d{2})$/.test(c)) {
          current += ' ' + c;
          i += 2;
        } else if (/\d{1,3}(?:,\d{3})*(?:\.\d{2})$/.test(b)) {
          current += ' ' + b;
          i += 1;
        }
        continue;
      }

      if (current) {
        current += ' ' + a;
        if (/\d{1,3}(?:,\d{3})*(?:\.\d{2})$/.test(a)) {
          lines.push(current.trim());
          current = '';
        }
      }
    }

    if (current) lines.push(current.trim());
    return lines;
  }

  // ─────────────────────────────────────────────────────────────
  // NEW: Transactions CSV helpers (amount/balance/date heuristics)
  // ─────────────────────────────────────────────────────────────
  function detectHeaderYear(text: string): number | undefined {
    const years = (text.match(/\b(20\d{2})\b/g) || []).map(Number);
    if (!years.length) return undefined;
    return years.sort((a, b) => b - a)[0]; // most recent we see
  }

  function parseDateSmart(line: string, fallbackYear?: number): string | null {
    // 2025-08-03
    let m = line.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    // 03/08/2025 or 03-08-25
    m = line.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
    if (m) {
      const y = m[3].length <= 2 ? (2000 + Number(m[3])) : Number(m[3]);
      const mm = String(m[2]).padStart(2, '0');
      const dd = String(m[1]).padStart(2, '0');
      return `${y}-${mm}-${dd}`;
    }

    // "27th Jul" or "27 Jul 2025"
    m = line.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})(?:\s+(\d{2,4}))?\b/);
    if (m) {
      const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const mi = months.indexOf(m[2].slice(0,3).toLowerCase());
      if (mi >= 0) {
        const y = m[3] ? (m[3].length <= 2 ? (2000 + Number(m[3])) : Number(m[3])) :
                          (fallbackYear ?? new Date().getFullYear());
        const mm = String(mi + 1).padStart(2, '0');
        const dd = String(m[1]).padStart(2, '0');
        return `${y}-${mm}-${dd}`;
      }
    }
    return null;
  }

  function extractAllNumbers(line: string): number[] {
    // capture numeric tokens like 1,234.56 or 18.99 (with/without £, parentheses)
    const matches = Array.from(line.matchAll(/(\(?[-–−]?\s*£?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?)/g));
    const nums: number[] = [];
    for (const m of matches) {
      const raw = m[1];
      const negByParen = /^\(.*\)$/.test(raw);
      const v = Number(raw.replace(/[()£,\s]/g, '').replace(/\u2212/g, '-'));
      if (Number.isFinite(v)) nums.push(negByParen ? -Math.abs(v) : Math.abs(v));
    }
    return nums;
  }

  function looksLikeCredit(lineLower: string): boolean {
    return /(refund|reversal|chargeback|interest|paid in|credit|deposit|\bcr\b)/.test(lineLower);
  }

  function buildTransactionsFromLines(lines: string[], fullText: string): TxRow[] {
    const fallbackYear = detectHeaderYear(fullText);
    const out: TxRow[] = [];

    for (const raw of lines) {
      const line = raw.trim();
      const date = parseDateSmart(line, fallbackYear);
      if (!date) continue;

      const nums = extractAllNumbers(line);
      if (!nums.length) continue;

      // Santander: first numeric ≈ txn amount, last numeric ≈ balance (often)
      const amountToken = nums[0];
      const balanceToken = nums.length > 1 ? nums[nums.length - 1] : undefined;

      const isCredit = looksLikeCredit(line.toLowerCase());
      const signedAmount = isCredit ? Math.abs(amountToken) : -Math.abs(amountToken);

      // description: strip one date token and trailing numbers block
      const description =
        line
          .replace(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,}(?:\s+\d{2,4})?)\b/, '')
          .replace(/(\(?[-–−]?\s*£?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?)(?:\s+\(?[-–−]?\s*£?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?)*\s*$/, '')
          .replace(/\s+/g, ' ')
          .trim() || 'Unknown';

      const amt = Number(signedAmount.toFixed(2));
      const bal = balanceToken !== undefined && balanceToken !== amountToken
        ? Number(balanceToken.toFixed(2))
        : undefined;

      out.push({
        date,
        description,
        amount: amt,
        money_out: amt < 0 ? Math.abs(amt) : 0,
        money_in:  amt > 0 ? amt : 0,
        balance: bal,
        currency: 'GBP',
        source_line: raw
      });
    }
    return out;
  }

  function exportTransactionsCSV(lines: string[], fullText: string) {
    const txs = buildTransactionsFromLines(lines, fullText);
    if (!txs.length) return;

    const headers = ['date','description','amount','money_out','money_in','balance','currency','source_line'];
    const csv = [
      headers.join(','),
      ...txs.map(t => [
        t.date,
        `"${t.description.replace(/"/g, '""')}"`,
        t.amount.toFixed(2),
        t.money_out ? t.money_out.toFixed(2) : '',
        t.money_in ? t.money_in.toFixed(2) : '',
        t.balance != null ? t.balance.toFixed(2) : '',
        t.currency,
        `"${t.source_line.replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'transactions.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────
  // Upload + extract (pdf.js via CDN) — unchanged in spirit
  // ─────────────────────────────────────────────────────────────
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validation = ValidationUtils.validateFileUpload(selectedFile);
    if (!validation.valid) { setError(validation.error || 'Invalid file'); return; }

    setFile(selectedFile);
    setError('');
    await extractTextFromPDF(selectedFile);
  };

  async function extractTextFromPDF(file: File) {
    setIsProcessing(true);
    setDetectedSubs([]);
    setTransactionLines([]);
    setSaveDone(false);
    try {
      if (!ValidationUtils.checkRateLimit('pdf-extract', 6, 60_000)) {
        setError('Too many attempts. Please wait a moment and try again.');
        return;
      }

      const arrayBuffer = await file.arrayBuffer();

      // Only add the script once
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

      const pdf = await (window as any).pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';

      for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((it: any) => ((it.str || '') + (it.hasEOL ? '\n' : ' ')))
          .join('')
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n');
        fullText += `\n--- Page ${pageNum} ---\n${pageText}\n`;
      }

      setExtractedText(fullText);

      // Use your Santander normaliser for stronger line-level parsing
      const normalizedLines = normalizeSantanderRows(fullText);
      const normalizedText = normalizedLines.join('\n');

      // Line analysis UI
      const analysed: TransactionLine[] = normalizedLines.map((line, i) =>
        analyzeTextLine(line, i + 1)
      );
      setTransactionLines(analysed);

      // Detected subscriptions using the same backend logic
      const subs = BankStatementParser.parseStatementText(normalizedText);
      setDetectedSubs(subs);

    } catch (err: any) {
      console.error('PDF extraction error:', err);
      setError(`Failed to extract text: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsProcessing(false);
    }
  }

  function analyzeTextLine(text: string, lineNumber: number): TransactionLine {
    const line = text.trim();
    const hasDate = DateUtils.parseStatementDate(line) !== null;
    const hasAmount = DateUtils.extractAmount(line) > 0;
    const potentialTransaction = hasAmount && line.length > 10 && line.length < 200;
    return { lineNumber, text: line, hasAmount, hasDate, potentialTransaction, length: line.length };
  }

  // ─────────────────────────────────────────────────────────────
  // Save to Firestore — same deterministic upsert as uploads
  // ─────────────────────────────────────────────────────────────
  const cleanForFirestore = (obj: Record<string, any>) => {
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      if (typeof v === 'number' && Number.isNaN(v)) continue;
      out[k] = v;
    }
    return out;
  };
  
  const saveDetectedToFirestore = async () => {
    if (!user?.uid) { setError('Please sign in first to save detected subscriptions.'); return; }
    if (!detectedSubs.length) { setError('No subscriptions detected to save.'); return; }

    if (!ValidationUtils.checkRateLimit(`pdf:save:${user.uid}`, 3, 20_000)) {
      setError('Please wait a few seconds before saving again.'); return;
    }

    setIsSaving(true);
    setError('');
    setSaveDone(false);

    try {
      const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 64);

      const batched: Promise<any>[] = [];
      for (const s of detectedSubs) {
        const id = `scan_${user.uid}_${slug(s.name)}_${Math.round(s.cost * 100)}_${s.frequency}`;
        const ref = doc(collection(db, 'subscriptions'), id);

        const docData = cleanForFirestore({
          userId: user.uid,
          ...s,
          amount: s.cost,
          monthlyFee: s.cost,
          dayOfMonth: s.billingDate,
          updatedAt: Timestamp.now(),
          createdAt: Timestamp.now(),
        });

        batched.push(setDoc(ref, docData, { merge: true }));
      }
      await Promise.all(batched);
      setSaveDone(true);
    } catch (e) {
      console.error(e);
      setError('Failed to save detected subscriptions.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Exports (existing) + NEW transactions CSV export
  // ─────────────────────────────────────────────────────────────
  const exportAnalysisCSV = () => {
    if (!transactionLines.length) return;
    const headers = ['Line Number', 'Text', 'Has Amount', 'Has Date', 'Potential Transaction', 'Length'];
    const csvData = [
      headers.join(','),
      ...transactionLines.map(line => [
        line.lineNumber,
        `"${line.text.replace(/"/g, '""')}"`,
        line.hasAmount,
        line.hasDate,
        line.potentialTransaction,
        line.length
      ].join(','))
    ].join('\n');
    downloadBlob(csvData, `pdf_analysis_${file?.name.replace(/\.pdf$/i, '') || 'document'}.csv`, 'text/csv');
  };

  const exportFullText = () => {
    if (!extractedText) return;
    downloadBlob(extractedText, `extracted_text_${file?.name.replace(/\.pdf$/i, '') || 'document'}.txt`, 'text/plain');
  };

  const exportDetectedCSV = () => {
    if (!detectedSubs.length) return;
    const headers = ['name','merchant','category','cost','frequency','billingDate','confidence','lastUsed','signUpDate','nextBilling'];
    const csv = [
      headers.join(','),
      ...detectedSubs.map(s => [
        `"${s.name}"`,
        `"${s.merchant}"`,
        `"${s.category}"`,
        s.cost.toFixed(2),
        s.frequency,
        s.billingDate,
        s.confidence,
        s.lastUsed || '',
        s.signUpDate || '',
        s.nextBilling || ''
      ].join(','))
    ].join('\n');
    downloadBlob(csv, `detected_subscriptions_${file?.name.replace(/\.pdf$/i, '') || 'document'}.csv`, 'text/csv');
  };

  function downloadBlob(content: string, filename: string, type: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  // ─────────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">PDF Text Extractor</h1>
        <p className="text-gray-600">Extract, detect subscriptions, and save to your SubScan</p>
      </div>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={(e) => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files[0]; if (f?.name.endsWith('.pdf')) { setFile(f); setError(''); extractTextFromPDF(f); } else setError('Please drop a PDF file'); }}
        onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
      >
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <div className="space-y-2">
          <p className="text-lg font-medium text-gray-900">
            Drop your PDF file here, or click to browse
          </p>
          <p className="text-sm text-gray-500">We extract text, detect recurring subs, and let you save them.</p>
        </div>
        <input
          type="file"
          accept=".pdf"
          onChange={handleFileSelect}
          className="mt-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Error</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Processing */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center space-x-3">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
          <p className="text-blue-800">Processing PDF…</p>
        </div>
      )}

      {/* Results */}
      {(transactionLines.length > 0 || detectedSubs.length > 0) && (
        <div className="space-y-4">
          {/* Stats */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <h3 className="font-medium text-green-800 mb-2">Extraction Complete</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-green-600 font-medium">Total Lines:</span><div className="text-green-800">{transactionLines.length}</div></div>
              <div><span className="text-green-600 font-medium">With Amounts:</span><div className="text-green-800">{transactionLines.filter(l => l.hasAmount).length}</div></div>
              <div><span className="text-green-600 font-medium">With Dates:</span><div className="text-green-800">{transactionLines.filter(l => l.hasDate).length}</div></div>
              <div><span className="text-green-600 font-medium">Potential Txns:</span><div className="text-green-800">{transactionLines.filter(l => l.potentialTransaction).length}</div></div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-3">
            <button onClick={exportAnalysisCSV} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
              <Download className="h-4 w-4" /><span>Download CSV Analysis</span>
            </button>
            <button onClick={exportFullText} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700">
              <FileText className="h-4 w-4" /><span>Download Full Text</span>
            </button>

            {/* NEW: Transactions CSV export */}
            {transactionLines.length > 0 && (
              <button
                onClick={() => exportTransactionsCSV(transactionLines.map(l => l.text), extractedText)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
              >
                <Download className="h-4 w-4" />
                <span>Export Transactions CSV</span>
              </button>
            )}

            {detectedSubs.length > 0 && (
              <>
                <button onClick={exportDetectedCSV} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
                  <Download className="h-4 w-4" /><span>Export Detected Subs</span>
                </button>
                <button
                  onClick={saveDetectedToFirestore}
                  disabled={isSaving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${isSaving ? 'bg-gray-400' : 'bg-purple-600 hover:bg-purple-700'}`}
                >
                  {isSaving ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                  <span>{isSaving ? 'Saving…' : saveDone ? 'Saved!' : 'Save to Subscriptions'}</span>
                </button>
              </>
            )}
          </div>

          {/* Preview – Detected subscriptions */}
          {detectedSubs.length > 0 && (
            <div className="bg-white border rounded-lg p-4">
              <h3 className="font-medium text-gray-900 mb-3">Detected Subscriptions</h3>
              <div className="grid gap-2 max-h-64 overflow-y-auto">
                {detectedSubs.slice(0, 20).map((s, i) => (
                  <div key={i} className="text-sm border rounded-xl p-3 flex justify-between items-center">
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">
                        {s.name} <span className="text-xs text-gray-500">({s.category})</span>
                      </p>
                      <p className="text-xs text-gray-600 truncate">{s.merchant}</p>
                      <p className="text-xs text-gray-600">£{s.cost.toFixed(2)} • {s.frequency} • day {s.billingDate} • conf {s.confidence}</p>
                    </div>
                    <div className="text-right text-xs text-gray-500">
                      <div>last: {s.lastUsed || '-'}</div>
                      {s.nextBilling && <div>next: {s.nextBilling}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview – Potential transaction lines */}
          <div className="bg-white border rounded-lg p-4">
            <h3 className="font-medium text-gray-900 mb-3">Preview — Potential Transactions</h3>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {transactionLines.filter(l => l.potentialTransaction).slice(0, 20).map((line, idx) => (
                <div key={idx} className="text-sm border-b pb-2">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Line {line.lineNumber}:</span>
                    <div className="space-x-2">
                      {line.hasAmount && <span className="text-green-600 text-xs">💰</span>}
                      {line.hasDate && <span className="text-blue-600 text-xs">📅</span>}
                    </div>
                  </div>
                  <p className="text-gray-800 font-mono text-[11px] break-all">{line.text.slice(0, 220)}…</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
