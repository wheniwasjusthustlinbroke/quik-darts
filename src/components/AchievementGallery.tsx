/**
 * Achievement Gallery
 *
 * Displays all achievements grouped by category/chain,
 * with progress tracking and weekly challenge display.
 */

import { useMemo } from 'react';
import {
  ACHIEVEMENTS,
  getAchievementProgress,
} from '../services/achievements';
import { useWeeklyChallenge } from '../hooks';
import type {
  AchievementDefinition,
  AchievementsState,
  AchievementRarity,
} from '../services/achievements/types';
import './AchievementGallery.css';

interface AchievementGalleryProps {
  achievementsState: AchievementsState;
  onClose: () => void;
}

/** Group achievements by chain or category */
interface AchievementGroup {
  id: string;
  name: string;
  icon: string;
  achievements: AchievementDefinition[];
}

/** Rarity display info */
const RARITY_INFO: Record<AchievementRarity, { label: string; order: number }> = {
  common: { label: 'Common', order: 1 },
  uncommon: { label: 'Uncommon', order: 2 },
  rare: { label: 'Rare', order: 3 },
  epic: { label: 'Epic', order: 4 },
  legendary: { label: 'Legendary', order: 5 },
  mythic: { label: 'Mythic', order: 6 },
};

/** Chain display names */
const CHAIN_NAMES: Record<string, { name: string; icon: string }> = {
  maximum: { name: 'Maximum!', icon: '💯' },
  bullseye: { name: 'Bullseye!', icon: '🎯' },
  checkout: { name: 'Checkout', icon: '✅' },
  triple: { name: 'Triple', icon: '3️⃣' },
  victory: { name: 'Victory', icon: '🏆' },
  perfect9: { name: 'Perfect 9', icon: '👑' },
  global: { name: 'Global', icon: '🌍' },
  highstakes: { name: 'High Stakes', icon: '💰' },
  profit: { name: 'Profit', icon: '📈' },
  dedicated: { name: 'Dedicated', icon: '🔥' },
};

/** Group achievements by chain */
function groupAchievements(achievements: AchievementDefinition[]): AchievementGroup[] {
  const groups = new Map<string, AchievementDefinition[]>();
  const standalone: AchievementDefinition[] = [];

  for (const achievement of achievements) {
    if (achievement.chain) {
      const existing = groups.get(achievement.chain) || [];
      existing.push(achievement);
      groups.set(achievement.chain, existing);
    } else {
      standalone.push(achievement);
    }
  }

  const result: AchievementGroup[] = [];

  // Add chain groups (sorted by tier)
  for (const [chainId, chainAchievements] of groups) {
    const chainInfo = CHAIN_NAMES[chainId] || { name: chainId, icon: '🎖️' };
    result.push({
      id: chainId,
      name: chainInfo.name,
      icon: chainInfo.icon,
      achievements: chainAchievements.sort((a, b) => (a.tier || 0) - (b.tier || 0)),
    });
  }

  // Add standalone achievements
  if (standalone.length > 0) {
    result.push({
      id: 'standalone',
      name: 'Special',
      icon: '⭐',
      achievements: standalone,
    });
  }

  return result;
}

/** Calculate stats summary */
function calculateStats(
  achievements: AchievementDefinition[],
  unlockedIds: Set<string>
): { total: number; unlocked: number; byRarity: Record<AchievementRarity, { total: number; unlocked: number }> } {
  const byRarity: Record<AchievementRarity, { total: number; unlocked: number }> = {
    common: { total: 0, unlocked: 0 },
    uncommon: { total: 0, unlocked: 0 },
    rare: { total: 0, unlocked: 0 },
    epic: { total: 0, unlocked: 0 },
    legendary: { total: 0, unlocked: 0 },
    mythic: { total: 0, unlocked: 0 },
  };

  let total = 0;
  let unlocked = 0;

  for (const achievement of achievements) {
    total++;
    byRarity[achievement.rarity].total++;

    if (unlockedIds.has(achievement.id)) {
      unlocked++;
      byRarity[achievement.rarity].unlocked++;
    }
  }

  return { total, unlocked, byRarity };
}

