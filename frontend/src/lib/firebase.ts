// Firebase Client SDK — project: bustracking-fe9fe
// Values come from frontend/.env (Firebase console → Project settings → Your apps → Web app)
import { initializeApp, getApps } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  // Surface a clear message instead of a cryptic Firebase error
  console.error(
    'Firebase config missing. Copy frontend/.env.example to frontend/.env and fill the VITE_FIREBASE_* values from the Firebase console.'
  );
}

// Prevent double init in hot-module reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);

// Opt-in only (`VITE_USE_EMULATOR=true npm run dev`) — never runs in a
// production build. Points the client at a local Firebase Emulator Suite
// (`firebase emulators:start`) instead of the live project, for testing
// against firestore.rules without touching real data.
if (import.meta.env.DEV && import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  console.warn('Using local Firebase emulators (Auth :9099, Firestore :8080), not the live project.');
}

export default app;
