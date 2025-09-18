// lib/initHousehold.ts
import { db } from '@/lib/firebase';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';

/**
 * Ensures a solo household exists for this user and that the user is a member.
 * Returns the householdId ("solo:{uid}").
 */
export async function ensureSoloHousehold(uid: string): Promise<string> {
  const hid = `solo:${uid}`;
  
  console.log('Starting ensureSoloHousehold with:', { uid, hid });
  
  try {
    // Test basic connectivity first
    console.log('Testing basic Firestore access...');
    
    // 1) Check if household already exists
    console.log('Checking household doc...');
    const hhRef = doc(db, 'households', hid);
    const hhSnap = await getDoc(hhRef);
    
    if (!hhSnap.exists()) {
      console.log('Creating household doc...');
      await setDoc(hhRef, {
        ownerUid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log('Household doc created successfully');
    } else {
      console.log('Household doc already exists');
    }
    
    // 2) Check if member doc exists
    console.log('Checking member doc...');
    const memRef = doc(db, 'households', hid, 'members', uid);
    const memSnap = await getDoc(memRef);
    
    if (!memSnap.exists()) {
      console.log('Creating member doc...');
      await setDoc(memRef, {
        uid,
        role: 'owner',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      console.log('Member doc created successfully');
    } else {
      console.log('Member doc already exists');
    }
    
    console.log('ensureSoloHousehold completed successfully');
    return hid;
  } catch (error) {
    console.error('Solo household creation error:', error);
    
    // Type-safe error handling
    if (error instanceof Error) {
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        uid,
        hid
      });
    } else {
      console.error('Unknown error type:', error);
    }
    
    throw error;
  }
}