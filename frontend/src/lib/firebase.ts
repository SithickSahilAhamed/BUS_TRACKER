// Firebase Client SDK Configuration
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getMessaging, isSupported } from 'firebase/messaging';
import { getAnalytics } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyCT20gNsOZOaROBnHJuiuujXz5tHHxL6Nw',
  authDomain: 'collegebustracker-1c6d9.firebaseapp.com',
  projectId: 'collegebustracker-1c6d9',
  storageBucket: 'collegebustracker-1c6d9.firebasestorage.app',
  messagingSenderId: '805302719283',
  appId: '1:805302719283:web:740e764134aaddd9de6446',
  measurementId: 'G-E5GSNCHTHR',
};

// Prevent double init in hot-module reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);

// FCM — only init in supported browsers (needs HTTPS + service worker)
export const messagingPromise = isSupported().then((yes) =>
  yes ? getMessaging(app) : null
);

// Analytics (optional)
if (typeof window !== 'undefined') {
  getAnalytics(app);
}

// VAPID Key for Web Push
// Get from Firebase Console → Cloud Messaging → Web Push certificates → Generate
// Then replace the value below
export const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';

export default app;
