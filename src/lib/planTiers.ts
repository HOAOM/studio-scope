/**
 * planTiers — descrizione ufficiale dei piani (numeri definitivi).
 * I limiti reali sono applicati lato database (tabella tier_limits +
 * eventuali limiti personalizzati per organizzazione su Enterprise).
 */
export type PlanTier = 'basic' | 'advanced' | 'pro' | 'enterprise';

export const PLAN_TIERS: PlanTier[] = ['basic', 'advanced', 'pro', 'enterprise'];

export interface PlanTierInfo {
  id: PlanTier;
  label: string;
  price: string;
  /** null = illimitato */
  activeProjects: number | null;
  storageGb: number | null;
  addons: number | null;
  usersPerRole: number | null;
  rolesPerUser: number | null;
  superRoleExtra: number | null;
  note?: string;
}

export const PLAN_TIER_INFO: Record<PlanTier, PlanTierInfo> = {
  basic: {
    id: 'basic', label: 'Basic', price: '79€',
    activeProjects: 3, storageGb: 5, addons: 1,
    usersPerRole: 3, rolesPerUser: 3, superRoleExtra: 0,
  },
  advanced: {
    id: 'advanced', label: 'Advanced', price: '99€',
    activeProjects: 8, storageGb: 10, addons: 3,
    usersPerRole: 8, rolesPerUser: 5, superRoleExtra: 1,
    note: '-10% sugli addon extra',
  },
  pro: {
    id: 'pro', label: 'Pro', price: '135€',
    activeProjects: 15, storageGb: 20, addons: 5,
    usersPerRole: 20, rolesPerUser: 8, superRoleExtra: 3,
  },
  enterprise: {
    id: 'enterprise', label: 'Enterprise', price: 'su misura',
    activeProjects: null, storageGb: null, addons: null,
    usersPerRole: null, rolesPerUser: null, superRoleExtra: null,
    note: 'illimitato salvo limiti personalizzati per organizzazione',
  },
};

const n = (v: number | null) => (v == null ? '∞' : String(v));

/** Riepilogo breve, es. "15 progetti · 20GB · 5 addon · 20 utenti/ruolo" */
export function planSummary(tier: PlanTier): string {
  const t = PLAN_TIER_INFO[tier];
  return `${n(t.activeProjects)} progetti · ${n(t.storageGb)}GB · ${n(t.addons)} addon · ${n(t.usersPerRole)} utenti/ruolo · ${n(t.rolesPerUser)} ruoli/persona · ${n(t.superRoleExtra)} extra admin/coo`;
}

export function planOptionLabel(tier: PlanTier): string {
  const t = PLAN_TIER_INFO[tier];
  return `${t.label} ${t.price} — ${planSummary(tier)}`;
}
