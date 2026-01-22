/**
 * ScoreDisplay Component
 *
 * Shows player scores, current turn info, and checkout suggestions.
 */

import React from 'react';
import type { Player, PlayerStats } from '../../types';
import './ScoreDisplay.css';

interface ScoreDisplayProps {
  players: Player[];
  currentPlayerIndex: number;
  dartsThrown: number;
  currentTurnScore: number;
  checkout?: string | null;
  legScores?: number[];
  setScores?: number[];
  gameStats?: Record<string, PlayerStats>;
  showStats?: boolean;
}

export const ScoreDisplay: React.FC<ScoreDisplayProps> = ({
  players,
  currentPlayerIndex,
  dartsThrown,
  currentTurnScore,
  checkout = null,
  legScores = [],
  setScores = [],
  gameStats = {},
  showStats = false,
}) => {
  const currentPlayer = players[currentPlayerIndex];

  return (
    <div className="score-display">
      {/* Players */}
      <div className="score-display__players">
        {players.map((player, index) => {
          const isActive = index === currentPlayerIndex;
          const stats = gameStats[player.id];

          return (
            <div
              key={player.id}
              className={`score-display__player ${isActive ? 'score-display__player--active' : ''}`}
            >
              <div className="score-display__player-header">
                <span className="score-display__flag">{player.flag}</span>
                <span className="score-display__name">{player.name}</span>
                {player.isAI && (
                  <span className="score-display__ai-badge">AI</span>
                )}
              </div>

              <div className="score-display__score">{player.score}</div>

              {/* Leg/Set scores */}
              {(legScores.length > 0 || setScores.length > 0) && (
                <div className="score-display__match-score">
                  <span className="score-display__legs">
                    Legs: {legScores[index] || 0}
                  </span>
                  {setScores.length > 0 && (
                    <span className="score-display__sets">
                      Sets: {setScores[index] || 0}
                    </span>
                  )}
                </div>
              )}

              {/* Stats */}
              {showStats && stats && (
                <div className="score-display__stats">
                  <div className="score-display__stat">
                    <span className="score-display__stat-label">Avg</span>
                    <span className="score-display__stat-value">
                      {stats.dartsThrown > 0
                        ? ((stats.totalScore / stats.dartsThrown) * 3).toFixed(1)
                        : '0.0'}
                    </span>
                  </div>
                  <div className="score-display__stat">
                    <span className="score-display__stat-label">High</span>
                    <span className="score-display__stat-value">
                      {stats.highest3DartScore}
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Current turn info */}
      <div className="score-display__turn-info">
        <div className="score-display__darts">
          <span className="score-display__darts-label">Darts</span>
          <div className="score-display__darts-indicators">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={`score-display__dart-indicator ${
                  i < dartsThrown ? 'score-display__dart-indicator--thrown' : ''
                }`}
              />
            ))}
          </div>
        </div>

        <div className="score-display__turn-score">
          <span className="score-display__turn-score-label">Turn</span>
          <span className="score-display__turn-score-value">
            {currentTurnScore}
          </span>
        </div>
      </div>

      {/* Checkout suggestion */}
      {checkout && currentPlayer && currentPlayer.score <= 170 && (
        <div className="score-display__checkout">
          <span className="score-display__checkout-label">Checkout</span>
          <span className="score-display__checkout-route">{checkout}</span>
        </div>
      )}
    </div>
  );
};

export default ScoreDisplay;
