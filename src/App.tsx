/**
 * Quik Darts - Main Application
 *
 * Championship-style online darts game.
 * Ported from V1 single-file to Vite + React + TypeScript.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dartboard, ScoreDisplay, PowerBar, RhythmIndicator } from './components/game';
import type { RhythmState, Position } from './types';
import { usePowerMeter } from './throwing/usePowerMeter';
import {
  isInPerfectZone,
  PERFECT_ZONE_WINNING_DOUBLE,
} from './throwing/legacyMeter';
import {
  createSeededRng,
  generateThrowSeed,
  type RngFunction,
} from './throwing/throwMeter';
import { addThrowRandomness, getWinningSegment, getAimedSegment } from './utils/scoring';
import {
  checkWobbleConditions,
  generateWobbleOffset,
  DEFAULT_WOBBLE_CONFIG,
} from './utils/wobble';
import { useGameState, useSound, useAuth, useTheme } from './hooks';
import type { AchievementCallbacks } from './hooks/useGameState';
import { useAchievements } from './hooks/useAchievements';
import { ACHIEVEMENTS } from './services/achievements';
import { useWallet } from './hooks/useWallet';
import { StakeSelector } from './components/StakeSelector';
import { AchievementToast } from './components/AchievementToast';
import { AchievementGallery } from './components/AchievementGallery';
import { ProfileScreen } from './components/ProfileScreen';
import { CoinShop } from './components/CoinShop';
import { ThemeSelector } from './components/ThemeSelector';
import { DifficultySelector } from './components/DifficultySelector';
import {
  type GameDifficulty,
  getSkillLevelForDifficulty,
  DEFAULT_SKILL_LEVEL,
} from './utils/difficulty';
import {
  getAITarget,
  calculateAIThrow,
  getAIThinkingDelay,
} from './utils/ai';
import { CoinIcon } from './components/icons';
import {
  joinCasualQueue,
  leaveCasualQueue,
  joinWageredQueue,
  leaveWageredQueue,
  subscribeToGameRoom,
  unsubscribeFromGameRoom,
  submitThrow,
  settleGame,
  forfeitGame,
  MatchFoundData,
} from './services/matchmaking';
import './styles/index.css';
import './App.css';
import HomePage from './components/home/HomePage';

function App() {
  // === Achievement Context State ===
  // Track game context for achievement tracking decisions
  const [isOnlineGame, setIsOnlineGame] = useState(false);
  const [isPracticeMode, setIsPracticeMode] = useState(false);
  const [hasAIOpponent, setHasAIOpponent] = useState(false);

  // Track recently unlocked achievements for toast display
  const [recentUnlocks, setRecentUnlocks] = useState<string[]>([]);

  // === Matchmaking State (declared early for useAchievements) ===
  const [isSearching, setIsSearching] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<MatchFoundData | null>(null);
  const [gameSnapshot, setGameSnapshot] = useState<any>(null);
  const [isSubmittingThrow, setIsSubmittingThrow] = useState(false);
  const [showStakeSelection, setShowStakeSelection] = useState(false);
  const [showCoinShop, setShowCoinShop] = useState(false);
  const [showThemeSelector, setShowThemeSelector] = useState(false);
  const [selectedStake, setSelectedStake] = useState(50);
  const [isWageredMatch, setIsWageredMatch] = useState(false);
  const [isCreatingEscrow, setIsCreatingEscrow] = useState(false);
  const [wageredPrize, setWageredPrize] = useState<number | null>(null);
  const [rhythmState, setRhythmState] = useState<RhythmState>('neutral');
  const [aimWobble, setAimWobble] = useState<Position>({ x: 0, y: 0 });
  const [gameDifficulty, setGameDifficulty] = useState<GameDifficulty>('medium');
  const [sessionSkillLevel, setSessionSkillLevel] = useState<number>(DEFAULT_SKILL_LEVEL);
  const [perfectShrinkAmount, setPerfectShrinkAmount] = useState(0);
  const lastThrowPerfectRef = useRef(false);
  const preThrowScoreRef = useRef<number | null>(null);
  // Shrink reset paths: (1) dartsThrown === 0 effect, (2) currentPlayerIndex effect,
  // (3) handleReturnToMenu, (4) setup startGame onClick, (5) Play Again onClick,
  // (6) Practice Mode onClick

  // Ref to prevent duplicate settleGame calls (UI guard)
  const settledGameRef = useRef<string | null>(null);
  // Ref to track wagered match state for callbacks (avoids stale closure)
  const isWageredMatchRef = useRef(false);
  // Ref to prevent double forfeit calls on disconnect
  const disconnectHandledRef = useRef<string | null>(null);

  // === AI Turn State ===
  // Timer ref for AI throw delay (cleanup on turn change)
  const aiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // === Offline Game Determinism State ===
  // Stable gameId for offline sessions (generated once at game start)
  const offlineGameIdRef = useRef<string>('');
  // Total darts thrown in current offline game (for seeded RNG per-throw)
  const offlineTotalDartsRef = useRef<number>(0);

  // === Achievement System ===
  // Initialize achievement system (reads context from refs for reactivity)
  const achievements = useAchievements({
    isOnline: isOnlineGame,
    isPractice: isPracticeMode,
    hasAIOpponent: hasAIOpponent,
    isWagered: isWageredMatch,
    onUnlock: (achievementIds) => {
      // Add to recent unlocks for toast display
      setRecentUnlocks((prev) => [...prev, ...achievementIds]);
    },
  });

  // Create callbacks to wire useGameState → useAchievements
  const achievementCallbacks = useMemo<AchievementCallbacks>(() => ({
    onMatchStart: achievements.startMatch,
    onLegStart: achievements.startLeg,
    onThrow: achievements.emitThrow,
    onTurnComplete: achievements.emitTurnComplete,
    onCheckout: achievements.emitCheckout,
    onLegComplete: achievements.emitLegComplete,
    onGameComplete: achievements.emitGameComplete,
  }), [
    achievements.startMatch,
    achievements.startLeg,
    achievements.emitThrow,
    achievements.emitTurnComplete,
    achievements.emitCheckout,
    achievements.emitLegComplete,
    achievements.emitGameComplete,
  ]);

  // Clear recent unlocks after toasts are dismissed
  const handleAchievementsDismissed = useCallback(() => {
    setRecentUnlocks([]);
  }, []);

  // === Game State ===
  const {
    gameState,
    setGameState,
    players,
    setPlayers,
    currentPlayerIndex,
    setCurrentPlayerIndex,
    dartsThrown,
    setDartsThrown,
    currentTurnScore,
    setCurrentTurnScore,
    dartPositions,
    setDartPositions,
    aimPosition,
    setAimPosition,
    // power, setPower, isPowerCharging, setIsPowerCharging - now handled by usePowerMeter
    gameStats,
    winner,
    setWinner,
    checkout,
    legScores,
    setScores,
    playerSetup,
    setPlayerSetup,
    startGame,
    throwDart,
    endTurn,
    resetGame,
    currentTurnThrows,
    currentPlayer,
  } = useGameState(achievementCallbacks);

  // Sound effects
  const { playSound, soundEnabled, setSoundEnabled } = useSound();

  // Dartboard theme
  const { theme, themeId, selectTheme } = useTheme();

  // Wallet state
  const { coinBalance, dailyBonusAvailable, isLoading: walletLoading, isClaimingBonus, claimDailyBonus } = useWallet();

  // Auth state (for user profile and login)
  const {
    user,
    isLoading: authLoading,
    isAnonymous,
    signInWithGoogle,
    signInWithFacebook,
    signInWithApple,
    signOut,
  } = useAuth();

  // Check if aiming at exact winning double/bull (no proxy)
  const isAimingAtWinningDouble = useMemo(() => {
    if (!currentPlayer) return false;
    const winningSegment = getWinningSegment(currentPlayer.score);
    if (!winningSegment) return false;
    const aimedSegment = getAimedSegment(aimPosition.x + aimWobble.x, aimPosition.y + aimWobble.y);
    return aimedSegment === winningSegment;
  }, [currentPlayer, aimPosition, aimWobble]);

  // Calculate perfect zone width
  const perfectZoneWidth = useMemo(() => {
    // Exact winning double → force 2% zone (bypass shrink)
    if (isAimingAtWinningDouble) {
      return PERFECT_ZONE_WINNING_DOUBLE;
    }
    // Normal shrinking: zoneWidth = max(10 - perfectShrinkAmount, 4)
    return Math.max(10 - perfectShrinkAmount, 4);
  }, [isAimingAtWinningDouble, perfectShrinkAmount]);

  // Cleanup matchmaking on unmount
  useEffect(() => {
    return () => {
      void leaveCasualQueue();
      void leaveWageredQueue();
      unsubscribeFromGameRoom();
    };
  }, []);

  // Initialize offline game state when entering offline/practice mode
  useEffect(() => {
    const isOfflineGame = (gameState === 'playing' || gameState === 'practice') && !matchData;
    if (isOfflineGame && !offlineGameIdRef.current) {
      // Generate stable gameId for this session
      offlineGameIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      offlineTotalDartsRef.current = 0;
    }
    // Reset when returning to menu
    if (gameState === 'landing' || gameState === 'setup') {
      offlineGameIdRef.current = '';
      offlineTotalDartsRef.current = 0;
    }
  }, [gameState, matchData]);

  /**
   * Stable reset function for all online flow cleanup.
   * Safe to use in useCallback deps - all functions are stable module imports
   * and React setters are stable by design.
   */
  const resetOnlineFlow = useCallback(() => {
    unsubscribeFromGameRoom();
    setIsSearching(false);
    setIsCreatingEscrow(false);
    setErrorText(null);
    setMatchData(null);
    setGameSnapshot(null);
    setIsWageredMatch(false);
    setShowStakeSelection(false);
    setWageredPrize(null);
    settledGameRef.current = null;
    isWageredMatchRef.current = false;
    disconnectHandledRef.current = null;
  }, []); // Empty deps: unsubscribeFromGameRoom is stable module export, setters are stable

  // Cleanup online state and return to menu
  const handleReturnToMenu = useCallback(() => {
    // Use shared reset for online matchmaking state
    void leaveCasualQueue();
    void leaveWageredQueue();
    resetOnlineFlow();
    // Reset achievement context
    setIsOnlineGame(false);
    setIsPracticeMode(false);
    setHasAIOpponent(false);
    setRhythmState('neutral');
    setAimWobble({ x: 0, y: 0 });
    setSessionSkillLevel(DEFAULT_SKILL_LEVEL);
    // Reset shrink state for new game
    setPerfectShrinkAmount(0);
    lastThrowPerfectRef.current = false;
    preThrowScoreRef.current = null;
    resetGame();
  }, [resetGame, resetOnlineFlow]);

  // Sync online game state from server
  useEffect(() => {
    if (!gameSnapshot || !matchData) return;

    const { player1, player2, currentPlayer, dartsThrown: serverDarts,
            currentTurnScore: serverTurnScore, dartPositions: serverDartPositions,
            status, winner: serverWinner } = gameSnapshot;

    if (!player1 || !player2) return;

    // Transition to playing when we have valid game data
    if (gameState !== 'playing' && gameState !== 'gameOver') {
      setGameState('playing');
    }

    // Update players with full data from server
    setPlayers([
      {
        id: player1.id ?? 'player1',
        name: player1.name ?? 'Player 1',
        flag: player1.flag ?? '🌍',
        score: typeof player1.score === 'number' ? player1.score : 0,
        isAI: false,
      },
      {
        id: player2.id ?? 'player2',
        name: player2.name ?? 'Player 2',
        flag: player2.flag ?? '🌍',
        score: typeof player2.score === 'number' ? player2.score : 0,
        isAI: false,
      },
    ]);

    setCurrentPlayerIndex(currentPlayer ?? 0);
    setDartsThrown(serverDarts ?? 0);
    setCurrentTurnScore(serverTurnScore ?? 0);

    // Reset rhythm state at start of new turn (when darts reset to 0)
    if (!serverDarts || serverDarts === 0) {
      setRhythmState('neutral');
    }

    // dartPositions: server stores as object with keys "0", "1", "2"
    // Sort by key to preserve throw order
    if (serverDartPositions) {
      const entries = Object.entries(serverDartPositions);
      entries.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
      const positions = entries.map(([key, pos]) => {
        const p = pos as { x: number; y: number };
        return {
          id: `dart_${key}`,
          x: p.x,
          y: p.y,
          score: 0,
          multiplier: 1,
          segment: '',
        };
      });
      setDartPositions(positions);
    } else {
      setDartPositions([]);
    }

    // Handle game finished
    if (status === 'finished' && serverWinner !== undefined) {
      const winnerData = serverWinner === 0 ? player1 : player2;
      setWinner({
        id: `player_${serverWinner}`,
        name: winnerData.name,
        score: 0,
        isAI: false,
        flag: winnerData.flag,
      });

      // Settle wagered match (only once per game via UI guard)
      // TODO: verify Cloud Function settlement is idempotent/transactional
      if (isWageredMatch && matchData && settledGameRef.current !== matchData.roomId) {
        settledGameRef.current = matchData.roomId;
        settleGame({ gameId: matchData.roomId })
          .then((result) => {
            if (result.success && result.winnerPayout) {
              setWageredPrize(result.winnerPayout);
            }
          })
          .catch((err) => {
            // Don't alert - settlement might have been done by opponent (parity with index.html)
            console.error('[settleGame] Error:', err);
          });
      }

      if (gameState !== 'gameOver') {
        setGameState('gameOver');
      }
    }
  }, [gameSnapshot, matchData, gameState, setGameState, setPlayers, setCurrentPlayerIndex, setDartsThrown, setCurrentTurnScore, setDartPositions, setWinner]);

  /**
   * Handle Play Online button - opens stake selector, or cancels if searching.
   * All called functions are stable module imports or React setters.
   */
  const handlePlayOnline = useCallback(async () => {
    if (isSearching || isCreatingEscrow) {
      // Cancel: reset both queues cleanly with error handling
      try {
        await Promise.all([
          leaveCasualQueue().catch(() => {}),
          leaveWageredQueue().catch(() => {}),
        ]);
      } finally {
        resetOnlineFlow();
      }
      return;
    }
    // Open stake selector modal
    setShowStakeSelection(true);
  }, [isSearching, isCreatingEscrow, resetOnlineFlow]);

  /**
   * Start free (casual) matchmaking - called from stake selector "Play Free" button.
   * Dependencies: playerSetup.gameMode and user?.displayName are the only non-stable values.
   * All matchmaking functions are stable module imports.
   */
  const startFreeMatchmaking = useCallback(async () => {
    setShowStakeSelection(false);
    // Belt-and-braces: clear disconnect guard for new session
    disconnectHandledRef.current = null;

    try {
      // Leave wagered queue before starting casual
      await leaveWageredQueue().catch(() => {});

      setIsSearching(true);
      setErrorText(null);
      setIsWageredMatch(false);
      isWageredMatchRef.current = false;
      setIsOnlineGame(true);

      const profile = {
        displayName: user?.displayName ?? 'Player',
        flag: '🌍',
        level: 1,
      };

      joinCasualQueue(
        profile,
        playerSetup.gameMode,
        {
          onFound: (data) => {
            // Capture stable values from callback data
            const gameId = data.roomId;
            const playerIndex = data.playerIndex;

            setIsSearching(false);
            setMatchData(data);

            subscribeToGameRoom(gameId, playerIndex, {
              onGameUpdate: (gameData) => {
                setGameSnapshot(gameData);
              },
              onOpponentDisconnect: (opponentName) => {
                unsubscribeFromGameRoom();
                setMatchData(null);
                setGameSnapshot(null);
                setErrorText(`${opponentName} disconnected`);
              },
              onError: (error) => {
                setErrorText(error);
              },
            });
          },
          onError: (error) => {
            setIsSearching(false);
            setErrorText(error);
          },
          onTimeout: () => {
            setIsSearching(false);
            setErrorText('No opponent found');
          },
        }
      );
    } catch {
      setIsSearching(false);
      setErrorText('Failed to start matchmaking. Please try again.');
    }
  }, [playerSetup.gameMode, user?.displayName]);

  /**
   * Start wagered matchmaking after stake selection.
   * Dependencies: coinBalance, selectedStake, playerSetup.gameMode, user?.displayName are non-stable.
   * All matchmaking functions are stable module imports.
   */
  const startWageredMatchmaking = useCallback(async () => {
    if (coinBalance < selectedStake) {
      setErrorText('Insufficient balance');
      return;
    }

    setShowStakeSelection(false);
    // Belt-and-braces: clear disconnect guard for new session
    disconnectHandledRef.current = null;
    setIsCreatingEscrow(true);
    setErrorText(null);
    setIsWageredMatch(true);
    isWageredMatchRef.current = true;
    setIsOnlineGame(true);

    try {
      // Leave casual queue before starting wagered
      await leaveCasualQueue().catch(() => {});

      const profile = {
        displayName: user?.displayName ?? 'Player',
        flag: '🌍',
        level: 1,
      };

      joinWageredQueue(
        profile,
        selectedStake,
        playerSetup.gameMode as 301 | 501,
        {
          onEscrowCreated: () => {
            setIsCreatingEscrow(false);
            setIsSearching(true);
          },
          onFound: (data) => {
            // Capture stable values from callback data - avoids stale closure
            const gameId = data.roomId;
            const playerIndex = data.playerIndex;

            setIsSearching(false);
            setIsCreatingEscrow(false);
            setMatchData(data);

            subscribeToGameRoom(gameId, playerIndex, {
              onGameUpdate: (gameData) => {
                setGameSnapshot(gameData);
              },
              onOpponentDisconnect: (opponentName) => {
                // Idempotency guard: prevent double forfeit if callback fires twice
                if (disconnectHandledRef.current === gameId) {
                  return;
                }
                disconnectHandledRef.current = gameId;

                unsubscribeFromGameRoom();
                setMatchData(null);
                setGameSnapshot(null);

                // Use ref for wagered check (avoids stale closure)
                if (!isWageredMatchRef.current || !gameId) {
                  setErrorText(`${opponentName} disconnected`);
                  return;
                }

                // Claim forfeit win for wagered match
                forfeitGame({ gameId, reason: 'disconnect', claimWin: true })
                  .then((result) => {
                    if (result.success && result.winnerPayout !== undefined) {
                      setWageredPrize(result.winnerPayout);
                      setErrorText(`${opponentName} disconnected. You won ${result.winnerPayout} coins!`);
                      setGameState('gameOver');
                    } else {
                      setErrorText(`${opponentName} disconnected`);
                    }
                  })
                  .catch((err) => {
                    // Don't alert - forfeit might have been claimed already
                    console.error('[forfeitGame] Error:', err);
                    setErrorText(`${opponentName} disconnected`);
                  });
              },
              onError: (error) => {
                setErrorText(error);
              },
            });
          },
          onError: (error) => {
            setIsSearching(false);
            setIsCreatingEscrow(false);
            setIsWageredMatch(false);
            isWageredMatchRef.current = false;
            setErrorText(error);
          },
          onTimeout: () => {
            setIsSearching(false);
            setIsCreatingEscrow(false);
            setIsWageredMatch(false);
            isWageredMatchRef.current = false;
            setErrorText('No opponent found');
          },
        }
      );
    } catch {
      setIsCreatingEscrow(false);
      setIsWageredMatch(false);
      isWageredMatchRef.current = false;
      setErrorText('Failed to start matchmaking. Please try again.');
    }
  }, [coinBalance, selectedStake, playerSetup.gameMode, user?.displayName]);

  // Close stake selection modal
  const handleCloseStakeSelection = useCallback(() => {
    setShowStakeSelection(false);
  }, []);

  // Play free from stake selection modal
  const handlePlayFreeFromModal = useCallback(async () => {
    await startFreeMatchmaking();
  }, [startFreeMatchmaking]);

  // === Seeded RNG for Offline Throws ===
  // Holds the SINGLE RNG instance for the current throw - shared by meter + scatter
  const currentThrowRngRef = useRef<RngFunction | null>(null);

  // Initialize RNG for a new throw (called once when charging starts)
  const initializeThrowRng = useCallback(() => {
    if (!offlineGameIdRef.current || matchData) {
      // Online or not initialized: use Math.random
      currentThrowRngRef.current = Math.random;
      return;
    }
    // Create seeded RNG for this specific throw
    const seed = generateThrowSeed(
      offlineGameIdRef.current,
      Math.floor(offlineTotalDartsRef.current / 3), // visits = turns completed
      offlineTotalDartsRef.current % 3 // dart within turn
    );
    currentThrowRngRef.current = createSeededRng(seed);
  }, [matchData]);

  // Handle board click (throw dart) - processes the final throw position
  const handleBoardClick = useCallback(
    async (
      x: number,
      y: number,
      aimPoint?: { x: number; y: number },
      powerValue?: number
    ) => {
      const isGameActive = gameState === 'playing' || gameState === 'practice';
      if (!isGameActive || dartsThrown >= 3) return;
      if (isSubmittingThrow) return;

      // Online mode: send to server (no client-side scatter)
      if (matchData) {
        // Wait for valid game state from server
        if (!gameSnapshot) {
          console.warn('[handleBoardClick] No game snapshot yet');
          return;
        }

        // Check if it's our turn
        if (currentPlayerIndex !== matchData.playerIndex) {
          console.log('[handleBoardClick] Not our turn');
          return;
        }

        try {
          setIsSubmittingThrow(true);

          // Build payload - include aimPoint/powerValue only for wagered matches
          const payload: {
            gameId: string;
            dartPosition: { x: number; y: number };
            aimPoint?: { x: number; y: number };
            powerValue?: number;
          } = {
            gameId: matchData.roomId,
            dartPosition: { x, y },
          };

          // Anti-cheat data for wagered matches only
          if (isWageredMatchRef.current && aimPoint !== undefined && powerValue !== undefined) {
            payload.aimPoint = aimPoint;
            payload.powerValue = powerValue;
          }

          const res = await submitThrow(payload);

          if (!res) {
            console.warn('[handleBoardClick] submitThrow failed');
          } else {
            // Apply shrink based on server result (only if release was perfect)
            if (lastThrowPerfectRef.current) {
              const isTreble = !!res?.label && res.label.startsWith('T');
              const isDouble = !!res?.label && res.label.startsWith('D');
              const isBull = res?.label === 'BULL';
              // Single includes outer bull (25) - only exclude MISS and inner BULL
              const isSingle = !!res?.label && !isTreble && !isDouble && res.label !== 'MISS' && res.label !== 'BULL';

              if (isTreble) {
                // Perfect green + treble → shrink by 3%
                setPerfectShrinkAmount(prev => prev + 3);
              } else if (isDouble || isBull) {
                // Perfect green + double/bull → check if winning segment (use pre-throw score)
                const winningSegment = getWinningSegment(preThrowScoreRef.current ?? 0);
                if (winningSegment && res.label === winningSegment) {
                  // Winning double/bull → no shrink added
                } else {
                  // Non-winning double/bull → shrink by 1.5%
                  setPerfectShrinkAmount(prev => prev + 1.5);
                }
              } else if (isSingle) {
                // Perfect green + single (including outer bull 25) → shrink by 1.5%
                setPerfectShrinkAmount(prev => prev + 1.5);
              }
              // MISS → no shrink
            }

            // Update rhythm state from server response
            if (res.rhythm) {
              setRhythmState(res.rhythm as RhythmState);
            }

            // Play sound based on result
            if (res.score === 0) {
              playSound('miss');
            } else if (res.label?.startsWith('T')) {
              playSound('triple');
            } else if (res.label?.startsWith('D')) {
              playSound('double');
            } else if (res.label === 'BULL') {
              playSound('bull');
            } else {
              playSound('hit');
            }
          }
        } finally {
          setIsSubmittingThrow(false);
        }
        return;
      }

      // Offline: throw dart at the given position (scatter already applied by caller)
      const result = throwDart(x, y);

      // Apply shrink based on actual result (only if release was perfect)
      if (lastThrowPerfectRef.current) {
        if (result.multiplier === 3) {
          // Perfect green + treble → shrink by 3%
          setPerfectShrinkAmount(prev => prev + 3);
        } else if (result.multiplier === 2 || result.segment === 'BULL') {
          // Perfect green + double/bull → check if winning segment (use pre-throw score)
          const winningSegment = getWinningSegment(preThrowScoreRef.current ?? 0);
          if (winningSegment && result.segment === winningSegment) {
            // Winning double/bull → no shrink added
          } else {
            // Non-winning double/bull → shrink by 1.5%
            setPerfectShrinkAmount(prev => prev + 1.5);
          }
        } else if (result.multiplier === 1 && result.score > 0) {
          // Perfect green + single (including outer bull 25) → shrink by 1.5%
          setPerfectShrinkAmount(prev => prev + 1.5);
        }
        // Miss (score === 0) or bust → no shrink
      }

      // Increment offline dart counter for next throw's seed
      offlineTotalDartsRef.current += 1;

      // Clear RNG after throw completes (hygiene)
      currentThrowRngRef.current = null;

      // Play appropriate sound
      if (result.isBust) {
        playSound('bust');
      } else if (result.score === 0) {
        playSound('miss');
      } else if (result.multiplier === 3) {
        playSound('triple');
      } else if (result.multiplier === 2) {
        playSound('double');
      } else if (result.segment === 'BULL') {
        playSound('bull');
      } else {
        playSound('hit');
      }

      // Check for 180
      if (currentTurnScore + result.score === 180) {
        playSound('180');
      }

      // Auto end turn after 3 darts (skip if bust - useGameState handles bust endTurn)
      if (dartsThrown + 1 >= 3 && !result.isBust) {
        setTimeout(() => endTurn(), 1000);
      }
    },
    [gameState, dartsThrown, throwDart, playSound, currentTurnScore, endTurn, matchData, isSubmittingThrow, gameSnapshot, currentPlayerIndex]
  );

  // Compute if it's currently AI's turn (used to block human input)
  const isAITurn = useMemo(() => {
    return (
      gameState === 'playing' &&
      !matchData &&
      !winner &&
      !!players[currentPlayerIndex]?.isAI
    );
  }, [gameState, matchData, winner, players, currentPlayerIndex]);

  // Handle throw with power (called when power meter is released)
  const handleThrowWithPower = useCallback(
    (releasedPower: number) => {
      // Safety net: block if AI's turn (should already be blocked by usePowerMeter)
      if (isAITurn) return;

      playSound('throw');

      // Capture aim position WITH wobble at release time (for wagered anti-cheat)
      const capturedAimX = aimPosition.x + aimWobble.x;
      const capturedAimY = aimPosition.y + aimWobble.y;
      const capturedAimPoint = { x: capturedAimX, y: capturedAimY };

      // Check if in perfect zone
      const isPerfect = isInPerfectZone(releasedPower, perfectZoneWidth);

      // Capture pre-throw score and perfect status for shrink calculation
      preThrowScoreRef.current = currentPlayer?.score ?? null;
      lastThrowPerfectRef.current = isPerfect;
      // Note: shrink is applied in handleBoardClick after actual result is known

      if (matchData) {
        // Online: pass aimPoint + powerValue for wagered anti-cheat
        handleBoardClick(
          capturedAimX,
          capturedAimY,
          capturedAimPoint,
          releasedPower
        );
      } else {
        // Offline: apply scatter based on power using seeded RNG
        const rng = currentThrowRngRef.current ?? Math.random;
        const scattered = addThrowRandomness(
          capturedAimX,
          capturedAimY,
          sessionSkillLevel,
          releasedPower,
          isPerfect,
          rng
        );
        handleBoardClick(scattered.x, scattered.y);
      }
    },
    [isAITurn, playSound, matchData, aimPosition, aimWobble, perfectZoneWidth, handleBoardClick, sessionSkillLevel, currentPlayer]
  );

  // === Oscillating Power Meter Hook ===
  const {
    power,
    isCharging: isPowerCharging,
    handlers: powerHandlers,
  } = usePowerMeter({
    onRelease: handleThrowWithPower,
    disabled: dartsThrown >= 3 || !!winner || isAITurn,
  });

  // Wrapper to initialize RNG before starting power charge (works for both board and button)
  const handleBoardPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (isAITurn) return;
      initializeThrowRng();
      powerHandlers.onPointerDown(e);
    },
    [isAITurn, initializeThrowRng, powerHandlers]
  );

  // Handle aim position
  const handleBoardMove = useCallback(
    (x: number, y: number) => {
      const isGameActive = gameState === 'playing' || gameState === 'practice';
      if (!isGameActive) return;
      if (isAITurn) return;
      setAimPosition({ x, y });
    },
    [gameState, setAimPosition, isAITurn]
  );

  // Reset shrink on darts reset (start of turn after 3 darts)
  useEffect(() => {
    if (dartsThrown === 0) {
      setPerfectShrinkAmount(0);
      lastThrowPerfectRef.current = false;
      preThrowScoreRef.current = null;
    }
  }, [dartsThrown]);

  // Reset shrink on player change (handles turn switching in multiplayer)
  useEffect(() => {
    setPerfectShrinkAmount(0);
    lastThrowPerfectRef.current = false;
    preThrowScoreRef.current = null;
  }, [currentPlayerIndex]);

  // Wobble effect for offline games (pressure situations)
  useEffect(() => {
    // Only apply wobble in offline games during play
    if (matchData || gameState !== 'playing' || !currentPlayer) {
      setAimWobble({ x: 0, y: 0 });
      return;
    }

    const wobbleResult = checkWobbleConditions(
      sessionSkillLevel,
      currentTurnThrows,
      dartsThrown,
      currentPlayer.score,
      aimPosition,
      DEFAULT_WOBBLE_CONFIG
    );

    // Stop wobble when power charging (stabilize for throw)
    if (wobbleResult.shouldWobble && !isPowerCharging) {
      const interval = setInterval(() => {
        setAimWobble(generateWobbleOffset(DEFAULT_WOBBLE_CONFIG.wobbleAmount));
      }, DEFAULT_WOBBLE_CONFIG.wobbleInterval);

      return () => {
        clearInterval(interval);
        setAimWobble({ x: 0, y: 0 });
      };
    } else {
      setAimWobble({ x: 0, y: 0 });
    }
  }, [
    matchData,
    gameState,
    currentPlayer,
    currentTurnThrows,
    dartsThrown,
    aimPosition,
    isPowerCharging,
    sessionSkillLevel,
  ]);

  // === AI Turn Handler ===
  // Auto-throws when it's AI's turn in offline 'playing' mode
  useEffect(() => {
    // Only active during offline 'playing' mode (not practice, not online)
    if (gameState !== 'playing') return;
    if (matchData) return;
    if (winner) return;
    if (dartsThrown >= 3) return;
    if (isSubmittingThrow) return;
    if (isPowerCharging) return;

    const currentPlayerObj = players[currentPlayerIndex];
    if (!currentPlayerObj?.isAI) return;

    // Prevent double scheduling: if timer already exists, don't reschedule
    if (aiTimeoutRef.current) return;

    const difficulty = currentPlayerObj.aiDifficulty || 'medium';
    const delay = getAIThinkingDelay(difficulty);

    if (import.meta.env.MODE !== 'production') {
      console.debug('[AI] throw scheduled', {
        player: currentPlayerObj.name,
        difficulty,
        delay,
        dartsThrown,
      });
    }

    aiTimeoutRef.current = setTimeout(() => {
      // Stale timer guard: recheck all conditions with live state
      const livePlayer = players[currentPlayerIndex];
      const stillValid =
        gameState === 'playing' &&
        !matchData &&
        !winner &&
        livePlayer?.isAI &&
        dartsThrown < 3 &&
        !isSubmittingThrow &&
        !isPowerCharging;

      if (!stillValid) {
        if (import.meta.env.MODE !== 'production') {
          console.debug('[AI] throw cancelled (stale timer)');
        }
        aiTimeoutRef.current = null;
        return;
      }

      // Use live player state for targeting
      const liveDifficulty = livePlayer.aiDifficulty || 'medium';
      const target = getAITarget(liveDifficulty, livePlayer.score);
      const throwPosition = calculateAIThrow(target, liveDifficulty);

      // AI doesn't use power meter, so clear perfect zone refs
      lastThrowPerfectRef.current = false;
      preThrowScoreRef.current = null;

      // Play throw sound (same as human path)
      playSound('throw');

      // Execute throw - handleBoardClick handles result sounds
      handleBoardClick(throwPosition.x, throwPosition.y);

      // Clear timeout ref (in-flight cleared by separate effect)
      aiTimeoutRef.current = null;
    }, delay);

    // Cleanup on unmount/deps change
    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
    };
  }, [
    gameState,
    matchData,
    winner,
    players,
    currentPlayerIndex,
    dartsThrown,
    isSubmittingThrow,
    isPowerCharging,
    playSound,
    handleBoardClick,
  ]);

  // Play checkout sound when winner is determined
  useEffect(() => {
    if (winner) {
      playSound('checkout');
    }
  }, [winner, playSound]);

  // === Handlers for HomePage ===
  const handleShowToast = useCallback((message: string) => {
    // TODO: Replace with proper toast system
    console.log('[Toast]', message);
  }, []);

  const handleOpenProfile = useCallback(() => {
    setGameState('profile');
  }, [setGameState]);

  const handleOpenAchievements = useCallback(() => {
    setGameState('achievements');
  }, [setGameState]);

  const handleOpenThemeSelector = useCallback(() => {
    setShowThemeSelector(true);
  }, []);

  const handleOpenShop = useCallback(() => {
    setShowCoinShop(true);
  }, []);

  const handlePlayAI = useCallback(() => {
    setPlayerSetup((prev) => ({
      ...prev,
      count: 2,
      aiPlayers: [false, true],
      aiDifficulty: [null, 'medium'],
    }));
    setIsPracticeMode(false);
    setIsOnlineGame(false);
    setPerfectShrinkAmount(0);
    lastThrowPerfectRef.current = false;
    preThrowScoreRef.current = null;
    setGameState('setup');
  }, [setPlayerSetup, setGameState]);

  const handlePractice = useCallback(() => {
    setPlayerSetup((prev) => ({
      ...prev,
      count: 1,
      aiPlayers: [false],
      aiDifficulty: [null],
    }));
    setIsPracticeMode(true);
    setIsOnlineGame(false);
    setPerfectShrinkAmount(0);
    lastThrowPerfectRef.current = false;
    preThrowScoreRef.current = null;
    setGameState('practice');
  }, [setPlayerSetup, setGameState]);

  // Render landing page
  if (gameState === 'landing') {
    return (
      <div className="app">
        <HomePage
          user={user}
          isAnonymous={isAnonymous}
          authLoading={authLoading}
          signInWithGoogle={signInWithGoogle}
          signInWithFacebook={signInWithFacebook}
          signInWithApple={signInWithApple}
          signOut={signOut}
          coinBalance={coinBalance}
          dailyBonusAvailable={dailyBonusAvailable}
          walletLoading={walletLoading}
          isClaimingBonus={isClaimingBonus}
          onClaimBonus={claimDailyBonus}
          onOpenShop={handleOpenShop}
          soundEnabled={soundEnabled}
          onSoundToggle={setSoundEnabled}
          onOpenThemeSelector={handleOpenThemeSelector}
          onOpenProfile={handleOpenProfile}
          onOpenAchievements={handleOpenAchievements}
          isSearching={isSearching}
          isCreatingEscrow={isCreatingEscrow}
          errorText={errorText}
          onPlayOnline={handlePlayOnline}
          onPlayAI={handlePlayAI}
          onPractice={handlePractice}
          onShowToast={handleShowToast}
        />
        {showStakeSelection && (
          <StakeSelector
            coinBalance={coinBalance}
            selectedStake={selectedStake}
            onSelectStake={setSelectedStake}
            onConfirm={startWageredMatchmaking}
            onPlayFree={handlePlayFreeFromModal}
            onClose={handleCloseStakeSelection}
            isLoading={isCreatingEscrow}
          />
        )}
        {showCoinShop && (
          <CoinShop
            coinBalance={coinBalance}
            onClose={() => setShowCoinShop(false)}
          />
        )}
        {showThemeSelector && (
          <ThemeSelector
            currentThemeId={themeId}
            onSelectTheme={(id) => {
              selectTheme(id);
              setShowThemeSelector(false);
            }}
            onClose={() => setShowThemeSelector(false)}
          />
        )}
        <AchievementToast
          unlockedIds={recentUnlocks}
          onDismissed={handleAchievementsDismissed}
        />
      </div>
    );
  }

  // Render setup screen
  if (gameState === 'setup') {
    return (
      <div className="app">
        <div className="setup">
          <h2 className="setup__title">Game Setup</h2>

          <div className="setup__options">
            <div className="setup__option">
              <label className="setup__label">Players</label>
              <div className="setup__buttons">
                {[1, 2].map((count) => (
                  <button
                    key={count}
                    className={`setup__btn ${playerSetup.count === count ? 'setup__btn--active' : ''}`}
                    onClick={() =>
                      setPlayerSetup((prev) => ({ ...prev, count }))
                    }
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div className="setup__option">
              <label className="setup__label">Game Mode</label>
              <div className="setup__buttons">
                {[301, 501].map((mode) => (
                  <button
                    key={mode}
                    className={`setup__btn ${playerSetup.gameMode === mode ? 'setup__btn--active' : ''}`}
                    onClick={() =>
                      setPlayerSetup((prev) => ({
                        ...prev,
                        gameMode: mode as 301 | 501,
                      }))
                    }
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {playerSetup.count === 2 && (
              <div className="setup__option">
                <label className="setup__label">Player 2</label>
                <div className="setup__buttons">
                  <button
                    className={`setup__btn ${!playerSetup.aiPlayers[1] ? 'setup__btn--active' : ''}`}
                    onClick={() =>
                      setPlayerSetup((prev) => ({
                        ...prev,
                        aiPlayers: [false, false],
                        aiDifficulty: [null, null],
                      }))
                    }
                  >
                    Human
                  </button>
                  <button
                    className={`setup__btn ${playerSetup.aiPlayers[1] ? 'setup__btn--active' : ''}`}
                    onClick={() =>
                      setPlayerSetup((prev) => ({
                        ...prev,
                        aiPlayers: [false, true],
                        aiDifficulty: [null, 'medium'],
                      }))
                    }
                  >
                    AI
                  </button>
                </div>
              </div>
            )}

            {/* Difficulty selector (shown when AI opponent selected) */}
            {playerSetup.count === 2 && playerSetup.aiPlayers[1] && (
              <div className="setup__group">
                <DifficultySelector
                  value={gameDifficulty}
                  onChange={(diff) => {
                    setGameDifficulty(diff);
                    // Only sync AI difficulty if Player 2 is actually AI (defensive guard)
                    if (playerSetup.aiPlayers[1]) {
                      setPlayerSetup((prev) => ({
                        ...prev,
                        aiDifficulty: [prev.aiDifficulty[0], diff],
                      }));
                    }
                  }}
                />
              </div>
            )}
          </div>

          <div className="setup__actions">
            <button className="btn btn-ghost" onClick={() => setGameState('landing')}>
              Back
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                // Track AI opponent for achievement system
                const hasAI = playerSetup.aiPlayers.some(Boolean);
                setHasAIOpponent(hasAI);
                setIsPracticeMode(false);
                setIsOnlineGame(false);
                // Set session skill level based on difficulty (resolved once at start)
                setSessionSkillLevel(getSkillLevelForDifficulty(gameDifficulty));
                // Reset shrink state for new game
                setPerfectShrinkAmount(0);
                lastThrowPerfectRef.current = false;
                preThrowScoreRef.current = null;
                startGame();
              }}
            >
              Start Game
            </button>
          </div>
        </div>
        <AchievementToast
          unlockedIds={recentUnlocks}
          onDismissed={handleAchievementsDismissed}
        />
      </div>
    );
  }

  // Render achievements gallery
  if (gameState === 'achievements') {
    return (
      <div className="app">
        <AchievementGallery
          achievementsState={achievements.getState()}
          onClose={() => setGameState('landing')}
        />
        <AchievementToast
          unlockedIds={recentUnlocks}
          onDismissed={handleAchievementsDismissed}
        />
      </div>
    );
  }

  // Render profile screen
  if (gameState === 'profile') {
    return (
      <div className="app">
        <ProfileScreen
          onClose={() => setGameState('landing')}
          onViewAchievements={() => setGameState('achievements')}
          unlockedAchievementCount={achievements.getState().unlockedIds.size}
          totalAchievementCount={ACHIEVEMENTS.length}
        />
        <AchievementToast
          unlockedIds={recentUnlocks}
          onDismissed={handleAchievementsDismissed}
        />
      </div>
    );
  }

  // Render game screen
  if (gameState === 'playing' || gameState === 'practice') {
    return (
      <div className="app">
        <div className="game">
          <div className="game__sidebar game__sidebar--left">
            <ScoreDisplay
              players={players}
              currentPlayerIndex={currentPlayerIndex}
              dartsThrown={dartsThrown}
              currentTurnScore={currentTurnScore}
              checkout={checkout}
              legScores={legScores}
              setScores={setScores}
              gameStats={gameStats}
              showStats
            />

            <button
              className="btn btn-ghost game__quit"
              onClick={handleReturnToMenu}
            >
              Quit Game
            </button>
          </div>

          <div className="game__board" style={isAITurn ? { pointerEvents: 'none' } : undefined}>
            {/* Dartboard with power handlers attached (primary input) */}
            <Dartboard
              theme={theme}
              dartPositions={dartPositions}
              aimPosition={aimPosition}
              aimWobble={aimWobble}
              showAimCursor={!isPowerCharging}
              onBoardMove={handleBoardMove}
              onPointerDown={handleBoardPointerDown}
              onPointerUp={powerHandlers.onPointerUp}
              onPointerCancel={powerHandlers.onPointerCancel}
              onPointerLeave={powerHandlers.onPointerLeave}
              onContextMenu={powerHandlers.onContextMenu}
              disabled={dartsThrown >= 3 || !!winner || isAITurn}
            />

            {/* Rhythm indicator for online games */}
            {matchData && <RhythmIndicator state={rhythmState} />}

            {/* Horizontal power bar below dartboard */}
            <div style={{ width: 'min(400px, 85vw)', marginTop: '20px' }}>
              <PowerBar
                power={power}
                isCharging={isPowerCharging}
                perfectZoneWidth={perfectZoneWidth}
              />
              <p style={{ color: 'var(--color-text-muted)', marginTop: '15px', fontSize: '13px', textAlign: 'center' }}>
                {isPowerCharging ? 'Release to throw!' : 'Hold board to charge, release to throw'}
              </p>
            </div>

            {/* Fallback throw button for accessibility */}
            <div className="game__controls">
              <button
                className="btn btn-primary game__throw-btn"
                onPointerDown={handleBoardPointerDown}
                onPointerUp={powerHandlers.onPointerUp}
                onPointerCancel={powerHandlers.onPointerCancel}
                onPointerLeave={powerHandlers.onPointerLeave}
                onContextMenu={powerHandlers.onContextMenu}
                disabled={dartsThrown >= 3 || !!winner || isAITurn}
              >
                {isPowerCharging ? 'Release!' : 'Hold to Throw'}
              </button>
            </div>
          </div>

          {/* Right sidebar - History */}
          <div className="game__sidebar game__sidebar--right">
            <div className="history-panel">
              <h3 className="history-panel__title">HISTORY</h3>
              <div className="history-panel__content">
                {currentTurnThrows.length === 0 ? (
                  <p className="history-panel__empty">No throws yet</p>
                ) : (
                  <ul className="history-panel__list">
                    {currentTurnThrows.map((throwResult, idx) => (
                      <li key={idx} className="history-panel__item">
                        {throwResult.segment} - {throwResult.score}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
        <AchievementToast
          unlockedIds={recentUnlocks}
          onDismissed={handleAchievementsDismissed}
        />
      </div>
    );
  }

  // Render game over screen
  if (gameState === 'gameOver' && winner) {
    return (
      <div className="app">
        <div className="game-over">
          <h2 className="game-over__title">Game Over!</h2>
          <p className="game-over__winner">
            <span className="game-over__flag">{winner.flag}</span>
            {winner.name} Wins!
          </p>
          {wageredPrize !== null && (
            <p className="game-over__prize">
              <CoinIcon size={20} />
              <span>Won {wageredPrize} coins!</span>
            </p>
          )}

          <div className="game-over__actions">
            <button className="btn btn-primary" onClick={() => {
              // Reset shrink state for new game
              setPerfectShrinkAmount(0);
              lastThrowPerfectRef.current = false;
              preThrowScoreRef.current = null;
              startGame();
            }}>
              Play Again
            </button>
            <button className="btn btn-ghost" onClick={handleReturnToMenu}>
              Main Menu
            </button>
          </div>
        </div>
        <AchievementToast
          unlockedIds={recentUnlocks}
          onDismissed={handleAchievementsDismissed}
        />
      </div>
    );
  }

  // Default fallback
  return (
    <div className="app">
      <div className="loading">Loading...</div>
      <AchievementToast
        unlockedIds={recentUnlocks}
        onDismissed={handleAchievementsDismissed}
      />
    </div>
  );
}

export default App;
