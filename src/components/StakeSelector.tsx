/**
 * StakeSelector Component
 *
 * Modal for selecting stake amount in wagered matches.
 * Matches index.html lines 6496-6690 for parity.
 */

import React from 'react';
import { CloseIcon, CoinIcon, GlobeIcon } from './icons';

interface StakeSelectorProps {
  coinBalance: number;
  selectedStake: number;
  onSelectStake: (amount: number) => void;
  onConfirm: () => void;
  onPlayFree: () => void;
  onClose: () => void;
  isLoading?: boolean;
}

const STAKE_OPTIONS = [
  { amount: 50, label: 'Casual', description: 'Low stakes, perfect for warming up' },
  { amount: 100, label: 'Standard', description: 'The most popular stake level' },
  { amount: 500, label: 'High Roller', description: 'For confident players' },
  { amount: 2500, label: 'Champion', description: 'Maximum risk, maximum reward' },
];

// Format large numbers (matches CoinDisplay)
function formatCoins(num: number): string {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  }
  return num.toString();
}

export function StakeSelector({
  coinBalance,
  selectedStake,
  onSelectStake,
  onConfirm,
  onPlayFree,
  onClose,
  isLoading = false,
}: StakeSelectorProps) {
  const canAffordSelected = coinBalance >= selectedStake;

  return (
    <div className="stake-selector-overlay" onClick={onClose}>
      <div className="stake-selector" onClick={(e) => e.stopPropagation()}>
        <button className="stake-selector__close" onClick={onClose}>
          <CloseIcon size={24} />
        </button>

        <div className="stake-selector__header">
          <h2 className="stake-selector__title">Choose Your Stake</h2>
          <div className="stake-selector__balance">
            <CoinIcon size={20} />
            <span>Your Balance: {formatCoins(coinBalance)}</span>
          </div>
          <p className="stake-selector__subtitle">Winner takes the entire pot!</p>
        </div>

        <div className="stake-selector__options">
          {STAKE_OPTIONS.map((option) => {
            const isSelected = selectedStake === option.amount;
            const canAfford = coinBalance >= option.amount;
            const potAmount = option.amount * 2;

            return (
              <button
                key={option.amount}
                className={`stake-option ${isSelected ? 'stake-option--selected' : ''} ${!canAfford ? 'stake-option--disabled' : ''}`}
                onClick={() => canAfford && onSelectStake(option.amount)}
                disabled={!canAfford}
              >
                <div className="stake-option__left">
                  <div className="stake-option__label-row">
                    <span className="stake-option__label">{option.label}</span>
                    {!canAfford && (
                      <span className="stake-option__need-more">
                        Need {option.amount - coinBalance} more
                      </span>
                    )}
                  </div>
                  <p className="stake-option__description">{option.description}</p>
                </div>
                <div className="stake-option__right">
                  <div className="stake-option__amount">
                    <CoinIcon size={14} />
                    <span>{formatCoins(option.amount)}</span>
                  </div>
                  <p className="stake-option__win">Win {formatCoins(potAmount)}</p>
                </div>
              </button>
            );
          })}
        </div>

        <div className="stake-selector__actions">
          <button
            className="btn btn-primary stake-selector__confirm"
            onClick={onConfirm}
            disabled={!canAffordSelected || isLoading}
          >
            <GlobeIcon size={20} />
            {isLoading ? 'Creating...' : `Play for ${formatCoins(selectedStake)} Coins`}
          </button>
          <button
            className="btn btn-ghost stake-selector__free"
            onClick={onPlayFree}
            disabled={isLoading}
          >
            Play Free Instead
          </button>
        </div>
      </div>
    </div>
  );
}

export default StakeSelector;
