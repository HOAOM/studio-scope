/**
 * useSubscriptionTier — reactive hook around localStorage-backed tier config.
 * Listens to the 'subscription-tier-changed' custom event so all components
 * re-render when the Admin switches plans.
 */
import { useEffect, useState, useCallback } from 'react';
import {
  SubscriptionTier,
  TierFeatures,
  getCurrentTier,
  getCurrentFeatures,
  setCurrentTier as persistTier,
  getTierDefinition,
} from '@/lib/subscriptionTiers';

export function useSubscriptionTier() {
  const [tier, setTierState] = useState<SubscriptionTier>(() => getCurrentTier());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as SubscriptionTier;
      setTierState(detail);
    };
    window.addEventListener('subscription-tier-changed', handler);
    return () => window.removeEventListener('subscription-tier-changed', handler);
  }, []);

  const setTier = useCallback((next: SubscriptionTier) => {
    persistTier(next);
    setTierState(next);
  }, []);

  const features: TierFeatures = getCurrentFeatures();
  const definition = getTierDefinition(tier);

  const hasFeature = useCallback(
    (key: keyof TierFeatures): boolean => {
      const v = features[key];
      return typeof v === 'boolean' ? v : v > 0;
    },
    [features]
  );

  return { tier, setTier, features, definition, hasFeature };
}
