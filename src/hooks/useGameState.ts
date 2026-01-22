/**
 * useGameState Hook
 *
 * Manages core game state: players, scores, dart positions,
 * turn management, and game flow.
 */

import { useState, useCallback, useMemo } from 'react';
import type {
  GameState,
  GameMode,
  Player,
  Position,
  DartPosition,
  ThrowResult,
  PlayerStats,
  MatchScores,
  AIDifficulty,
} from '../types';
import { CENTER, SEGMENTS } from '../constants';
import {
  calculateScore,
  wouldBust,
  getCheckoutSuggestion,
} from '../utils/scoring';
import {
  validateScore,
  validatePlayerIndex,
  validateDartsThrown,
} from '../utils/validation';

export interface GameConfig {
  gameMode: GameMode;
  legsPerSet: number;
  setsToWin: number;
}

export interface PlayerSetupData {
  count: number;
  names: string[];
  gameMode: GameMode;
  aiPlayers: boolean[];
  aiDifficulty: (AIDifficulty | null)[];
  legsPerSet: number;
  setsToWin: number;
  flags: string[];
}

export interface UseGameStateReturn {
  // State
  gameState: GameState;
  players: Player[];
  currentPlayerIndex: number;
  dartsThrown: number;
  currentTurnScore: number;
  dartPositions: DartPosition[];
  aimPosition: Position;
  isAiming: boolean;
  power: number;
  isPowerCharging: boolean;
  gameStats: Record<string, PlayerStats>;
  winner: Player | null;
  checkout: string | null;
  legScores: number[];
  setScores: number[];
  matchWinner: Player | null;
  showScorePopup: ThrowResult | null;
  currentTurnThrows: ThrowResult[];
  playerSetup: PlayerSetupData;

  // Computed
  currentPlayer: Player | null;
  hasAIOpponent: boolean;
  isCheckoutPosition: boolean;

  // Actions
  setGameState: (state: GameState) => void;
  setPlayerSetup: (setup: PlayerSetupData | ((prev: PlayerSetupData) => PlayerSetupData)) => void;
  startGame: () => void;
  throwDart: (x: number, y: number) => ThrowResult;
  endTurn: () => void;
  setAimPosition: (pos: Position) => void;
  setIsAiming: (aiming: boolean) => void;
  setPower: (power: number) => void;
  setIsPowerCharging: (charging: boolean) => void;
  resetGame: () => void;
  resetLeg: () => void;
}

const DEFAULT_PLAYER_SETUP: PlayerSetupData = {
  count: 1,
  names: ['Player 1', 'Player 2', 'Player 3', 'Player 4'],
  gameMode: 501,
  aiPlayers: [false, false, false, false],
  aiDifficulty: [null, null, null, null],
  legsPerSet: 3,
  setsToWin: 1,
  flags: ['\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}', '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}'],
};

const createInitialStats = (): PlayerStats => ({
  dartsThrown: 0,
  totalScore: 0,
  averagePerDart: 0,
  averagePerTurn: 0,
  highest3DartScore: 0,
  checkoutPercentage: 0,
  triples: 0,
  doubles: 0,
  bulls: 0,
  one80s: 0,
});

