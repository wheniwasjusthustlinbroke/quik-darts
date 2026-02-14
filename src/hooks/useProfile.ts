/**
 * useProfile Hook
 *
 * Listens to user's profile, progression, and streaks in Firebase RTDB.
 * Provides saveNickname for updating display name.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue, update, Unsubscribe } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { getFirebaseDatabase, getFirebaseAuth } from '../services/firebase';
import { validateNickname } from '../utils/nicknameValidation';

/** User profile data */
export interface UserProfile {
  displayName: string;
  flag: string;
  uniqueId: string;
  avatar?: string;
  provider?: string;
  createdAt?: number;
}

/** User progression data */
export interface UserProgression {
  level: number;
  xp: number;
  gamesPlayed: number;
  gamesWon: number;
}

/** User streak data */
export interface UserStreaks {
  currentWinStreak: number;
  bestWinStreak: number;
}

/** Result of saveNickname operation */
export type SaveNicknameResult = { success: true } | { success: false; error: string };

export interface ProfileState {
  userProfile: UserProfile | null;
  userProgression: UserProgression | null;
  userStreaks: UserStreaks | null;
  isLoading: boolean;
  isSavingNickname: boolean;
  saveNickname: (nickname: string) => Promise<SaveNicknameResult>;
}

/** Calculate XP required for a given level */
export function getXPForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(50 * level * Math.pow(1.08, level - 1));
}

/** Get rank title based on level */
export function getRankTitle(level: number): string {
  if (level >= 80) return 'Legend';
  if (level >= 60) return 'Master';
  if (level >= 40) return 'Expert';
  if (level >= 25) return 'Veteran';
  if (level >= 15) return 'Skilled';
  if (level >= 8) return 'Amateur';
  if (level >= 3) return 'Novice';
  return 'Rookie';
}

export function useProfile(): ProfileState {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [userProgression, setUserProgression] = useState<UserProgression | null>(null);
  const [userStreaks, setUserStreaks] = useState<UserStreaks | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingNickname, setIsSavingNickname] = useState(false);

  // Store unsubscribe functions for current listeners
  const unsubscribeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const database = getFirebaseDatabase();

    if (!auth || !database) {
      setIsLoading(false);
      return;
    }

    // Cleanup previous listeners
    const cleanupListeners = () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };

    // Handle auth state change - resubscribe listeners per user
    const handleAuthStateChange = (user: any) => {
      // Always cleanup previous listeners first
      cleanupListeners();

      // Reset state on auth change
      setUserProfile(null);
      setUserProgression(null);
      setUserStreaks(null);

      // Anonymous users or no user get no profile data
      if (!user || user.isAnonymous) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const uid = user.uid;

      // Listen to each path separately (database rules only allow reading specific children)
      const profileRef = ref(database, `users/${uid}/profile`);
      const progressionRef = ref(database, `users/${uid}/progression`);
      const streaksRef = ref(database, `users/${uid}/streaks`);

      const unsubscribes: Unsubscribe[] = [];

      // Profile listener
      const profileUnsub = onValue(
        profileRef,
        (snapshot) => {
          setUserProfile(snapshot.val() || null);
          setIsLoading(false);
        },
        (error) => {
          console.error('[useProfile] Profile listener error:', error);
          setIsLoading(false);
        }
      );
      unsubscribes.push(profileUnsub);

      // Progression listener
      const progressionUnsub = onValue(
        progressionRef,
        (snapshot) => {
          setUserProgression(snapshot.val() || null);
        },
        (error) => {
          console.error('[useProfile] Progression listener error:', error);
        }
      );
      unsubscribes.push(progressionUnsub);

      // Streaks listener
      const streaksUnsub = onValue(
        streaksRef,
        (snapshot) => {
          setUserStreaks(snapshot.val() || null);
        },
        (error) => {
          console.error('[useProfile] Streaks listener error:', error);
        }
      );
      unsubscribes.push(streaksUnsub);

      // Store combined cleanup
      unsubscribeRef.current = () => {
        unsubscribes.forEach((unsub) => unsub());
      };
    };

    // Subscribe to auth state changes
    const authUnsubscribe =
      typeof auth.onAuthStateChanged === 'function'
        ? auth.onAuthStateChanged(handleAuthStateChange)
        : onAuthStateChanged(auth, handleAuthStateChange);

    return () => {
      authUnsubscribe();
      cleanupListeners();
    };
  }, []);

  // Save nickname to Firebase with profanity validation
  const saveNickname = useCallback(async (nickname: string): Promise<SaveNicknameResult> => {
    const auth = getFirebaseAuth();
    const database = getFirebaseDatabase();

    if (!auth || !database) {
      return { success: false, error: 'Not connected' };
    }

    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
      return { success: false, error: 'Must be signed in to change nickname' };
    }

    // Validate nickname (length + profanity check)
    const validation = validateNickname(nickname);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    setIsSavingNickname(true);
    try {
      const profileRef = ref(database, `users/${user.uid}/profile`);
      await update(profileRef, { displayName: nickname.trim() });
      return { success: true };
    } catch (error: any) {
      console.error('[useProfile] saveNickname error:', error.message);
      return { success: false, error: 'Failed to save nickname' };
    } finally {
      setIsSavingNickname(false);
    }
  }, []);

  return {
    userProfile,
    userProgression,
    userStreaks,
    isLoading,
    isSavingNickname,
    saveNickname,
  };
}

export default useProfile;
