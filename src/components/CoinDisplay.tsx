/**
 * CoinDisplay Component
 *
 * Displays user's coin balance with optional daily bonus badge.
 * Read-only display - claim functionality added in PR 4.2.
 */

interface CoinDisplayProps {
  coinBalance: number;
  dailyBonusAvailable?: boolean;
  isLoading?: boolean;
  isClaimingBonus?: boolean;
  onClaimBonus?: () => void;
  onOpenShop?: () => void;
}

// Format coins with comma separators for readability (exact numbers)
function formatCoins(num: number): string {
  return num.toLocaleString();
}

export function CoinDisplay({ coinBalance, dailyBonusAvailable, isLoading, isClaimingBonus, onClaimBonus, onOpenShop }: CoinDisplayProps) {
  if (isLoading) {
    return (
      <div className="coin-display coin-display--loading">
        <span className="coin-display__balance">...</span>
      </div>
    );
  }

  return (
    <div className="coin-display">
      <button
        className="coin-display__balance-container"
        onClick={onOpenShop}
        title="Open Coin Shop"
      >
        <img
          src="/assets/coin-chip.png"
          alt="Coins"
          className="coin-display__icon"
          width={16}
          height={16}
        />
        <span className="coin-display__balance">{formatCoins(coinBalance)}</span>
      </button>

      {dailyBonusAvailable && (
        <button
          className="coin-display__bonus-badge"
          disabled={isClaimingBonus || !onClaimBonus}
          onClick={onClaimBonus}
          title="Claim daily bonus"
        >
          {isClaimingBonus ? '...' : '+50 Free!'}
        </button>
      )}
    </div>
  );
}

export default CoinDisplay;
