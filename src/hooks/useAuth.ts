/**
 * useAuth Hook
 *
 * Handles Firebase authentication state and user management.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut as firebaseSignOut,
  User,
} from 'firebase/auth';
import { getFirebaseAuth, isFirebaseConfigured } from '../services/firebase';

export interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAnonymous: boolean;
  error: string | null;
}

export interface UseAuthReturn extends AuthState {
  signInAnonymous: () => Promise<User | null>;
  signOut: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Listen to auth state changes
  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setIsLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setIsLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Auth state error:', err);
        setError(err.message);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  // Anonymous sign in
  const signInAnonymous = useCallback(async (): Promise<User | null> => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setError('Firebase not configured');
      return null;
    }

    try {
      setIsLoading(true);
      setError(null);
      const result = await signInAnonymously(auth);
      setUser(result.user);
      return result.user;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign in failed';
      setError(message);
      console.error('Anonymous sign in error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    const auth = getFirebaseAuth();
    if (!auth) return;

    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Sign out failed';
      setError(message);
      console.error('Sign out error:', err);
    }
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    isAnonymous: user?.isAnonymous ?? false,
    error,
    signInAnonymous,
    signOut,
  };
}

export default useAuth;
