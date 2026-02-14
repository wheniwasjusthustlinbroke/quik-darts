import React from 'react';
import { CoinDisplay } from '../CoinDisplay';
import { SoundToggle } from '../SoundToggle';
import { TargetIcon } from '../icons';
import homeBgWebp from '@/assets/backgrounds/home-bg-fantasy.webp';
import './HomePage.css';

interface HomePageProps {
  // === User / Auth ===
  user: {
    displayName?: string | null;
    photoURL?: string | null;
    uid?: string;
  } | null;
  isAnonymous: boolean;
  authLoading: boolean;
  signInWithGoogle: () => void;
  signInWithFacebook: () => void;
  signInWithApple: () => void;
  signOut: () => void;

  // === Wallet ===
  coinBalance: number;
  dailyBonusAvailable: boolean;
  walletLoading: boolean;
  isClaimingBonus: boolean;
  onClaimBonus: () => void;
  onOpenShop: () => void;

  // === Sound / Theme ===
  soundEnabled: boolean;
  onSoundToggle: (enabled: boolean) => void;
  onOpenThemeSelector: () => void;

  // === Navigation ===
  onOpenProfile: () => void;

  // === Play Online ===
  isSearching: boolean;
  isCreatingEscrow: boolean;
  errorText: string | null;
  onPlayOnline: () => void;

  // === Play Modes ===
  onPlayAI: () => void;
  onPractice: () => void;

  // === Toast ===
  onShowToast: (message: string) => void;

  // === Profile (edited nickname from RTDB) ===
  profileDisplayName?: string;
}

const HomePage: React.FC<HomePageProps> = ({
  user,
  isAnonymous,
  authLoading,
  signInWithGoogle,
  signInWithFacebook,
  signInWithApple,
  signOut,
  coinBalance,
  dailyBonusAvailable,
  walletLoading,
  isClaimingBonus,
  onClaimBonus,
  onOpenShop,
  soundEnabled,
  onSoundToggle,
  onOpenThemeSelector,
  onOpenProfile,
  isSearching,
  isCreatingEscrow,
  errorText,
  onPlayOnline,
  onPlayAI,
  onPractice,
  onShowToast,
  profileDisplayName,
}) => {
  const handleComingSoon = (feature: string) => {
    onShowToast(`${feature} - Coming Soon!`);
  };

  const toastFriends = () => handleComingSoon('Play Friends');
  const toastDartSets = () => handleComingSoon('Dart Sets');

  const getPlayOnlineSubtitle = () => {
    if (isCreatingEscrow) return 'Creating match...';
    if (isSearching) return 'Searching... (tap to cancel)';
    if (errorText) return errorText;
    return '⚡ — playing';
  };

  return (
    <div
      className="home"
      style={{ '--home-bg-url': `url(${homeBgWebp})` } as React.CSSProperties}
    >
      <div className="home__content">
        <header className="home__topbar">
          <div className="topbar">
            <div className="topbar__profile">
              <button type="button" className="topbar__avatar-btn" onClick={onOpenProfile} title="Profile">
                <div className="topbar__avatar">
                  {user?.photoURL ? (
                    <img src={user.photoURL} alt="" className="topbar__avatar-img" />
                  ) : (
                    <div className="topbar__avatar-fallback" />
                  )}
                </div>
              </button>
              <span className="topbar__name">
                {profileDisplayName || 'Player'}
                {isAnonymous && <span className="topbar__guest-badge">Guest</span>}
              </span>
            </div>

            <div className="topbar__right">
              <CoinDisplay
                coinBalance={coinBalance}
                dailyBonusAvailable={dailyBonusAvailable}
                isLoading={walletLoading}
                isClaimingBonus={isClaimingBonus}
                onClaimBonus={onClaimBonus}
                onOpenShop={onOpenShop}
              />
              <button type="button" className="topbar__icon-btn" onClick={onOpenThemeSelector} title="Theme">
                <TargetIcon size={20} />
              </button>
            </div>
          </div>
        </header>

        {user && !isAnonymous && (
          <div className="home__user-row">
            <span className="home__user-id">ID: {user.uid?.slice(0, 8)}</span>
            <button type="button" className="home__signout-btn" onClick={signOut}>Sign Out</button>
          </div>
        )}

        {(!user || isAnonymous) && (
          <div className="home__auth">
            <p className="home__auth-prompt">
              {isAnonymous ? 'Sign in to save progress' : 'Sign in to play online & save progress'}
            </p>
            <div className="home__auth-buttons">
              <button type="button" className="home__auth-btn home__auth-btn--google" onClick={signInWithGoogle} disabled={authLoading}>
                <svg viewBox="0 0 24 24" width="18" height="18">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>
              <button type="button" className="home__auth-btn home__auth-btn--facebook" onClick={signInWithFacebook} disabled={authLoading}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="#1877F2">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Facebook
              </button>
              <button type="button" className="home__auth-btn home__auth-btn--apple" onClick={signInWithApple} disabled={authLoading}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Apple
              </button>
            </div>
          </div>
        )}

        <main className="home__main">
          <div className="home__center">
            <div className="logo">
              <h1 className="logo__text">QUIK DARTS</h1>
            </div>

            <div className="play-grid">
              <button type="button" className="play-card play-card--online" onClick={onPlayOnline}>
                <span className="play-card__icon">🌐</span>
                <span className="play-card__title">PLAY ONLINE</span>
                <span className="play-card__subtitle">{getPlayOnlineSubtitle()}</span>
              </button>

              <button type="button" className="play-card play-card--friends" onClick={toastFriends}>
                <span className="play-card__icon">👥</span>
                <span className="play-card__title">PLAY FRIENDS</span>
                <span className="play-card__subtitle">Invite →</span>
              </button>

              <button type="button" className="play-card play-card--ai" onClick={onPlayAI}>
                <span className="play-card__icon">🤖</span>
                <span className="play-card__title">PLAY AI</span>
                <span className="play-card__subtitle">Easy - Expert</span>
              </button>

              <button type="button" className="play-card play-card--practice" onClick={onPractice}>
                <span className="play-card__icon">🎯</span>
                <span className="play-card__title">PRACTICE</span>
                <span className="play-card__subtitle">Solo Mode</span>
              </button>

              <button type="button" className="play-card play-card--shop" onClick={onOpenShop}>
                <span className="play-card__icon">🛒</span>
                <span className="play-card__title">SHOP</span>
                <span className="play-card__subtitle">Dart Gear</span>
              </button>

              <button type="button" className="play-card play-card--dartsets" onClick={toastDartSets}>
                <span className="play-card__badge">NEW!</span>
                <span className="play-card__icon">🎯</span>
                <span className="play-card__title">DART SETS</span>
                <span className="play-card__subtitle">Collect</span>
              </button>
            </div>
          </div>
        </main>

        <footer className="home__bottom">
          <div className="home__bottom-left">
            <SoundToggle enabled={soundEnabled} onToggle={onSoundToggle} />
          </div>
        </footer>
      </div>
    </div>
  );
};

export default HomePage;
