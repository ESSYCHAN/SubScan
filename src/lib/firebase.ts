import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyCswZjagzQKLf8KxB5wpanX2lyk_yIvvQQ",
  authDomain: "subscan-aedbc.firebaseapp.com",
  projectId: "subscan-aedbc",
  storageBucket: "subscan-aedbc.firebasestorage.app",
  messagingSenderId: "734183453953",
  appId: "1:734183453953:web:e504cc8be28dcd9be95700",
  measurementId: "G-6VRHFXKJVJ"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Enable offline persistence
import { enableNetwork, disableNetwork } from 'firebase/firestore';

// Handle connection issues gracefully
export const enableFirestoreNetwork = () => enableNetwork(db);
export const disableFirestoreNetwork = () => disableNetwork(db);

// Initialize auth state persistence
auth.useDeviceLanguage();
