// hooks/useMonthlyBudget.ts
import { useMemo } from 'react';

import { mapCanonicalCategory, CanonicalCategory } from '@/utils/categoryMap';
import { DateUtils, daysInMonth, firstWeekdayOfMonthMonday, monthName } from '@/utils/dateHelpers';

export type BudgetLine = {
  id: string;
  source: 'subscription'|'planned'|'manual';
  name: string;
  category: CanonicalCategory;
  day: number;
  monthlyAmount: number;   // normalised
  raw?: any;
};

type Options = { items: any[]; planned: any[]; manual?: any[]; month: Date };

function normaliseMonthly(amount: number, freq?: string) {
  if (!amount || amount<=0) return 0;
  const f = (freq||'monthly').toLowerCase();
  if (f==='annual') return amount/12;
  if (f==='weekly') return amount*4.33;
  return amount;
}

export function useMonthlyBudget({ items, planned, manual=[], month }: Options) {
  const year = month.getFullYear();
  const mon  = month.getMonth();
  const dim  = daysInMonth(year, mon);

  return useMemo(() => {
    // 1) subscriptions -> lines
    const subLines: BudgetLine[] = (items||[]).map(s => {
      const name = s.name || s.merchant || 'Unknown';
      const cat = mapCanonicalCategory(name, s.category);
      const amt = normaliseMonthly(Number(s.cost ?? s.amount ?? s.monthlyFee) || 0, s.frequency);
      let day = Number(s.dayOfMonth ?? s.billingDate) || (s.nextBilling ? new Date(s.nextBilling).getDate() : 1);
      day = Math.min(Math.max(day,1), dim);
      // hide if paused this month
      const paused = !!s.pausedUntil && new Date(s.pausedUntil).getMonth()===mon && new Date(s.pausedUntil).getFullYear()===year;
      return paused ? null : ({
        id: s.id ?? s.docId ?? Math.random().toString(36).slice(2),
        source: 'subscription',
        name,
        category: cat,
        day,
        monthlyAmount: Math.round(amt*100)/100,
        raw: s
      });
    }).filter(Boolean) as BudgetLine[];

    // 2) planned -> lines
    const plannedLines: BudgetLine[] = (planned||[]).map(p => {
      const name = p.name || 'Planned';
      const cat = mapCanonicalCategory(name, p.category);
      const f   = p.frequency || 'once';
      let occurs = false;
      let day = 1;

      if (f==='once' && p.date) {
        const d = new Date(p.date);
        occurs = d.getFullYear()===year && d.getMonth()===mon;
        day = d.getDate();
      } else if (f==='monthly') {
        occurs = true;
        day = Math.min(Math.max(p.dayOfMonth||1,1), dim);
      } else if (f==='annual') {
        const ref = p.start || p.date;
        occurs = !!ref && new Date(ref).getMonth()===mon;
        day = Math.min(Math.max(p.dayOfMonth||1,1), dim);
      }

      if (!occurs) return null;
      const amt = f==='annual' ? (Number(p.amount)||0)/12 : Number(p.amount)||0;

      return {
        id: p.id ?? Math.random().toString(36).slice(2),
        source: 'planned',
        name,
        category: cat,
        day,
        monthlyAmount: Math.round(amt*100)/100,
        raw: p
      };
    }).filter(Boolean) as BudgetLine[];

    // 3) manual -> lines (already monthly)
    const manualLines: BudgetLine[] = (manual||[]).map(m => ({
      id: m.id,
      source: 'manual',
      name: m.name,
      category: mapCanonicalCategory(m.name, m.category),
      day: Math.min(Math.max(m.day||1,1), dim),
      monthlyAmount: Math.round((Number(m.amount)||0)*100)/100,
      raw: m
    }));

    const lines = [...subLines, ...plannedLines, ...manualLines];

    const totals = lines.reduce((acc, l) => {
      acc.month += l.monthlyAmount;
      acc.byCat[l.category] = (acc.byCat[l.category]||0) + l.monthlyAmount;
      acc.byDay[l.day] = (acc.byDay[l.day]||0) + l.monthlyAmount;
      return acc;
    }, { month: 0, byCat: {} as Record<CanonicalCategory, number>, byDay: {} as Record<number, number> });

    return { lines, totals };
  }, [items, planned, manual, mon, year, dim]);
}
