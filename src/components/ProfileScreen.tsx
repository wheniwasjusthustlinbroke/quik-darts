/**
 * Profile Screen
 *
 * Displays user profile with avatar, level, XP progress,
 * stats, streaks, and editable nickname.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  useProfile,
  getXPForLevel,
  getRankTitle,
} from '../hooks/useProfile';
import { useWallet } from '../hooks/useWallet';
import { useAuth } from '../hooks';
import { CoinIcon } from './icons';
import './ProfileScreen.css';

/** Format large numbers with commas */
function formatNumber(num: number): string {
  return num.toLocaleString();
}

interface ProfileScreenProps {
  onClose: () => void;
}

export function ProfileScreen({
  onClose,
}: ProfileScreenProps) {
  const { user } = useAuth();
  const { userProfile, userProgression, userStreaks, isSavingNickname, saveNickname } = useProfile();
  const { coinBalance } = useWallet();

  // Nickname editing state
  const [isEditingNickname, setIsEditingNickname] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameError, setNicknameError] = useState<string | null>(null);

  // Calculate level progress
  const level = userProgression?.level || 1;
  const xp = userProgression?.xp || 0;
  const currentLevelXP = getXPForLevel(level);
  const nextLevelXP = getXPForLevel(level + 1);
  const xpProgress = nextLevelXP > currentLevelXP
    ? (xp - currentLevelXP) / (nextLevelXP - currentLevelXP)
    : 1;

  // Stats
  const gamesPlayed = userProgression?.gamesPlayed || 0;
  const gamesWon = userProgression?.gamesWon || 0;
  const winPercentage = gamesPlayed > 0
    ? ((gamesWon / gamesPlayed) * 100).toFixed(1)
    : '0.0';

  // Streaks
  const currentStreak = userStreaks?.currentWinStreak || 0;
  const bestStreak = userStreaks?.bestWinStreak || 0;

  // Rank
  const rankTitle = getRankTitle(level);

  // Display name
  const displayName = userProfile?.displayName || user?.displayName || 'Player';

  // Avatar initial
  const avatarInitial = useMemo(() => {
    return displayName[0]?.toUpperCase() || 'P';
  }, [displayName]);

  // Start editing nickname
  const handleStartEdit = useCallback(() => {
    setNicknameInput(displayName);
    setIsEditingNickname(true);
    setNicknameError(null);
  }, [displayName]);

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    setIsEditingNickname(false);
    setNicknameInput('');
    setNicknameError(null);
  }, []);

  // Save nickname
  const handleSaveNickname = useCallback(async () => {
    const trimmed = nicknameInput.trim();
    if (trimmed.length < 1 || trimmed.length > 20) return;

    const result = await saveNickname(trimmed);
    if (result.success) {
      setIsEditingNickname(false);
      setNicknameInput('');
      setNicknameError(null);
    } else {
      setNicknameError(result.error);
    }
  }, [nicknameInput, saveNickname]);

  // Copy unique ID
  const handleCopyId = useCallback(() => {
    const uniqueId = userProfile?.uniqueId || 'N/A';
    navigator.clipboard.writeText(uniqueId).then(() => {
      console.log('Player ID copied to clipboard');
    }).catch(() => {
      console.log('Failed to copy ID');
    });
  }, [userProfile?.uniqueId]);

  // Handle keyboard in nickname input
  const handleNicknameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSaveNickname();
    if (e.key === 'Escape') handleCancelEdit();
  }, [handleSaveNickname, handleCancelEdit]);

  return (
    <div className="profile-screen">
      {/* Background gradient */}
      <div className="profile-screen__bg" />

      <div className="profile-screen__container">
        {/* Header */}
        <div className="profile-screen__header">
          <h1 className="profile-screen__title">Profile</h1>
          <button className="btn btn-ghost" onClick={onClose}>
            Back
          </button>
        </div>

        {/* Main content - two columns */}
        <div className="profile-screen__content">
          {/* Left column - Avatar and basic info */}
          <div className="profile-card">
            {/* Avatar with level badge */}
            <div className="profile-card__avatar-wrapper">
              {user?.photoURL ? (
                <img
                  src={user.photoURL}
                  alt="Profile"
                  className="profile-card__avatar-img"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="profile-card__avatar-initial">
                  {avatarInitial}
                </div>
              )}
              <div className="profile-card__level-badge">{level}</div>
            </div>

            {/* Display name */}
            {isEditingNickname ? (
              <div className="profile-card__nickname-edit">
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value.slice(0, 20))}
                  placeholder="Enter nickname..."
                  maxLength={20}
                  autoFocus
                  className="profile-card__nickname-input"
                  onKeyDown={handleNicknameKeyDown}
                />
                <div className="profile-card__nickname-actions">
                  <button
                    onClick={handleSaveNickname}
                    disabled={isSavingNickname}
                    className="profile-card__save-btn"
                  >
                    {isSavingNickname ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="profile-card__cancel-btn"
                  >
                    Cancel
                  </button>
                </div>
                {nicknameError && (
                  <span className="profile-card__nickname-error">{nicknameError}</span>
                )}
              </div>
            ) : (
              <div className="profile-card__name-row">
                <h2 className="profile-card__name">{displayName}</h2>
                <button
                  onClick={handleStartEdit}
                  className="profile-card__edit-btn"
                  title="Edit display name"
                >
                  ✏️
                </button>
              </div>
            )}

            {/* Flag and rank */}
            <div className="profile-card__rank">
              {userProfile?.flag || '🌍'} {rankTitle}
            </div>

            {/* Unique ID */}
            <div className="profile-card__id-box">
              <div className="profile-card__id-label">Player ID</div>
              <div className="profile-card__id-row">
                <span className="profile-card__id-value">
                  {userProfile?.uniqueId || 'N/A'}
                </span>
                <button
                  onClick={handleCopyId}
                  className="profile-card__copy-btn"
                  title="Copy ID"
                >
                  📋
                </button>
              </div>
            </div>

            {/* Coin balance */}
            <div className="profile-card__coins">
              <CoinIcon size={20} />
              <span className="profile-card__coins-value">
                {formatNumber(coinBalance)}
              </span>
            </div>
          </div>

          {/* Right column - Stats */}
          <div className="profile-stats">
            {/* Level Progress */}
            <div className="stats-card">
              <div className="stats-card__header">
                <span className="stats-card__label">Level Progress</span>
                <span className="stats-card__value-accent">Level {level}</span>
              </div>
              <div className="progress-bar progress-bar--large">
                <div
                  className="progress-bar__fill progress-bar__fill--accent"
                  style={{ width: `${xpProgress * 100}%` }}
                />
              </div>
              <div className="stats-card__footer">
                <span>{formatNumber(xp)} XP</span>
                <span>{formatNumber(nextLevelXP)} XP</span>
              </div>
            </div>

            {/* Player Stats Grid */}
            <div className="stats-card">
              <h3 className="stats-card__title">Player Stats</h3>
              <div className="stats-grid">
                <div className="stats-grid__item">
                  <div className="stats-grid__label">Games Played</div>
                  <div className="stats-grid__value">{gamesPlayed}</div>
                </div>
                <div className="stats-grid__item">
                  <div className="stats-grid__label">Games Won</div>
                  <div className="stats-grid__value stats-grid__value--success">{gamesWon}</div>
                </div>
                <div className="stats-grid__item">
                  <div className="stats-grid__label">Win Rate</div>
                  <div className="stats-grid__value stats-grid__value--accent">{winPercentage}%</div>
                </div>
                <div className="stats-grid__item">
                  <div className="stats-grid__label">Total Coins</div>
                  <div className="stats-grid__value stats-grid__value--accent">{formatNumber(coinBalance)}</div>
                </div>
              </div>
            </div>

            {/* Streaks */}
            <div className="stats-card">
              <h3 className="stats-card__title">Win Streaks</h3>
              <div className="stats-grid stats-grid--half">
                <div className="stats-grid__item">
                  <div className="stats-grid__label">Current Streak</div>
                  <div className={`stats-grid__value ${currentStreak > 0 ? 'stats-grid__value--success' : ''}`}>
                    {currentStreak} {currentStreak > 0 && '🔥'}
                  </div>
                </div>
                <div className="stats-grid__item">
                  <div className="stats-grid__label">Best Streak</div>
                  <div className="stats-grid__value stats-grid__value--accent">
                    {bestStreak} 🏆
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

export default ProfileScreen;
