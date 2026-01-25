/**
 * Firebase Service
 *
 * Firebase initialization and configuration.
 * Credentials should be stored securely in environment variables.
 */

import { initializeApp, FirebaseApp } from 'firebase/app';
import { Capacitor } from '@capacitor/core';
import {
  getAuth,
  Auth,
  connectAuthEmulator,
} from 'firebase/auth';
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
let auth: any = null;
let database: Database | null = null;
let functions: Functions | null = null;

// Promise that resolves when auth is ready
let authReadyResolve: (user: any) => void;
export const authReadyPromise = new Promise<any>(resolve => { authReadyResolve = resolve; });
let authReady = false;

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

    // Check if running on native iOS/Android with Capacitor
    const isNativePlatform = Capacitor.isNativePlatform();
    const hasNativeAuth = isNativePlatform && (Capacitor as any).Plugins?.FirebaseAuthentication;

    if (hasNativeAuth) {
      // Use native Firebase Auth plugin on mobile (bypasses capacitor:// scheme issue)
      console.log('⚡️ Using native Firebase Authentication plugin');
      const FirebaseAuth = (Capacitor as any).Plugins.FirebaseAuthentication;

      // Create auth-like interface for compatibility with existing code
      auth = {
        signInAnonymously: async () => {
          const result = await FirebaseAuth.signInAnonymously();
          auth.currentUser = result.user;
          return result;
        },
        signOut: () => FirebaseAuth.signOut(),
        currentUser: null,
        onAuthStateChanged: (callback: (user: any) => void) => {
          // Get current user immediately
          FirebaseAuth.getCurrentUser().then((result: any) => {
            auth.currentUser = result.user;
            callback(result.user);
          }).catch(() => callback(null));
          // Listen for future changes
          FirebaseAuth.addListener('authStateChange', (change: any) => {
            auth.currentUser = change.user;
            callback(change.user);
          });
          return () => {}; // Return unsubscribe function for compatibility
        }
      };
    } else {
      // Use web Firebase Auth on browser
      auth = getAuth(app);
    }

    database = getDatabase(app);
    // Initialize Firebase Functions with europe-west1 region (matches deployed functions)
    functions = getFunctions(app, 'europe-west1');

    // Connect to emulators in development
    if (import.meta.env.DEV && import.meta.env.VITE_USE_FIREBASE_EMULATOR) {
      connectAuthEmulator(auth, 'http://localhost:9099');
      connectDatabaseEmulator(database, 'localhost', 9000);
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }

    // Listen for auth state changes
    auth.onAuthStateChanged((user: any) => {
      if (user) {
        if (!authReady) {
          authReady = true;
          authReadyResolve(user);
        }
      } else {
        // Sign in anonymously if not authenticated
        auth.signInAnonymously().catch((error: any) => {
          console.warn('Anonymous auth failed:', error);
          if (!authReady) {
            authReady = true;
            authReadyResolve(null);
          }
        });
      }
    });
  }

  return { app, auth: auth!, database: database!, functions: functions! };
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
