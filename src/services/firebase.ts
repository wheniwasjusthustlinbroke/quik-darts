/**
 * Firebase Service
 *
 * Firebase initialization and configuration.
 * Credentials should be stored securely in environment variables.
 */

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import {
  getDatabase,
  Database,
  connectDatabaseEmulator,
} from 'firebase/database';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';

// Firebase configuration from environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Check if Firebase is configured
export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId
  );
};

// Initialize Firebase app
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let database: Database | null = null;
let functions: Functions | null = null;

export const initializeFirebase = (): {
  app: FirebaseApp;
  auth: Auth;
  database: Database;
  functions: Functions;
} | null => {
  if (!isFirebaseConfigured()) {
    console.warn(
      'Firebase not configured. Add environment variables to enable online features.'
    );
    return null;
  }

  if (!app) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    database = getDatabase(app);
    functions = getFunctions(app);

    // Connect to emulators in development
    if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR) {
      connectAuthEmulator(auth, 'http://localhost:9099');
      connectDatabaseEmulator(database, 'localhost', 9000);
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
  }

  return { app, auth, database, functions };
};

// Get Firebase services (lazy initialization)
export const getFirebaseApp = (): FirebaseApp | null => {
  if (!app) initializeFirebase();
  return app;
};

export const getFirebaseAuth = (): Auth | null => {
  if (!auth) initializeFirebase();
  return auth;
};

export const getFirebaseDatabase = (): Database | null => {
  if (!database) initializeFirebase();
  return database;
};

export const getFirebaseFunctions = (): Functions | null => {
  if (!functions) initializeFirebase();
  return functions;
};

// Re-export Firebase types for convenience
export type { FirebaseApp } from 'firebase/app';
export type { Auth, User } from 'firebase/auth';
export type { Database, DatabaseReference } from 'firebase/database';
export type { Functions, HttpsCallable } from 'firebase/functions';