export function useGameState(): UseGameStateReturn {
  // Core state
  const [gameState, setGameState] = useState<GameState>('landing');
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [dartsThrown, setDartsThrown] = useState(0);
  const [currentTurnScore, setCurrentTurnScore] = useState(0);
  const [dartPositions, setDartPositions] = useState<DartPosition[]>([]);
  const [currentTurnThrows, setCurrentTurnThrows] = useState<ThrowResult[]>([]);

  // Aiming state
  const [aimPosition, setAimPosition] = useState<Position>({
    x: CENTER,
    y: CENTER,
  });
  const [isAiming, setIsAiming] = useState(false);
  const [power, setPower] = useState(0);
  const [isPowerCharging, setIsPowerCharging] = useState(false);

  // Game results
  const [gameStats, setGameStats] = useState<Record<string, PlayerStats>>({});
  const [winner, setWinner] = useState<Player | null>(null);
  const [checkout, setCheckout] = useState<string | null>(null);
  const [showScorePopup, setShowScorePopup] = useState<ThrowResult | null>(null);

  // Match state (legs and sets)
  const [legScores, setLegScores] = useState<number[]>([]);
  const [setScores, setSetScores] = useState<number[]>([]);
  const [matchWinner, setMatchWinner] = useState<Player | null>(null);

  // Setup
  const [playerSetup, setPlayerSetup] =
    useState<PlayerSetupData>(DEFAULT_PLAYER_SETUP);

  // Computed values
  const currentPlayer = useMemo(
    () => players[currentPlayerIndex] || null,
    [players, currentPlayerIndex]
  );

  const hasAIOpponent = useMemo(
    () => players.length > 1 && players.some((p) => p.isAI),
    [players]
  );

  const isCheckoutPosition = useMemo(() => {
    if (!currentPlayer) return false;
    return currentPlayer.score <= 170 && currentPlayer.score >= 2;
  }, [currentPlayer]);

  // Update checkout suggestion when score changes
  const updateCheckout = useCallback(() => {
    if (currentPlayer && currentPlayer.score <= 170) {
      setCheckout(getCheckoutSuggestion(currentPlayer.score));
    } else {
      setCheckout(null);
    }
  }, [currentPlayer]);

  // Start a new game
  const startGame = useCallback(() => {
    const newPlayers: Player[] = [];
    const newStats: Record<string, PlayerStats> = {};

    for (let i = 0; i < playerSetup.count; i++) {
      const playerId = `player_${i}`;
      newPlayers.push({
        id: playerId,
        name: playerSetup.names[i] || `Player ${i + 1}`,
        score: playerSetup.gameMode,
        isAI: playerSetup.aiPlayers[i] || false,
        aiDifficulty: playerSetup.aiDifficulty[i],
        flag: playerSetup.flags[i] || '\u{1F30D}',
      });
      newStats[playerId] = createInitialStats();
    }

    setPlayers(newPlayers);
    setGameStats(newStats);
    setCurrentPlayerIndex(0);
    setDartsThrown(0);
    setCurrentTurnScore(0);
    setDartPositions([]);
    setCurrentTurnThrows([]);
    setWinner(null);
    setMatchWinner(null);
    setLegScores(new Array(playerSetup.count).fill(0));
    setSetScores(new Array(playerSetup.count).fill(0));
    setGameState('playing');
  }, [playerSetup]);

  // Throw a dart
  const throwDart = useCallback(
    (x: number, y: number): ThrowResult => {
      const result = calculateScore(x, y);

      // Check for bust
      if (currentPlayer) {
        result.isBust = wouldBust(
          currentPlayer.score,
          result.score,
          result.multiplier
        );
      }

      // Create dart position
      const dartPos: DartPosition = {
        id: `dart_${Date.now()}_${Math.random()}`,
        x,
        y,
        score: result.score,
        multiplier: result.multiplier,
        segment: result.segment,
      };

      // Update state
      setDartPositions((prev) => [...prev, dartPos]);
      setCurrentTurnThrows((prev) => [...prev, result]);
      setDartsThrown((prev) => prev + 1);

      if (!result.isBust) {
        setCurrentTurnScore((prev) => prev + result.score);

        // Update player score
        if (currentPlayer) {
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === currentPlayer.id
                ? { ...p, score: p.score - result.score }
                : p
            )
          );

          // Update stats
          setGameStats((prev) => {
            const stats = prev[currentPlayer.id] || createInitialStats();
            return {
              ...prev,
              [currentPlayer.id]: {
                ...stats,
                dartsThrown: stats.dartsThrown + 1,
                totalScore: stats.totalScore + result.score,
                triples: stats.triples + (result.multiplier === 3 ? 1 : 0),
                doubles: stats.doubles + (result.multiplier === 2 ? 1 : 0),
                bulls:
                  stats.bulls +
                  (result.segment === 'BULL' || result.segment === '25' ? 1 : 0),
              },
            };
          });

          // Check for checkout (won the leg)
          if (currentPlayer.score - result.score === 0) {
            // Player wins this leg
            handleLegWon();
          }
        }
      }

      // Show score popup
      setShowScorePopup(result);
      setTimeout(() => setShowScorePopup(null), 1500);

      return result;
    },
    [currentPlayer]
  );

  // Handle leg won
  const handleLegWon = useCallback(() => {
    if (!currentPlayer) return;

    setLegScores((prev) => {
      const newScores = [...prev];
      newScores[currentPlayerIndex]++;
      return newScores;
    });

    // Check if set is won
    const newLegScore = legScores[currentPlayerIndex] + 1;
    if (newLegScore >= playerSetup.legsPerSet) {
      // Set won
      setSetScores((prev) => {
        const newScores = [...prev];
        newScores[currentPlayerIndex]++;
        return newScores;
      });

      // Check if match is won
      const newSetScore = setScores[currentPlayerIndex] + 1;
      if (newSetScore >= playerSetup.setsToWin) {
        // Match won
        setMatchWinner(currentPlayer);
        setWinner(currentPlayer);
        setGameState('gameOver');
      } else {
        // Reset legs for new set
        setLegScores(new Array(players.length).fill(0));
        resetLeg();
      }
    } else {
      // Next leg
      resetLeg();
    }
  }, [
    currentPlayer,
    currentPlayerIndex,
    legScores,
    setScores,
    playerSetup,
    players.length,
  ]);

  // End turn
  const endTurn = useCallback(() => {
    // Update highest 3-dart score
    if (currentPlayer && currentTurnScore > 0) {
      setGameStats((prev) => {
        const stats = prev[currentPlayer.id] || createInitialStats();
        return {
          ...prev,
          [currentPlayer.id]: {
            ...stats,
            highest3DartScore: Math.max(
              stats.highest3DartScore,
              currentTurnScore
            ),
            one80s: stats.one80s + (currentTurnScore === 180 ? 1 : 0),
          },
        };
      });
    }

    // Move to next player
    setCurrentPlayerIndex((prev) => (prev + 1) % players.length);
    setDartsThrown(0);
    setCurrentTurnScore(0);
    setDartPositions([]);
    setCurrentTurnThrows([]);
  }, [currentPlayer, currentTurnScore, players.length]);

  // Reset leg (for new leg in same match)
  const resetLeg = useCallback(() => {
    setPlayers((prev) =>
      prev.map((p) => ({ ...p, score: playerSetup.gameMode }))
    );
    setCurrentPlayerIndex(0);
    setDartsThrown(0);
    setCurrentTurnScore(0);
    setDartPositions([]);
    setCurrentTurnThrows([]);
    setWinner(null);
  }, [playerSetup.gameMode]);

  // Reset entire game
  const resetGame = useCallback(() => {
    setGameState('landing');
    setPlayers([]);
    setCurrentPlayerIndex(0);
    setDartsThrown(0);
    setCurrentTurnScore(0);
    setDartPositions([]);
    setCurrentTurnThrows([]);
    setGameStats({});
    setWinner(null);
    setMatchWinner(null);
    setLegScores([]);
    setSetScores([]);
    setCheckout(null);
    setShowScorePopup(null);
    setAimPosition({ x: CENTER, y: CENTER });
    setIsAiming(false);
    setPower(0);
    setIsPowerCharging(false);
  }, []);

  return {
    // State
    gameState,
    players,
    currentPlayerIndex,
    dartsThrown,
    currentTurnScore,
    dartPositions,
    aimPosition,
    isAiming,
    power,
    isPowerCharging,
    gameStats,
    winner,
    checkout,
    legScores,
    setScores,
    matchWinner,
    showScorePopup,
    currentTurnThrows,
    playerSetup,

    // Computed
    currentPlayer,
    hasAIOpponent,
    isCheckoutPosition,

    // Actions
    setGameState,
    setPlayerSetup,
    startGame,
    throwDart,
    endTurn,
    setAimPosition,
    setIsAiming,
    setPower,
    setIsPowerCharging,
    resetGame,
    resetLeg,
  };
}

export default useGameState;
