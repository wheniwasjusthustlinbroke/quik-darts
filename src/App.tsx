/**
 * Quik Darts - Main Application
 *
 * Championship-style online darts game.
 * Ported from V1 single-file to Vite + React + TypeScript.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Dartboard, ScoreDisplay, PowerBar } from './components/game';
import { useGameState, useSound } from './hooks';
import { DartIcon, GlobeIcon, TargetIcon, TrophyIcon } from './components/icons';
import {
  joinCasualQueue,
  leaveCasualQueue,
  subscribeToGameRoom,
  unsubscribeFromGameRoom,
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
    currentPlayerIndex,
    dartsThrown,
    currentTurnScore,
    dartPositions,
    aimPosition,
    setAimPosition,
    power,
    setPower,
    isPowerCharging,
    setIsPowerCharging,
    gameStats,
    winner,
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

  // Matchmaking state
  const [isSearching, setIsSearching] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [matchData, setMatchData] = useState<MatchFoundData | null>(null);
  const [gameSnapshot, setGameSnapshot] = useState<any>(null);

  // Cleanup matchmaking on unmount
  useEffect(() => {
    return () => {
      void leaveCasualQueue();
      unsubscribeFromGameRoom();
    };
  }, []);

  // Handle Play Online button
  const handlePlayOnline = useCallback(() => {
    if (isSearching) {
      // Cancel
      void leaveCasualQueue();
      unsubscribeFromGameRoom();
      setIsSearching(false);
      setErrorText(null);
      setMatchData(null);
      setGameSnapshot(null);
      return;
    }

    setIsSearching(true);
    setErrorText(null);

    joinCasualQueue(
      { displayName: 'Player', flag: '🌍', level: 1 },
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
  }, [isSearching, playerSetup.gameMode]);

  // Power bar animation
  const powerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const powerDirection = useRef(1);

  // Handle board click (throw dart)
  const handleBoardClick = useCallback(
    (x: number, y: number) => {
      if (gameState !== 'playing' || dartsThrown >= 3) return;

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
    [gameState, dartsThrown, throwDart, playSound, currentTurnScore, endTurn]
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
              {isSearching ? 'Searching... (tap to cancel)' : errorText || 'Play Online'}
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
              onClick={resetGame}
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
            <button className="btn btn-ghost" onClick={resetGame}>
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
