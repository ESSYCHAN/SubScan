// lib/initHousehold.ts
// initHousehold.ts
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

/**
 * Ensures a solo household exists for this user and that the user is a member.
 * Returns the householdId ("solo:{uid}").
 */
export async function ensureSoloHousehold(uid: string): Promise<string> {
  const hid = `solo:${uid}`;

  // 1) Upsert the household with you as the owner
  const hhRef = doc(db, 'households', hid);
  await setDoc(
    hhRef,
    {
      ownerUid: uid,               // <-- rules check this via isOwnerOfHousehold(hid)
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // (optional) sanity: ensure it's there before member write
  const hhSnap = await getDoc(hhRef);
  if (!hhSnap.exists()) {
    throw new Error('Household doc missing after create');
  }

  // 2) Upsert your member doc using YOUR UID as the doc id, role 'owner'
  const memRef = doc(db, 'households', hid, 'members', uid);
  await setDoc(
    memRef,
    {
      uid,                         // <-- rules require request.resource.data.uid == uid
      householdId: hid,            // <-- optional in rules, but include it to satisfy older versions
      role: 'owner',               // <-- required for solo/owner bootstrap
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  return hid;
}
