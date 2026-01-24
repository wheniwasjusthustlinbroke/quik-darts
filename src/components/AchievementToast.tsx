/**
 * Achievement Toast Notification
 *
 * Displays achievement unlock notifications with auto-dismiss.
 * Stacks multiple unlocks and animates in/out.
 */

import { useEffect, useState, useCallback } from 'react';
import { ACHIEVEMENTS_BY_ID } from '../services/achievements/definitions';
import type { AchievementRarity } from '../services/achievements/types';
import './AchievementToast.css';

interface ToastItem {
  id: string;
  achievementId: string;
  name: string;
  icon: string;
  rarity: AchievementRarity;
  exiting: boolean;
}

interface AchievementToastProps {
  /** Achievement IDs to display (when this changes, new toasts appear) */
  unlockedIds: string[];
  /** Called when all toasts have been dismissed */
  onDismissed?: () => void;
  /** Auto-dismiss delay in ms (default: 4000) */
  dismissDelay?: number;
}

/** Get rarity display label */
function getRarityLabel(rarity: AchievementRarity): string {
  const labels: Record<AchievementRarity, string> = {
    common: 'Common',
    uncommon: 'Uncommon',
    rare: 'Rare',
    epic: 'Epic',
    legendary: 'Legendary',
    mythic: 'Mythic',
  };
  return labels[rarity];
}

export function AchievementToast({
  unlockedIds,
  onDismissed,
  dismissDelay = 4000,
}: AchievementToastProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  // Add new toasts when unlockedIds changes
  useEffect(() => {
    const newIds = unlockedIds.filter((id) => !processedIds.has(id));
    if (newIds.length === 0) return;

    const newToasts: ToastItem[] = [];
    for (const achievementId of newIds) {
      const achievement = ACHIEVEMENTS_BY_ID.get(achievementId);
      if (!achievement) continue;

      newToasts.push({
        id: `${achievementId}-${Date.now()}`,
        achievementId,
        name: achievement.name,
        icon: achievement.icon,
        rarity: achievement.rarity,
        exiting: false,
      });
    }

    if (newToasts.length > 0) {
      setToasts((prev) => [...prev, ...newToasts]);
      setProcessedIds((prev) => {
        const next = new Set(prev);
        newIds.forEach((id) => next.add(id));
        return next;
      });
    }
  }, [unlockedIds, processedIds]);

  // Auto-dismiss toasts
  useEffect(() => {
    if (toasts.length === 0) return;

    const timers: NodeJS.Timeout[] = [];

    toasts.forEach((toast, index) => {
      if (toast.exiting) return;

      // Stagger dismissal for visual effect
      const delay = dismissDelay + index * 300;

      const timer = setTimeout(() => {
        // Start exit animation
        setToasts((prev) =>
          prev.map((t) => (t.id === toast.id ? { ...t, exiting: true } : t))
        );

        // Remove after animation
        setTimeout(() => {
          setToasts((prev) => prev.filter((t) => t.id !== toast.id));
        }, 300);
      }, delay);

      timers.push(timer);
    });

    return () => {
      timers.forEach(clearTimeout);
    };
  }, [toasts, dismissDelay]);

  // Notify when all toasts dismissed
  useEffect(() => {
    if (toasts.length === 0 && processedIds.size > 0) {
      onDismissed?.();
    }
  }, [toasts.length, processedIds.size, onDismissed]);

  // Manual dismiss
  const handleDismiss = useCallback((toastId: string) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === toastId ? { ...t, exiting: true } : t))
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toastId));
    }, 300);
  }, []);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="achievement-toast-container">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`achievement-toast achievement-toast--${toast.rarity} ${
            toast.exiting ? 'achievement-toast--exiting' : ''
          }`}
          onClick={() => handleDismiss(toast.id)}
        >
          <div className="achievement-toast__icon">{toast.icon}</div>
          <div className="achievement-toast__content">
            <div className="achievement-toast__header">Achievement Unlocked!</div>
            <div className="achievement-toast__name">{toast.name}</div>
            <div className={`achievement-toast__rarity achievement-toast__rarity--${toast.rarity}`}>
              {getRarityLabel(toast.rarity)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default AchievementToast;
