/**
 * Quik Darts - Main Application
 *
 * Championship-style online darts game.
 * Ported from V1 single-file to Vite + React + TypeScript.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dartboard, ScoreDisplay, PowerBar, RhythmIndicator } from './components/game';
import type { RhythmState, Position } from './types';
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
import { CoinDisplay } from './components/CoinDisplay';
import { StakeSelector } from './components/StakeSelector';
import { AchievementToast } from './components/AchievementToast';
import { AchievementGallery } from './components/AchievementGallery';
import { ProfileScreen } from './components/ProfileScreen';
import { CoinShop } from './components/CoinShop';
import { SoundToggle } from './components/SoundToggle';
import { ThemeSelector } from './components/ThemeSelector';
import { WeeklyChallengeBadge } from './components/WeeklyChallengeBadge';
import { DifficultySelector } from './components/DifficultySelector';
import {
  type GameDifficulty,
  getSkillLevelForDifficulty,
  DEFAULT_SKILL_LEVEL,
} from './utils/difficulty';
import { DartIcon, GlobeIcon, TargetIcon, TrophyIcon, CoinIcon, UserIcon } from './components/icons';
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

  // Ref to prevent duplicate settleGame calls (UI guard)
  const settledGameRef = useRef<string | null>(null);

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
    power,
    setPower,
    isPowerCharging,
    setIsPowerCharging,
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

  // Cleanup matchmaking on unmount
  useEffect(() => {
    return () => {
      void leaveCasualQueue();
      void leaveWageredQueue();
      unsubscribeFromGameRoom();
    };
  }, []);

  // Cleanup online state and return to menu
  const handleReturnToMenu = useCallback(() => {
    void leaveCasualQueue();
    void leaveWageredQueue();
    unsubscribeFromGameRoom();
    setMatchData(null);
    setGameSnapshot(null);
    setIsWageredMatch(false);
    setShowStakeSelection(false);
    setIsSearching(false);
    setIsCreatingEscrow(false);
    setErrorText(null);
    setWageredPrize(null);
    settledGameRef.current = null;
    // Reset achievement context
    setIsOnlineGame(false);
    setIsPracticeMode(false);
    setHasAIOpponent(false);
    setRhythmState('neutral');
    setAimWobble({ x: 0, y: 0 });
    setSessionSkillLevel(DEFAULT_SKILL_LEVEL);
    resetGame();
  }, [resetGame]);

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

  // Handle Play Online button
  const handlePlayOnline = useCallback(async () => {
    if (isSearching) {
      // Cancel: reset BOTH queues cleanly (awaited)
      await leaveCasualQueue();
      await leaveWageredQueue();
      unsubscribeFromGameRoom();
      setIsSearching(false);
      setIsCreatingEscrow(false);
      setErrorText(null);
      setMatchData(null);
      setGameSnapshot(null);
      setIsWageredMatch(false);
      return;
    }

    // Leave wagered queue before starting casual
    await leaveWageredQueue();

    setIsSearching(true);
    setErrorText(null);
    setIsWageredMatch(false);
    setIsOnlineGame(true);

    // TODO: Pull flag/level from user profile when available
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
          setIsSearching(false);
          setMatchData(data);
          subscribeToGameRoom(data.roomId, data.playerIndex, {
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
  }, [isSearching, playerSetup.gameMode, user?.displayName]);

  // Handle Play for Stakes button
  const handlePlayWagered = useCallback(async () => {
    if (isSearching || isCreatingEscrow) {
      // Cancel: reset BOTH queues cleanly (awaited)
      await leaveCasualQueue();
      await leaveWageredQueue();
      unsubscribeFromGameRoom();
      setIsSearching(false);
      setIsCreatingEscrow(false);
      setErrorText(null);
      setMatchData(null);
      setGameSnapshot(null);
      setIsWageredMatch(false);
      return;
    }
    setShowStakeSelection(true);
  }, [isSearching, isCreatingEscrow]);

  // Start wagered matchmaking after stake selection
  const startWageredMatchmaking = useCallback(async () => {
    if (coinBalance < selectedStake) {
      setErrorText('Insufficient balance');
      return;
    }

    setShowStakeSelection(false);
    setIsCreatingEscrow(true);
    setErrorText(null);
    setIsWageredMatch(true);
    setIsOnlineGame(true);

    // Leave casual queue before starting wagered
    await leaveCasualQueue();

    // TODO: Pull flag/level from user profile when available
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
          setIsSearching(false);
          setIsCreatingEscrow(false);
          setMatchData(data);
          subscribeToGameRoom(data.roomId, data.playerIndex, {
            onGameUpdate: (gameData) => {
              setGameSnapshot(gameData);
            },
            onOpponentDisconnect: (opponentName) => {
              // Capture gameId before clearing state
              const gameId = matchData?.roomId;

              unsubscribeFromGameRoom();
              setMatchData(null);
              setGameSnapshot(null);

              if (!isWageredMatch || !gameId) {
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
          setErrorText(error);
        },
        onTimeout: () => {
          setIsSearching(false);
          setIsCreatingEscrow(false);
          setIsWageredMatch(false);
          setErrorText('No opponent found');
        },
      }
    );
  }, [coinBalance, selectedStake, playerSetup.gameMode, user?.displayName]);

  // Close stake selection modal
  const handleCloseStakeSelection = useCallback(() => {
    setShowStakeSelection(false);
  }, []);

  // Play free from stake selection modal
  const handlePlayFreeFromModal = useCallback(async () => {
    setShowStakeSelection(false);
    await handlePlayOnline();
  }, [handlePlayOnline]);

  // Power bar animation
  const powerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const powerDirection = useRef(1);

  // Handle board click (throw dart)
  const handleBoardClick = useCallback(
    async (x: number, y: number) => {
      if (gameState !== 'playing' || dartsThrown >= 3) return;
      if (isSubmittingThrow) return;

      // Online mode: send to server
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
          const res = await submitThrow({
            gameId: matchData.roomId,
            dartPosition: { x, y },
          });

          if (!res) {
            console.warn('[handleBoardClick] submitThrow failed');
          } else {
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

      // Apply wobble offset to throw position (offline games only)
      const effectiveX = x + aimWobble.x;
      const effectiveY = y + aimWobble.y;
      const result = throwDart(effectiveX, effectiveY);

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

      // Auto end turn after 3 darts
      if (dartsThrown + 1 >= 3) {
        setTimeout(() => endTurn(), 1000);
      }
    },
    [gameState, dartsThrown, throwDart, playSound, currentTurnScore, endTurn, matchData, isSubmittingThrow, gameSnapshot, currentPlayerIndex, aimWobble]
  );

  // Handle aim position
  const handleBoardMove = useCallback(
    (x: number, y: number) => {
      if (gameState !== 'playing') return;
      setAimPosition({ x, y });
    },
    [gameState, setAimPosition]
  );

  // Start power charging
  const startPowerCharge = useCallback(() => {
    if (gameState !== 'playing' || dartsThrown >= 3) return;

    setIsPowerCharging(true);
    setPower(0);
    powerDirection.current = 1;

    powerIntervalRef.current = setInterval(() => {
      setPower((prev) => {
        const newPower = prev + powerDirection.current * 2;
        if (newPower >= 100) {
          powerDirection.current = -1;
          return 100;
        }
        if (newPower <= 0) {
          powerDirection.current = 1;
          return 0;
        }
        return newPower;
      });
    }, 20);
  }, [gameState, dartsThrown, setIsPowerCharging, setPower]);

  // Release power and throw
  const releasePower = useCallback(() => {
    if (!isPowerCharging) return;

    if (powerIntervalRef.current) {
      clearInterval(powerIntervalRef.current);
      powerIntervalRef.current = null;
    }

    setIsPowerCharging(false);
    playSound('throw');  // Play throw sound when dart is released
    handleBoardClick(aimPosition.x, aimPosition.y);
  }, [isPowerCharging, setIsPowerCharging, handleBoardClick, aimPosition, playSound]);

  // Cleanup power interval on unmount
  useEffect(() => {
    return () => {
      if (powerIntervalRef.current) {
        clearInterval(powerIntervalRef.current);
      }
    };
  }, []);

  // Play checkout sound when winner is determined
  useEffect(() => {
    if (winner) {
      playSound('checkout');
    }
  }, [winner, playSound]);

  // Render landing page
  if (gameState === 'landing') {
    return (
      <div className="app">
        <div className="landing">
          <header className="landing__header">
            <div className="landing__wallet">
              <CoinDisplay
                coinBalance={coinBalance}
                dailyBonusAvailable={dailyBonusAvailable}
                isLoading={walletLoading}
                isClaimingBonus={isClaimingBonus}
                onClaimBonus={claimDailyBonus}
                onOpenShop={() => setShowCoinShop(true)}
              />
            </div>
            <SoundToggle
              enabled={soundEnabled}
              onToggle={setSoundEnabled}
            />
            <button
              className="landing__theme-btn"
              onClick={() => setShowThemeSelector(true)}
              title="Change Theme"
            >
              <TargetIcon size={24} />
            </button>
            <button
              className="landing__profile-btn"
              onClick={() => setGameState('profile')}
              title="Profile"
            >
              <UserIcon size={24} />
            </button>
            <h1 className="landing__title">Quik Darts</h1>
            <p className="landing__subtitle">Championship Edition</p>
          </header>

          {/* User info section - always show if user exists */}
          {user && (
            <div className="landing__user-info">
              <img
                src={user.photoURL || '/assets/default-avatar.png'}
                alt="Avatar"
                className="landing__avatar"
              />
              <div className="landing__user-details">
                <span className="landing__user-name">
                  {user.displayName || 'Player'}
                  {isAnonymous && <span className="landing__guest-badge">Guest</span>}
                </span>
                <span className="landing__player-id">ID: {user.uid.slice(0, 8)}</span>
              </div>
              {!isAnonymous && (
                <button className="btn btn-ghost landing__signout" onClick={signOut}>
                  Sign Out
                </button>
              )}
            </div>
          )}

          {/* Login buttons - show for anonymous users or no user */}
          {(!user || isAnonymous) && (
            <div className="landing__auth">
              <p className="landing__auth-prompt">
                {isAnonymous ? 'Sign in to save progress' : 'Sign in to play online & save progress'}
              </p>
              <div className="landing__auth-buttons">
                <button
                  className="btn landing__auth-btn landing__auth-btn--google"
                  onClick={signInWithGoogle}
                  disabled={authLoading}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  Google
                </button>
                <button
                  className="btn landing__auth-btn landing__auth-btn--facebook"
                  onClick={signInWithFacebook}
                  disabled={authLoading}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="#1877F2">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                  Facebook
                </button>
                <button
                  className="btn landing__auth-btn landing__auth-btn--apple"
                  onClick={signInWithApple}
                  disabled={authLoading}
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                    <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                  </svg>
                  Apple
                </button>
              </div>
            </div>
          )}

          {/* Weekly Challenge Badge */}
          <div className="landing__weekly-challenge">
            <WeeklyChallengeBadge onClick={() => setGameState('achievements')} />
          </div>

          <div className="landing__menu">
            <button
              className="btn btn-primary landing__btn"
              onClick={() => setGameState('setup')}
            >
              <DartIcon size={24} />
              Start Game
            </button>

            <button
              className="btn btn-secondary landing__btn"
              onClick={() => {
                setPlayerSetup((prev) => ({
                  ...prev,
                  count: 1,
                  aiPlayers: [false],
                  aiDifficulty: [null],
                }));
                setIsPracticeMode(true);
                setIsOnlineGame(false);
                setGameState('practice');
              }}
            >
              <TargetIcon size={24} />
              Practice Mode
            </button>

            <button className="btn btn-ghost landing__btn" onClick={handlePlayOnline}>
              <GlobeIcon size={24} />
              {isSearching && !isWageredMatch ? 'Searching... (tap to cancel)' : errorText || 'Play Online'}
            </button>

            <button
              className="btn btn-ghost landing__btn"
              onClick={handlePlayWagered}
              disabled={walletLoading}
            >
              <CoinIcon size={24} />
              {isCreatingEscrow
                ? 'Creating match...'
                : isSearching && isWageredMatch
                  ? 'Searching... (tap to cancel)'
                  : 'Play for Stakes'}
            </button>

            <button
              className="btn btn-ghost landing__btn"
              onClick={() => setGameState('achievements')}
            >
              <TrophyIcon size={24} />
              Achievements
            </button>
          </div>

          <footer className="landing__footer">
            <p>Quik Darts v2.0 - Built with React + TypeScript</p>
          </footer>
        </div>

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
                  onChange={setGameDifficulty}
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

          <div className="game__board">
            <Dartboard
              theme={theme}
              dartPositions={dartPositions}
              aimPosition={aimPosition}
              aimWobble={aimWobble}
              showAimCursor={!isPowerCharging}
              onBoardMove={handleBoardMove}
              disabled={dartsThrown >= 3 || !!winner}
            />

            {/* Rhythm indicator for online games */}
            {matchData && <RhythmIndicator state={rhythmState} />}

            <div className="game__controls">
              <button
                className="btn btn-primary game__throw-btn"
                onMouseDown={startPowerCharge}
                onMouseUp={releasePower}
                onTouchStart={startPowerCharge}
                onTouchEnd={releasePower}
                disabled={dartsThrown >= 3 || !!winner}
              >
                {isPowerCharging ? 'Release to Throw!' : 'Hold to Throw'}
              </button>
            </div>
          </div>

          <div className="game__sidebar game__sidebar--right">
            <PowerBar
              power={power}
              isCharging={isPowerCharging}
              orientation="vertical"
            />
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
            <button className="btn btn-primary" onClick={startGame}>
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
