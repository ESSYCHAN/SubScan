// components/BudgetSheet.tsx
import React, { useMemo, useState } from 'react';
import { useMonthlyBudget } from '@/hooks/useMonthlyBudget';
import { Pencil, Lock, Plus, Save, Trash2 } from 'lucide-react';

export default function BudgetSheet({ month, subs, planned, manual, onAddManual, onEditManual, onDeleteManual }:{
  month: Date;
  subs: any[];
  planned: any[];
  manual: any[];
  onAddManual: (row:{name:string; amount:number; day:number; category?:string})=>void;
  onEditManual: (id:string, patch:Partial<{name:string; amount:number; day:number; category:string}>)=>void;
  onDeleteManual: (id:string)=>void;
}) {
  const { lines, totals } = useMonthlyBudget({ items: subs, planned, manual, month });
  const [draft, setDraft] = useState({ name:'', amount:'', day:'1', category:'' });

  const rows = useMemo(() => {
    return [...lines].sort((a,b)=>{
      if (a.source!==b.source) return a.source==='subscription' ? -1 : 1; // subs first
      if (a.category!==b.category) return a.category.localeCompare(b.category);
      return b.monthlyAmount - a.monthlyAmount;
    });
  }, [lines]);

  return (
    <div className="rounded-2xl border bg-white overflow-hidden">
      <div className="p-3 border-b bg-gray-50 font-semibold">Budget (Excel-style)</div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr className="text-left">
              <th className="px-3 py-2 w-7"></th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Monthly</th>
              <th className="px-3 py-2 text-center">Day</th>
              <th className="px-3 py-2 w-24"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r=>(
              <tr key={`${r.source}-${r.id}`} className="border-t">
                <td className="px-3 py-2">{r.source==='subscription' ? <Lock className="w-4 h-4 text-gray-400" /> : <Pencil className="w-4 h-4 text-gray-300" />}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 capitalize">{r.category}</td>
                <td className="px-3 py-2 text-right">£{r.monthlyAmount.toFixed(2)}</td>
                <td className="px-3 py-2 text-center">{r.day}</td>
                <td className="px-3 py-2 text-right">
                  {r.source==='manual' && (
                    <button onClick={()=>onDeleteManual(r.id)} className="px-2 py-1 rounded hover:bg-gray-50">
                      <Trash2 className="w-4 h-4 text-rose-500" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {/* New manual row */}
            <tr className="border-t bg-gray-50/50">
              <td className="px-3 py-2"><Plus className="w-4 h-4 text-gray-400" /></td>
              <td className="px-3 py-2">
                <input className="w-full border rounded px-2 py-1" placeholder="Name"
                  value={draft.name} onChange={e=>setDraft(d=>({ ...d, name:e.target.value }))}/>
              </td>
              <td className="px-3 py-2">
                <input className="w-full border rounded px-2 py-1" placeholder="Category (optional)"
                  value={draft.category} onChange={e=>setDraft(d=>({ ...d, category:e.target.value }))}/>
              </td>
              <td className="px-3 py-2 text-right">
                <input className="w-28 border rounded px-2 py-1 text-right" placeholder="0.00"
                  value={draft.amount} onChange={e=>setDraft(d=>({ ...d, amount:e.target.value }))}/>
              </td>
              <td className="px-3 py-2 text-center">
                <input className="w-16 border rounded px-2 py-1 text-center"
                  value={draft.day} onChange={e=>setDraft(d=>({ ...d, day:e.target.value }))}/>
              </td>
              <td className="px-3 py-2 text-right">
                <button
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded bg-gray-900 text-white text-xs"
                  onClick={()=>{
                    const amt = Number(draft.amount);
                    const day = Math.max(1, Math.min(31, Number(draft.day||'1')));
                    if (!draft.name || !amt) return;
                    onAddManual({ name: draft.name, amount: amt, day, category: draft.category || undefined });
                    setDraft({ name:'', amount:'', day:'1', category:'' });
                  }}
                >
                  <Save className="w-3.5 h-3.5" /> Add
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 font-semibold">Total</td>
              <td />
              <td className="px-3 py-2 text-right font-semibold">£{totals.month.toFixed(2)}</td>
              <td />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
