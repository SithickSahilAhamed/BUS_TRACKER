/**
 * Firebase Admin SDK Configuration
 *
 * To enable:
 *   1. Go to https://console.firebase.google.com
 *   2. Project Settings → Service Accounts → Generate new private key
 *   3. Save the downloaded JSON as: backend/serviceAccountKey.json
 */
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

let adminInitialized = false;

const serviceAccountPath = path.resolve(
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './serviceAccountKey.json'
);

if (fs.existsSync(serviceAccountPath)) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const serviceAccount = require(serviceAccountPath);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID,
    });
    adminInitialized = true;
    console.log('✅ Firebase Admin SDK initialized');
  } catch (err) {
    console.error('❌ Firebase Admin init failed:', err);
  }
} else {
  console.warn(
    '⚠️  serviceAccountKey.json not found. Firebase token verification is DISABLED.\n' +
      '   Download it from Firebase Console → Project Settings → Service Accounts'
  );
}

export { admin, adminInitialized };
