// utils/extractTextSmart.ts
// Layout-aware pdf.js extraction + OCR fallback using Tesseract.js (only if needed)

export async function extractTextSmart(file: File): Promise<string> {
  const text = await extractWithPdfJs(file);
  if (!isWeak(text)) return text;

  // Weak text layer → OCR fallback on first 4 pages (tune if needed)
  const ocr = await extractWithOcr(file, 4);
  // Pick whichever contains more money-looking tokens
  return countAmounts(ocr) > countAmounts(text) ? ocr : text;
}

function countAmounts(s: string): number {
  const re = /£\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})|\b\d+\.\d{2}\b|USD|GBP/gi;
  const m = s.match(re);
  return m ? m.length : 0;
}
function isWeak(s: string) { return countAmounts(s) < 5; }

// ---- pdf.js (layout-aware)
async function ensurePdfJs() {
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => res();
      s.onerror = () => rej(new Error('Failed to load pdf.js'));
      document.head.appendChild(s);
    });
    (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
}
async function extractWithPdfJs(file: File): Promise<string> {
  await ensurePdfJs();
  const buf = await file.arrayBuffer();
  const pdf = await (window as any).pdfjsLib.getDocument({ data: buf }).promise;

  let out = '';
  const yTol = 2; // group items to same line by ~2px
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = new Map<number, Array<{ x: number; s: string }>>();

    for (const it of content.items as any[]) {
      const s = (it.str || '').trim();
      if (!s) continue;
      const tr = it.transform || it?.transformMatrix || [1,0,0,1,0,0];
      const x = tr[4] || 0;
      const yRaw = tr[5] || 0;
      // Snap y so nearby items land on the same row
      const y = Math.round(yRaw / yTol) * yTol;
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y)!.push({ x, s });
    }

    // sort rows by y (top→bottom), items by x (left→right)
    const ys = Array.from(rows.keys()).sort((a, b) => b - a); // pdf y grows upward
    const pageLines = ys.map(y =>
      rows.get(y)!.sort((a, b) => a.x - b.x).map(i => i.s).join(' ')
    );

    out += `\n--- Page ${p} ---\n` + pageLines.join('\n') + '\n';
  }
  return out;
}

// ---- OCR fallback (Tesseract)
async function ensureTesseract() {
  if (!(window as any).Tesseract) {
    await new Promise<void>((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@2/dist/tesseract.min.js';
      s.onload = () => res();
      s.onerror = () => rej(new Error('Failed to load Tesseract.js'));
      document.head.appendChild(s);
    });
  }
}
async function extractWithOcr(file: File, maxPages = 4): Promise<string> {
  await ensurePdfJs();
  await ensureTesseract();

  const buf = await file.arrayBuffer();
  const pdf = await (window as any).pdfjsLib.getDocument({ data: buf }).promise;
  const pages = Math.min(pdf.numPages, maxPages);

  let out = '';
  for (let p = 1; p <= pages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 2 }); // hi-res for OCR
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const result = await (window as any).Tesseract.recognize(canvas, 'eng');
    out += `\n--- Page ${p} (OCR) ---\n${result?.data?.text || ''}\n`;
  }
  return out;
}
