/**
 * Quik Darts - Main Application
 *
 * Championship-style online darts game.
 * Ported from V1 single-file to Vite + React + TypeScript.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dartboard, ScoreDisplay, PowerBar } from './components/game';
import { useGameState, useSound, useAuth } from './hooks';
import { useWallet } from './hooks/useWallet';
import { CoinDisplay } from './components/CoinDisplay';
import { StakeSelector } from './components/StakeSelector';
import { DartIcon, GlobeIcon, TargetIcon, TrophyIcon, CoinIcon } from './components/icons';
import {
  joinCasualQueue,
  leaveCasualQueue,
  joinWageredQueue,
  leaveWageredQueue,
  subscribeToGameRoom,
  unsubscribeFromGameRoom,
  submitThrow,
  MatchFoundData,
} from './services/matchmaking';
import './styles/index.css';
import './App.css';

function App() {
  // Game state
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
  } = useGameState();

  // Sound effects
  const { playSound } = useSound();

  // Wallet state
  const { coinBalance, dailyBonusAvailable, isLoading: walletLoading, isClaimingBonus, claimDailyBonus } = useWallet();

  // Auth state (for user profile)
  const { user } = useAuth();

  // Matchmaking state
  const [isSearching, setIsSearching] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<MatchFoundData | null>(null);
  const [gameSnapshot, setGameSnapshot] = useState<any>(null);
  const [isSubmittingThrow, setIsSubmittingThrow] = useState(false);

  // Wagered match state
  const [showStakeSelection, setShowStakeSelection] = useState(false);
  const [selectedStake, setSelectedStake] = useState(50);
  const [isWageredMatch, setIsWageredMatch] = useState(false);
  const [isCreatingEscrow, setIsCreatingEscrow] = useState(false);

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

    // dartPositions: server stores as object with keys "0", "1", "2"
    // Sort by key to preserve throw order
    if (serverDartPositions) {
      const entries = Object.entries(serverDartPositions);
      entries.sort((a, b) => parseInt(a[0]) - parseInt(b[0]));
      const positions = entries.map(([, pos]) => pos as { x: number; y: number });
      setDartPositions(positions);
    } else {
      setDartPositions([]);
    }

    // Handle game finished
    if (status === 'finished' && serverWinner !== undefined) {
      const winnerData = serverWinner === 0 ? player1 : player2;
      setWinner({ name: winnerData.name, flag: winnerData.flag });

      if (gameState !== 'gameOver') {
        setGameState('gameOver');
      }
    }
  }, [gameSnapshot, matchData, gameState, setGameState, setPlayers, setCurrentPlayerIndex, setDartsThrown, setCurrentTurnScore, setDartPositions, setWinner]);

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
      playerSetup.gameMode,
      selectedStake,
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
              unsubscribeFromGameRoom();
              setMatchData(null);
              setGameSnapshot(null);
              // TODO: Call forfeitGame for wagered matches to award coins
              setErrorText(`${opponentName} disconnected`);
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

      const result = throwDart(x, y);

      // Play appropriate sound
      if (result.score === 0) {
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
    [gameState, dartsThrown, throwDart, playSound, currentTurnScore, endTurn, matchData, isSubmittingThrow, gameSnapshot, currentPlayerIndex]
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
    handleBoardClick(aimPosition.x, aimPosition.y);
  }, [isPowerCharging, setIsPowerCharging, handleBoardClick, aimPosition]);

  // Cleanup power interval on unmount
  useEffect(() => {
    return () => {
      if (powerIntervalRef.current) {
        clearInterval(powerIntervalRef.current);
      }
    };
  }, []);

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
              />
            </div>
            <h1 className="landing__title">Quik Darts</h1>
            <p className="landing__subtitle">Championship Edition</p>
          </header>

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

            <button className="btn btn-ghost landing__btn" disabled>
              <TrophyIcon size={24} />
              Achievements
              <span className="landing__coming-soon">Coming Soon</span>
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
          </div>

          <div className="setup__actions">
            <button className="btn btn-ghost" onClick={() => setGameState('landing')}>
              Back
            </button>
            <button className="btn btn-primary" onClick={startGame}>
              Start Game
            </button>
          </div>
        </div>
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
              dartPositions={dartPositions}
              aimPosition={aimPosition}
              showAimCursor={!isPowerCharging}
              onBoardMove={handleBoardMove}
              disabled={dartsThrown >= 3 || !!winner}
            />

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

          <div className="game-over__actions">
            <button className="btn btn-primary" onClick={startGame}>
              Play Again
            </button>
            <button className="btn btn-ghost" onClick={handleReturnToMenu}>
              Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Default fallback
  return (
    <div className="app">
      <div className="loading">Loading...</div>
    </div>
  );
}

export default App;
