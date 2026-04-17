/**
 * Subscription Tiers — defines the 3-tier model for external companies.
 *
 * Tier limits are enforced softly (UI warnings + feature gating).
 * Stored in localStorage for now; can be migrated to a DB-backed
 * `organization_subscription` table once the multi-tenant layer lands.
 *
 * @see mem://constraints/subscription-tiers
 */

export type SubscriptionTier = 'base' | 'pro' | 'enterprise';

export interface TierFeatures {
  /** Maximum simultaneous projects (active, not archived) */
  maxProjects: number;
  /** Maximum users per role (e.g. 1 = only one Designer allowed) */
  maxUsersPerRole: number;
  /** Maximum total team members across all roles */
  maxTotalUsers: number;
  /** Allow Excel/CSV bulk import */
  bulkImport: boolean;
  /** Allow Presentation Builder */
  presentationBuilder: boolean;
  /** Allow Supplier Document Exports (RFQ/PO/Proforma) */
  supplierExports: boolean;
  /** Allow Client Boards (signed PDFs) */
  clientBoards: boolean;
  /** Allow custom company branding in PDFs */
  customBranding: boolean;
  /** Allow API access / integrations */
  apiAccess: boolean;
  /** Audit log retention in days (Infinity = unlimited) */
  auditRetentionDays: number;
}

export interface TierDefinition {
  id: SubscriptionTier;
  label: string;
  tagline: string;
  monthlyPrice: number; // EUR
  features: TierFeatures;
  highlight?: boolean;
}

export const TIERS: TierDefinition[] = [
  {
    id: 'base',
    label: 'Base',
    tagline: '1 user per role · core BOQ + Gantt',
    monthlyPrice: 49,
    features: {
      maxProjects: 3,
      maxUsersPerRole: 1,
      maxTotalUsers: 5,
      bulkImport: false,
      presentationBuilder: false,
      supplierExports: false,
      clientBoards: true,
      customBranding: false,
      apiAccess: false,
      auditRetentionDays: 30,
    },
  },
  {
    id: 'pro',
    label: 'Pro',
    tagline: 'Multiple users per role · full procurement',
    monthlyPrice: 149,
    highlight: true,
    features: {
      maxProjects: 15,
      maxUsersPerRole: 5,
      maxTotalUsers: 30,
      bulkImport: true,
      presentationBuilder: true,
      supplierExports: true,
      clientBoards: true,
      customBranding: true,
      apiAccess: false,
      auditRetentionDays: 365,
    },
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    tagline: 'Unlimited · API · custom SLAs',
    monthlyPrice: 0, // contact sales
    features: {
      maxProjects: Infinity,
      maxUsersPerRole: Infinity,
      maxTotalUsers: Infinity,
      bulkImport: true,
      presentationBuilder: true,
      supplierExports: true,
      clientBoards: true,
      customBranding: true,
      apiAccess: true,
      auditRetentionDays: Infinity,
    },
  },
];

const STORAGE_KEY = 'studioscope_subscription_tier';
const DEFAULT_TIER: SubscriptionTier = 'enterprise'; // dev/beta default

export function getCurrentTier(): SubscriptionTier {
  if (typeof window === 'undefined') return DEFAULT_TIER;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && TIERS.some((t) => t.id === stored)) return stored as SubscriptionTier;
  return DEFAULT_TIER;
}

export function setCurrentTier(tier: SubscriptionTier): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, tier);
  window.dispatchEvent(new CustomEvent('subscription-tier-changed', { detail: tier }));
}

export function getTierDefinition(tier: SubscriptionTier): TierDefinition {
  return TIERS.find((t) => t.id === tier) ?? TIERS[0];
}

export function getCurrentFeatures(): TierFeatures {
  return getTierDefinition(getCurrentTier()).features;
}

/** Check whether a feature is available in the current tier. */
export function hasFeature(feature: keyof TierFeatures): boolean {
  const f = getCurrentFeatures();
  const v = f[feature];
  return typeof v === 'boolean' ? v : v > 0;
}
