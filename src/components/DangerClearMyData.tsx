// src/components/DangerClearMyData.tsx
'use client';
import React, { useState } from 'react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '@/lib/firebase';
import {
  collection, query, where, getDocs, writeBatch,
  orderBy, startAfter, limit
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const COLLECTIONS = [
  'subscriptions',
  'plannedItems',
  'categories',
  'envelopes',
  'insights',
  'detectedSubscriptions',
  'userSubscriptions',
  'scanResults',
];

export default function DangerClearMyData() {
  const [user] = useAuthState(auth);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>('');

  const append = (s: string) => setLog(prev => prev + s + '\n');

  const handleNuke = async () => {
    if (!user?.uid) { alert('Not signed in'); return; }
    if (!confirm('This will permanently delete all your data in the listed collections. Continue?')) return;

    setBusy(true); setLog('');
    try {
      for (const col of COLLECTIONS) {
        append(`→ Deleting from ${col}…`);
        let lastDoc: any = null;
        let total = 0;

        while (true) {
          // batch pages of up to 400 docs
          const qref = query(
            collection(db, col),
            where('userId', '==', user.uid),
            orderBy('__name__'),
            ...(lastDoc ? [startAfter(lastDoc)] : []),
            limit(400)
          );
          const snap = await getDocs(qref);
          if (snap.empty) break;

          const batch = writeBatch(db);
          snap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          total += snap.size;
          lastDoc = snap.docs[snap.docs.length - 1];
        }
        append(`   ✓ ${total} docs deleted in ${col}`);
      }
      append('All done ✅');
    } catch (e: any) {
      console.error(e);
      append(`Error: ${e?.message || e}`);
      alert('Some deletes failed. Check console/log.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 border rounded-xl bg-red-50">
      <h3 className="font-semibold text-red-700 mb-2">Danger Zone: Clear My Data</h3>
      <button
        onClick={handleNuke}
        disabled={busy}
        className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
      >
        {busy ? 'Deleting…' : 'Delete all my data'}
      </button>
      <pre className="mt-3 text-xs text-red-800 whitespace-pre-wrap">{log}</pre>
    </div>
  );
}
