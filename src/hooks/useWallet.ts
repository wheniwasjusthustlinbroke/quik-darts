/**
 * useWallet Hook
 *
 * Listens to user's wallet in Firebase RTDB.
 * Server is single source of truth for all balance changes.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ref, onValue, Unsubscribe } from 'firebase/database';
import { onAuthStateChanged } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseDatabase, getFirebaseFunctions, getFirebaseAuth } from '../services/firebase';

export interface WalletState {
  coinBalance: number;
  dailyBonusAvailable: boolean;
  adsRemainingToday: number;
  isLoading: boolean;
  isClaimingBonus: boolean;
  claimDailyBonus: () => Promise<void>;
}

// Track which users have had initialization attempted (session-scoped, keyed by uid)
const initializedUsers = new Set<string>();

export function useWallet(): WalletState {
  const [coinBalance, setCoinBalance] = useState(0);
  const [dailyBonusAvailable, setDailyBonusAvailable] = useState(false);
  const [adsRemainingToday, setAdsRemainingToday] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaimingBonus, setIsClaimingBonus] = useState(false);

  // Ref-based lock to prevent double submit on rapid taps
  const claimingRef = useRef(false);

  // Store unsubscribe function for current wallet listener
  const walletUnsubscribeRef = useRef<Unsubscribe | null>(null);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const database = getFirebaseDatabase();
    const functions = getFirebaseFunctions();

    if (!auth || !database) {
      setIsLoading(false);
      return;
    }

    // Cleanup previous wallet listener (safe - only affects this hook's listener)
    const cleanupWalletListener = () => {
      if (walletUnsubscribeRef.current) {
        walletUnsubscribeRef.current();
        walletUnsubscribeRef.current = null;
      }
    };

    // Handle auth state change - resubscribe wallet listener per user
    const handleAuthStateChange = (user: any) => {
      // Always cleanup previous wallet listener first
      cleanupWalletListener();

      // Reset state on auth change
      setCoinBalance(0);
      setDailyBonusAvailable(false);
      setAdsRemainingToday(0);

      // Anonymous users or no user get no wallet
      if (!user || user.isAnonymous) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      const uid = user.uid;
      const walletRef = ref(database, `users/${uid}/wallet`);

      const handleWalletUpdate = async (snapshot: any) => {
        const wallet = snapshot.val();

        if (!wallet) {
          // No wallet found - initialize once per user per session
          if (!initializedUsers.has(uid) && functions) {
            initializedUsers.add(uid);
            try {
              const initFn = httpsCallable(functions, 'initializeNewUser');
              await initFn();
              console.log('[useWallet] Wallet initialized for user:', uid);
            } catch (error: any) {
              console.error('[useWallet] Failed to initialize wallet:', error.message);
              // Keep in Set - only attempt once per session per user
            }
          }
          setIsLoading(false);
          return;
        }

        // Update balance from server (server is single source of truth)
        setCoinBalance(wallet.coins || 0);

        // === Daily bonus availability (UI display hint only) ===
        // Server remains authoritative when claimDailyBonus is called
        // Uses server-pinned timezone for date comparison (matches server logic)
        const lastBonus = wallet.lastDailyBonus || 0;
        const now = Date.now();
        const storedTimezone = wallet.dailyBonusTimezone || '';
        // Use stored timezone if set (server-pinned), otherwise user's local timezone
        const effectiveTimezone = storedTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

        const getDateInTimezone = (timestamp: number, tz: string) => {
          if (!timestamp) return '';
          try {
            return new Date(timestamp).toLocaleDateString('en-CA', { timeZone: tz });
          } catch {
            // Invalid timezone - fall back to local
            return new Date(timestamp).toLocaleDateString('en-CA');
          }
        };
        const lastClaimDate = getDateInTimezone(lastBonus, effectiveTimezone);
        const todayDate = getDateInTimezone(now, effectiveTimezone);
        const bonusAvailable = !lastBonus || lastClaimDate !== todayDate;
        setDailyBonusAvailable(bonusAvailable);

        // === Ad rewards remaining (UI display hint only) ===
        // Server remains authoritative when claimAdReward is called
        const lastAdReward = wallet.lastAdReward || 0;
        const twentyFourHours = 24 * 60 * 60 * 1000;
        const lastAdDay = Math.floor(lastAdReward / twentyFourHours);
        const currentDay = Math.floor(now / twentyFourHours);
        const adsUsedToday = currentDay > lastAdDay ? 0 : (wallet.adRewardsToday || 0);
        setAdsRemainingToday(Math.max(0, 5 - adsUsedToday));

        setIsLoading(false);
      };

      // Subscribe to wallet updates (returns its own unsubscribe - won't affect other listeners)
      const unsubscribe = onValue(walletRef, handleWalletUpdate, (error) => {
        console.error('[useWallet] Listener error:', error);
        setIsLoading(false);
      });

      walletUnsubscribeRef.current = unsubscribe;
    };

    // Subscribe to auth state changes (compatible with native wrapper and web SDK)
    const authUnsubscribe = typeof auth.onAuthStateChanged === 'function'
      ? auth.onAuthStateChanged(handleAuthStateChange)
      : onAuthStateChanged(auth, handleAuthStateChange);

    return () => {
      authUnsubscribe();
      cleanupWalletListener();
    };
  }, []);

  // Claim daily bonus - server validates, balance updates via listener
  const claimDailyBonus = useCallback(async () => {
    // Ref-based guard for rapid taps
    if (claimingRef.current) return;
    claimingRef.current = true;

    const auth = getFirebaseAuth();
    const functions = getFirebaseFunctions();

    if (!auth || !functions) {
      claimingRef.current = false;
      return;
    }

    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
      claimingRef.current = false;
      return;
    }

    setIsClaimingBonus(true);
    try {
      const claimFn = httpsCallable(functions, 'claimDailyBonus');
      const result = await claimFn({
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });

      const data = result.data as any;
      if (data.success) {
        // Balance updates via RTDB listener - only update UI hint state
        setDailyBonusAvailable(false);
        const coins = typeof data.coinsAwarded === 'number' ? data.coinsAwarded : 0;
        // TODO: Replace alert with toast/notification component
        alert(`+${coins} coins claimed!`);
      } else {
        const errorMsg = data.error || 'Failed to claim bonus';
        if (data.nextClaimTime) {
          const nextTime = new Date(data.nextClaimTime);
          alert(`${errorMsg}. Next claim available: ${nextTime.toLocaleString()}`);
        } else {
          alert(errorMsg);
        }
      }
    } catch (error: any) {
      console.error('[useWallet] claimDailyBonus error:', error.message);
      alert('Failed to claim daily bonus. Please try again.');
    } finally {
      setIsClaimingBonus(false);
      claimingRef.current = false;
    }
  }, []);

  return {
    coinBalance,
    dailyBonusAvailable,
    adsRemainingToday,
    isLoading,
    isClaimingBonus,
    claimDailyBonus,
  };
}

export default useWallet;
