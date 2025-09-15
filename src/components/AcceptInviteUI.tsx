'use client';

import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import { signInAnonymously } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

type Invite = {
  id: string;
  hid: string;                 // householdId
  roleSuggested: 'viewer'|'editor'|'owner';
  status: 'active'|'claimed'|'revoked';
  token: string;               // required by your rules
  createdBy?: string;
  createdAt?: any;
  // If invite is already claimed, these may exist:
  claimedBy?: string;
  roleAccepted?: 'viewer'|'editor'|'owner';
};

export default function AcceptInviteUI({ invite }: { invite: Invite }) {
  const [user, loading] = useAuthState(auth);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<'idle'|'ok'|'error'|'already'>('idle');
  const [msg, setMsg] = useState<string>('');

  useEffect(() => {
    if (!loading && !user) {
      signInAnonymously(auth).catch(() => {});
    }
  }, [loading, user]);

  const disabled = loading || busy || !invite || invite.status !== 'active';

  const accept = async () => {
    if (!user?.uid) return;
    setBusy(true);
    setMsg('');
    try {
      // 1) Claim the invite (must include token, claimedBy, roleAccepted, status:'claimed')
      const inviteRef = doc(db, 'households', invite.hid, 'invites', invite.id);
      await setDoc(inviteRef, {
        status: 'claimed',
        claimedBy: user.uid,
        roleAccepted: invite.roleSuggested,
        token: invite.token, // unchanged per rules
      }, { merge: true });

      // 2) Create member doc (uid == request.auth.uid)
      const memberRef = doc(db, 'households', invite.hid, 'members', user.uid);
      await setDoc(memberRef, {
        uid: user.uid,
        role: invite.roleSuggested,       // 'viewer' | 'editor'
        householdId: invite.hid,
        inviteId: invite.id,
        createdAt: new Date().toISOString(),
      }, { merge: true });

      setResult('ok');
      setMsg('Joined! You can close this page and go to your dashboard.');
    } catch (e: any) {
      console.error(e);
      // If already claimed by this user and member exists, show friendly message
      if (String(e?.message || '').includes('PERMISSION_DENIED')) {
        setResult('already');
        setMsg('This invite may be already claimed or revoked. If you think this is an error, ask the owner to send a new invite.');
      } else {
        setResult('error');
        setMsg('Something went wrong accepting the invite.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-2xl border shadow-sm">
      <h1 className="text-xl font-bold mb-2">Join household</h1>
      <div className="text-sm text-gray-600 mb-4">
        <div><b>Household:</b> {invite.hid}</div>
        <div><b>Role:</b> {invite.roleSuggested}</div>
        <div><b>Status:</b> {invite.status}</div>
      </div>

      {invite.status === 'revoked' && (
        <div className="text-rose-600 text-sm mb-4">This invite was revoked.</div>
      )}
      {invite.status === 'claimed' && (
        <div className="text-amber-600 text-sm mb-4">This invite is already claimed.</div>
      )}

      <button
        onClick={accept}
        disabled={disabled}
        className={`w-full px-4 py-2.5 rounded-xl text-white text-sm font-semibold
          ${disabled ? 'bg-gray-300 cursor-not-allowed' : 'bg-gray-900 hover:bg-black'}`}
      >
        {busy ? 'Joining…' : 'Accept & Join'}
      </button>

      {!!msg && (
        <p className={`mt-3 text-sm ${result === 'ok' ? 'text-emerald-700' : result === 'already' ? 'text-amber-700' : 'text-rose-700'}`}>
          {msg}
        </p>
      )}

      {!user && (
        <p className="mt-3 text-xs text-gray-500">
          You’ll be signed in anonymously to accept this invite.
        </p>
      )}
    </div>
  );
}
