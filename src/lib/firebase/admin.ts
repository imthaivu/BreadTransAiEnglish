import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getDatabase as getAdminRtdbSdk } from "firebase-admin/database";
import {
  getFirestore as getAdminDb,
  type Firestore,
} from "firebase-admin/firestore";
import { getStorage as getAdminStorage } from "firebase-admin/storage";

let adminApp: App | null = null;
let adminFirestore: Firestore | null = null;

function getServiceAccount() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin environment variables");
  }
  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\\n/g, "\n"),
  };
}

export function getAdminApp(): App {
  if (!adminApp) {
    if (getApps().length === 0) {
      const { projectId, clientEmail, privateKey } = getServiceAccount();
      adminApp = initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        databaseURL:
          process.env.FIREBASE_DATABASE_URL ??
          process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
      });
    } else {
      adminApp = getApps()[0]!;
    }
  }
  return adminApp;
}

export const adminAuth = () => getAdminAuth(getAdminApp());
export const adminDb = (): Firestore => {
  if (!adminFirestore) {
    adminFirestore = getAdminDb(getAdminApp());
    adminFirestore.settings({ ignoreUndefinedProperties: true });
  }
  return adminFirestore;
};
export const adminStorage = () => getAdminStorage(getAdminApp());

export function getAdminRtdb() {
  const databaseURL =
    process.env.FIREBASE_DATABASE_URL ??
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;
  if (!databaseURL) {
    throw new Error(
      "Missing FIREBASE_DATABASE_URL or NEXT_PUBLIC_FIREBASE_DATABASE_URL"
    );
  }
  return getAdminRtdbSdk(getAdminApp());
}
