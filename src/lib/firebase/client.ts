"use client";

import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";
import { getDatabase, type Database } from "firebase/database";

let firebaseApp: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;
let rtdbInstance: Database | null = null;

function getFirebaseConfig() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  };

  // databaseURL is optional (only required for Realtime Database / multiplayer
  // games). It is intentionally excluded from the "all values set" guard below
  // so the rest of the app keeps working when it is not configured.
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL;

  // Throw a more helpful error if config is not set
  if (Object.values(config).some((value) => !value)) {
    console.error("Firebase config is not set in .env.local");
    // Return empty config to avoid Firebase error, but app will not connect
    return {};
  }

  return databaseURL ? { ...config, databaseURL } : config;
}

export function getFirebaseApp(): FirebaseApp {
  if (!firebaseApp) {
    if (getApps().length === 0) {
      firebaseApp = initializeApp(getFirebaseConfig());
    } else {
      firebaseApp = getApps()[0]!;
    }
  }
  return firebaseApp;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    authInstance = getAuth(getFirebaseApp());
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) {
    dbInstance = getFirestore(getFirebaseApp());
  }
  return dbInstance;
}

export function getStorageBucket(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(getFirebaseApp());
  }
  return storageInstance;
}

/**
 * Realtime Database instance (used for multiplayer games).
 * Requires NEXT_PUBLIC_FIREBASE_DATABASE_URL to be set.
 */
export function getRtdb(): Database {
  if (!rtdbInstance) {
    rtdbInstance = getDatabase(getFirebaseApp());
  }
  return rtdbInstance;
}

export const db = getDb();
export const auth = getFirebaseAuth();
export const storage = getStorageBucket();
