/**
 * CoinDisplay Component
 *
 * Displays user's coin balance with optional daily bonus badge.
 * Read-only display - claim functionality added in PR 4.2.
 */

import React from 'react';

interface CoinDisplayProps {
  coinBalance: number;
  dailyBonusAvailable?: boolean;
  isLoading?: boolean;
}

// Format large numbers (matches index.html formatCoins)
function formatCoins(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

export function CoinDisplay({ coinBalance, dailyBonusAvailable, isLoading }: CoinDisplayProps) {
  if (isLoading) {
    return (
      <div className="coin-display coin-display--loading">
        <span className="coin-display__balance">...</span>
      </div>
    );
  }

  return (
    <div className="coin-display">
      <div className="coin-display__balance-container">
        <img
          src="/assets/coin-chip.png"
          alt="Coins"
          className="coin-display__icon"
          width={16}
          height={16}
        />
        <span className="coin-display__balance">{formatCoins(coinBalance)}</span>
      </div>

      {dailyBonusAvailable && (
        <button
          className="coin-display__bonus-badge"
          disabled
          title="Daily bonus available (coming soon)"
        >
          +50 Free!
        </button>
      )}
    </div>
  );
}

export default CoinDisplay;
