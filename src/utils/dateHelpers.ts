// utils/dateHelpers.ts
export class DateUtils {
  private static MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'] as const;

  private static monthIndex(name: string): number {
    const i = this.MONTHS.indexOf(name.slice(0,3).toLowerCase() as any);
    return i; // -1 if not found
  }

  /**
   * Parse various date formats commonly found in bank statements.
   * Supports:
   *  - 2025-08-03
   *  - 03/08/2025, 03-08-25
   *  - ON 16-08-2025
   *  - 27th Jul 2025, 27 Jul 2025, 27th Jul (uses fallback/current year)
   */
  static parseStatementDate(input: string, fallbackYear?: number): string | null {
    const yr = (y: number | string | undefined) =>
      y == null ? (fallbackYear ?? new Date().getFullYear())
               : (String(y).length <= 2 ? Number(y) + 2000 : Number(y));

    // ISO: YYYY-MM-DD
    {
      const m = input.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (m) return this.formatISODate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }

    // DD/MM/YYYY or DD-MM-YY(YY)
    {
      const m = input.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/);
      if (m) {
        const [_, d, mo, y] = m;
        return this.formatISODate(new Date(yr(y), Number(mo) - 1, Number(d)));
      }
    }

    // "ON DD-MM-YYYY"
    {
      const m = input.match(/(?:^|\b)ON\s+(\d{1,2})-(\d{1,2})-(\d{2,4})\b/i);
      if (m) {
        const [_, d, mo, y] = m;
        return this.formatISODate(new Date(yr(y), Number(mo) - 1, Number(d)));
      }
    }

    // Ordinal or plain: "27th Jul 2025" | "27 Jul 2025" | "27th Jul" | "27 Jul"
    {
      const m = input.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,})(?:\s+(\d{2,4}))?\b/);
      if (m) {
        const [_, d, mon, y] = m;
        const mi = this.monthIndex(mon);
        if (mi >= 0) {
          return this.formatISODate(new Date(yr(y), mi, Number(d)));
        }
      }
    }
    {
      // 27-Jul-2025 or 27 Jul 2025 or 27 JUL 25
      const m = input.match(/\b(\d{1,2})[ \-]([A-Za-z]{3,})[ \-]?(\d{2,4})?\b/);
      if (m) {
        const [, d, mon, y] = m;
        const mi = (DateUtils as any).MONTHS?.indexOf?.(mon.slice(0,3).toLowerCase()) ?? 
                  ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(mon.slice(0,3).toLowerCase());
        if (mi >= 0) {
          const year = y ? (String(y).length <= 2 ? Number(y) + 2000 : Number(y)) : (fallbackYear ?? new Date().getFullYear());
          return this.formatISODate(new Date(year, mi, Number(d)));
        }
      }
    }
    {
      // 2025/08/27
      const m = input.match(/\b(\d{4})\/(\d{2})\/(\d{2})\b/);
      if (m) return this.formatISODate(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    }
    return null;
  }

  /**
   * Extract the monetary amount from a line.
   * Picks the **last** number (most statements list balance after amount).
   * Supports £, comma thousands, decimals, and Unicode minus; returns absolute value.
   * Skips lines that mention "balance"/"bal".
   */
  static extractAmount(text: string): number {
  // Ignore obvious balance lines
  if (/\b(balance|bal\.?)\b/i.test(text)) return 0;

  const moneyTokens = Array.from(
    text.matchAll(/(\(?[-–−]?\s*£?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?)(?:\s*(DR|CR))?/gi)
  );

  if (!moneyTokens.length) return 0;

  const toNum = (raw: string) => {
    const negParen = /^\(.*\)$/.test(raw);
    const cleaned = raw.replace(/[()£,\s]/g, '').replace(/\u2212/g, '-');
    const v = Number(cleaned);
    return Number.isFinite(v) ? Math.abs(negParen ? -v : v) : NaN;
  };

  const numbers = moneyTokens
    .map(m => toNum((m[1] || '').trim()))
    .filter(v => Number.isFinite(v) && v > 0 && v <= 20000) as number[];

  if (!numbers.length) return 0;

  // Santander puts "amount balance" at the end. Choose the smaller of the last two.
  if (numbers.length >= 2) {
    const lastTwo = numbers.slice(-2).sort((a, b) => a - b);
    return lastTwo[0];
  }

  return numbers[numbers.length - 1];
}

  /**
   * Days between two ISO dates.
   */
  static daysBetween(dateA: string, dateB: string): number {
    const a = new Date(dateA);
    const b = new Date(dateB);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) {
      throw new Error('Invalid date format');
    }
    return Math.abs(Math.floor((b.getTime() - a.getTime()) / 86400000));
  }

  /**
   * Calculate next billing date for subscription (weekly / monthly / annual).
   * Handles month-end safely (e.g., from Jan 31 → Feb last day).
   */
  static calculateNextBilling(
    lastSeen: string,
    frequency: 'monthly' | 'weekly' | 'annual' = 'monthly'
  ): string {
    const date = new Date(lastSeen);
    if (isNaN(date.getTime())) {
      return new Date().toISOString().slice(0, 10);
    }

    switch (frequency) {
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'annual':
        date.setFullYear(date.getFullYear() + 1);
        break;
      case 'monthly':
      default: {
        const originalDay = date.getDate();
        date.setMonth(date.getMonth() + 1);
        // If month rolled over (e.g., 31st → 3rd), snap to end of previous month
        if (date.getDate() !== originalDay) date.setDate(0);
        break;
      }
    }

    return this.formatISODate(date);
  }

  /**
   * Check if two amounts are similar (within 6% or £1).
   */
  static amountsSimilar(a: number, b: number): boolean {
    if (!isFinite(a) || !isFinite(b)) return false;
    const diff = Math.abs(a - b);
    if (diff <= 1) return true;
    const percentDiff = diff / Math.max(a, b);
    return percentDiff <= 0.06;
  }

  private static formatISODate(date: Date): string {
    if (isNaN(date.getTime())) throw new Error('Invalid date');
    return date.toISOString().slice(0, 10);
  }

  /**
   * Validate and sanitize date input.
   */
  static validateDate(dateStr: string): boolean {
    const date = new Date(dateStr);
    return !isNaN(date.getTime()) &&
           date.getFullYear() >= 2020 &&
           date.getFullYear() <= 2030;
  }
}
// --- tiny date helpers you can import by name ---

/** Days in month: month is 0–11 (JS Date-style) */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Monday=0 index of first weekday in a month */
export function firstWeekdayOfMonthMonday(year: number, month: number): number {
  const js = new Date(year, month, 1).getDay(); // Sun=0..Sat=6
  return (js + 6) % 7; // Mon=0..Sun=6
}

/** Nice label like "July 2025" */
export function monthName(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}
