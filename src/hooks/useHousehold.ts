"use client";
import { useEffect, useMemo, useState } from "react";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, onSnapshot, collection, query } from "firebase/firestore";
import { useAuthState } from "react-firebase-hooks/auth";

export function useHouseholdId() {
  const [user] = useAuthState(auth);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  useEffect(() => {
    if (!user) return;
    const ref = doc(db, "users", user.uid);
    getDoc(ref).then(snap => setHouseholdId(snap.exists() ? (snap.data().householdId ?? null) : null));
  }, [user]);
  return householdId;
}

export type Member = { uid: string; role: "owner"|"editor"|"viewer"; displayName: string; emoji?: string; color?: string };

export function useHouseholdMembers(householdId?: string | null) {
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    if (!householdId) return;
    const qy = query(collection(db, "households", householdId, "members"));
    const unsub = onSnapshot(qy, (snap) => {
      const arr: Member[] = [];
      snap.forEach(d => arr.push({ uid: d.id, ...(d.data() as any) }));
      setMembers(arr);
    });
    return () => unsub();
  }, [householdId]);
  return members;
}
