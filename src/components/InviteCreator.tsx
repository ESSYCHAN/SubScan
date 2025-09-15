"use client";
import React, { useState } from "react";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Copy, Plus } from "lucide-react";

function randToken(len = 32) {
  const abc = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = ""; for (let i=0;i<len;i++) out += abc[Math.floor(Math.random()*abc.length)];
  return out;
}

export default function InviteCreator({ householdId, currentUid }:{
  householdId: string;
  currentUid: string;
}) {
  const [role, setRole] = useState<"viewer"|"editor">("viewer");
  const [url, setUrl] = useState<string>("");

  const createInvite = async () => {
    const token = randToken();
    const docRef = await addDoc(collection(db, `households/${householdId}/invites`), {
      householdId,
      roleSuggested: role,
      status: "active",
      token,
      createdBy: currentUid,
      createdAt: serverTimestamp(),
    });
    const link = `${window.location.origin}/i/${docRef.id}?token=${encodeURIComponent(token)}`;
    setUrl(link);
  };

  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="text-sm font-medium">Invite someone</div>
      <div className="flex gap-2 items-center">
        <select
          value={role}
          onChange={(e)=>setRole(e.target.value as any)}
          className="px-3 py-2 rounded-lg border text-sm"
        >
          <option value="viewer">Viewer (read-only)</option>
          <option value="editor">Editor (can edit)</option>
        </select>
        <button
          onClick={createInvite}
          className="px-3 py-2 rounded-lg bg-gray-900 text-white text-sm inline-flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Create invite
        </button>
      </div>

      {url && (
        <div className="flex gap-2 items-center">
          <input className="flex-1 px-3 py-2 rounded-lg border text-sm" value={url} readOnly />
          <button
            onClick={()=>navigator.clipboard.writeText(url)}
            className="px-3 py-2 rounded-lg border text-sm inline-flex items-center gap-2"
          >
            <Copy className="w-4 h-4" /> Copy
          </button>
        </div>
      )}
    </div>
  );
}