export function AchievementGallery({
  achievementsState,
  onClose,
}: AchievementGalleryProps) {
  const { unlockedIds, stats } = achievementsState;

  // Group achievements
  const groups = useMemo(() => groupAchievements(ACHIEVEMENTS), []);

  // Calculate stats
  const statsSummary = useMemo(
    () => calculateStats(ACHIEVEMENTS, unlockedIds),
    [unlockedIds]
  );

  // Get active weekly challenge with countdown timer
  const { challenge: activeChallenge, progress: weeklyProgress, completed: weeklyCompleted, timeRemaining } = useWeeklyChallenge();

  return (
    <div className="achievement-gallery">
      <div className="achievement-gallery__header">
        <button className="achievement-gallery__close" onClick={onClose}>
          ← Back
        </button>
        <h1 className="achievement-gallery__title">Achievements</h1>
        <div className="achievement-gallery__summary">
          {statsSummary.unlocked} / {statsSummary.total}
        </div>
      </div>

      <div className="achievement-gallery__content">
        {/* Weekly Challenge Card */}
        <div className="weekly-challenge-card">
          <div className="weekly-challenge-card__header">
            <span className="weekly-challenge-card__icon">{activeChallenge.icon}</span>
            <div className="weekly-challenge-card__info">
              <div className="weekly-challenge-card__label">Weekly Challenge</div>
              <div className="weekly-challenge-card__name">{activeChallenge.name}</div>
            </div>
            <div className="weekly-challenge-card__timer">{timeRemaining}</div>
            {weeklyCompleted && (
              <span className="weekly-challenge-card__complete">✓</span>
            )}
          </div>
          <div className="weekly-challenge-card__description">
            {activeChallenge.description}
          </div>
          {weeklyProgress && (
            <div className="weekly-challenge-card__progress">
              <div className="progress-bar">
                <div
                  className="progress-bar__fill"
                  style={{ width: `${weeklyProgress.percentage}%` }}
                />
              </div>
              <div className="progress-bar__text">
                {weeklyProgress.current} / {weeklyProgress.target}
              </div>
            </div>
          )}
        </div>

        {/* Stats Breakdown */}
        <div className="stats-breakdown">
          {Object.entries(RARITY_INFO)
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([rarity, info]) => {
              const rarityStats = statsSummary.byRarity[rarity as AchievementRarity];
              if (rarityStats.total === 0) return null;
              return (
                <div
                  key={rarity}
                  className={`stats-breakdown__item stats-breakdown__item--${rarity}`}
                >
                  <span className="stats-breakdown__label">{info.label}</span>
                  <span className="stats-breakdown__count">
                    {rarityStats.unlocked}/{rarityStats.total}
                  </span>
                </div>
              );
            })}
        </div>

        {/* Achievement Groups */}
        {groups.map((group) => (
          <div key={group.id} className="achievement-group">
            <div className="achievement-group__header">
              <span className="achievement-group__icon">{group.icon}</span>
              <span className="achievement-group__name">{group.name}</span>
            </div>
            <div className="achievement-group__list">
              {group.achievements.map((achievement) => {
                const isUnlocked = unlockedIds.has(achievement.id);
                const progress = !isUnlocked
                  ? getAchievementProgress(achievement.id, stats)
                  : null;

                return (
                  <AchievementCard
                    key={achievement.id}
                    achievement={achievement}
                    isUnlocked={isUnlocked}
                    progress={progress}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Individual achievement card */
interface AchievementCardProps {
  achievement: AchievementDefinition;
  isUnlocked: boolean;
  progress: { current: number; target: number; percentage: number } | null;
}

function AchievementCard({ achievement, isUnlocked, progress }: AchievementCardProps) {
  return (
    <div
      className={`achievement-card achievement-card--${achievement.rarity} ${
        isUnlocked ? 'achievement-card--unlocked' : 'achievement-card--locked'
      }`}
    >
      <div className="achievement-card__icon">
        {isUnlocked ? achievement.icon : '🔒'}
      </div>
      <div className="achievement-card__content">
        <div className="achievement-card__name">{achievement.name}</div>
        <div className="achievement-card__description">
          {isUnlocked ? achievement.description : '???'}
        </div>
        {!isUnlocked && progress && (
          <div className="achievement-card__progress">
            <div className="progress-bar progress-bar--small">
              <div
                className="progress-bar__fill"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            <span className="progress-bar__text">
              {progress.current}/{progress.target}
            </span>
          </div>
        )}
      </div>
      <div className={`achievement-card__rarity achievement-card__rarity--${achievement.rarity}`}>
        {RARITY_INFO[achievement.rarity].label}
      </div>
    </div>
  );
}

export default AchievementGallery;
