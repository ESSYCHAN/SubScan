// components/BoardSkin.tsx
"use client";

import React, { useMemo, useState } from "react";
import { Plus, CheckSquare, Trash2 } from "lucide-react";
import { useEnhancedBudget } from "@/components/HouseholdBudgetProvider";

type Card = { id: string; title: string; tasks: { id: string; text: string; done: boolean }[] };

const uid = () => Math.random().toString(36).slice(2, 10);

export default function BoardSkin() {
  // purely local for now; you can persist later under /households/{hid}/board
  const [cards, setCards] = useState<Card[]>([
    { id: uid(), title: "Save on utilities", tasks: [{ id: uid(), text: "Call energy provider", done: false }] },
    { id: uid(), title: "Spring clean subscriptions", tasks: [{ id: uid(), text: "Review streaming", done: true }] },
  ]);

  const addCard = () => setCards((cs) => [...cs, { id: uid(), title: "New plan", tasks: [] }]);
  const addTask = (cid: string) =>
    setCards((cs) => cs.map((c) => (c.id === cid ? { ...c, tasks: [...c.tasks, { id: uid(), text: "New task", done: false }] } : c)));
  const toggle = (cid: string, tid: string) =>
    setCards((cs) => cs.map((c) =>
      c.id === cid ? { ...c, tasks: c.tasks.map(t => t.id === tid ? { ...t, done: !t.done } : t) } : c
    ));
  const remove = (cid: string) => setCards((cs) => cs.filter((c) => c.id !== cid));

  const doneCount = useMemo(() => cards.reduce((s,c)=>s + c.tasks.filter(t=>t.done).length,0), [cards]);

  return (
    <div className="rounded-2xl bg-white/90 border p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-gray-900">Planning Board</div>
          <div className="text-xs text-gray-500">{doneCount} tasks complete</div>
        </div>
        <button onClick={addCard} className="px-3 py-2 rounded-xl border bg-white hover:bg-gray-50 text-sm inline-flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add card
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map(c => (
          <div key={c.id} className="rounded-2xl border bg-gradient-to-br from-white to-gray-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <input
                className="font-medium text-gray-900 bg-transparent w-full mr-2"
                value={c.title}
                onChange={e => setCards(cs => cs.map(x => x.id===c.id ? { ...x, title: e.target.value } : x))}
              />
              <button onClick={()=>remove(c.id)} className="p-1.5 rounded-lg hover:bg-white/60">
                <Trash2 className="w-4 h-4 text-gray-600" />
              </button>
            </div>

            <div className="space-y-2">
              {c.tasks.map(t => (
                <label key={t.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={t.done} onChange={()=>toggle(c.id, t.id)} />
                  <span className={t.done ? "line-through text-gray-400" : ""}>{t.text}</span>
                </label>
              ))}
            </div>

            <button onClick={()=>addTask(c.id)} className="px-2.5 py-1.5 rounded-lg border bg-white hover:bg-gray-50 text-xs inline-flex items-center gap-1">
              <CheckSquare className="w-3.5 h-3.5" /> Add task
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
