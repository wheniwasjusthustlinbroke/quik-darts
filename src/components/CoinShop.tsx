/**
 * Coin Shop Modal
 *
 * Displays coin packages for purchase via Stripe.
 */

import { useState, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getFirebaseFunctions, getFirebaseAuth } from '../services/firebase';
import { CoinIcon, CloseIcon } from './icons';
import './CoinShop.css';

/** Coin package definition */
interface CoinPackage {
  id: string;
  coins: number;
  price: string;
  popular: boolean;
}

/** Available coin packages */
const COIN_PACKAGES: CoinPackage[] = [
  { id: 'starter', coins: 500, price: '$0.99', popular: false },
  { id: 'popular', coins: 1200, price: '$1.99', popular: true },
  { id: 'best_value', coins: 3500, price: '$4.99', popular: false },
  { id: 'pro', coins: 8000, price: '$9.99', popular: false },
  { id: 'champion', coins: 20000, price: '$19.99', popular: false },
];

/** Format large numbers with commas */
function formatCoins(num: number): string {
  return num.toLocaleString();
}

interface CoinShopProps {
  coinBalance: number;
  onClose: () => void;
}

export function CoinShop({ coinBalance, onClose }: CoinShopProps) {
  const [isPurchasing, setIsPurchasing] = useState(false);

  // Handle package purchase
  const handlePurchase = useCallback(async (packageId: string) => {
    const functions = getFirebaseFunctions();
    const auth = getFirebaseAuth();

    if (!functions || !auth) {
      console.error('Firebase not initialized');
      return;
    }

    const user = auth.currentUser;
    if (!user || user.isAnonymous) {
      console.log('User must be signed in to purchase');
      return;
    }

    if (isPurchasing) return;

    setIsPurchasing(true);
    try {
      const createCheckout = httpsCallable(functions, 'createStripeCheckout');
      const result = await createCheckout({
        packageId,
        successUrl: window.location.origin + '?purchase=success',
        cancelUrl: window.location.origin + '?purchase=cancelled',
      });

      const data = result.data as { success: boolean; url?: string };
      if (data.success && data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        console.error('Failed to start checkout');
      }
    } catch (error: any) {
      console.error('Purchase error:', error.message);
    } finally {
      setIsPurchasing(false);
    }
  }, [isPurchasing]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }, [onClose]);

  return (
    <div className="coin-shop-overlay" onClick={handleBackdropClick}>
      <div className="coin-shop">
        {/* Close button */}
        <button className="coin-shop__close" onClick={onClose}>
          <CloseIcon size={24} />
        </button>

        {/* Header */}
        <div className="coin-shop__header">
          <h2 className="coin-shop__title">Coin Shop</h2>
          <div className="coin-shop__balance">
            <CoinIcon size={20} />
            <span>Your Balance: {formatCoins(coinBalance)}</span>
          </div>
          <p className="coin-shop__subtitle">
            Purchase coins to play wagered matches!
          </p>
        </div>

        {/* Packages */}
        <div className="coin-shop__packages">
          {COIN_PACKAGES.map((pkg) => (
            <button
              key={pkg.id}
              className={`coin-package ${pkg.popular ? 'coin-package--popular' : ''}`}
              onClick={() => handlePurchase(pkg.id)}
              disabled={isPurchasing}
            >
              {pkg.popular && (
                <span className="coin-package__badge">POPULAR</span>
              )}
              <div className="coin-package__coins">
                <CoinIcon size={24} />
                <span>{formatCoins(pkg.coins)}</span>
              </div>
              <span className="coin-package__price">{pkg.price}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <p className="coin-shop__footer">
          Secure payment via Stripe. Coins are non-refundable.
        </p>
      </div>
    </div>
  );
}

export default CoinShop;
