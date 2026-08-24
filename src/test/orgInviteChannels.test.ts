/**
 * Test di non-regressione permanente sui CANALI DI INVITO.
 *
 * Storia: esistevano 6-7 punti diversi che creavano un accesso a
 * un'organizzazione, ognuno con regole proprie. Ogni bug (gate password
 * mancante, dominio sbagliato, secondo invito senza email) andava scoperto e
 * corretto punto per punto.
 *
 * Regola verificata qui, per sempre:
 *   1. nessuna edge function crea utenti/link di invito per conto proprio:
 *      tutte passano da _shared/sendOrgInvite.ts;
 *   2. l'helper condiviso applica SEMPRE il gate password e l'host dell'org;
 *   3. i diritti dell'owner in View-as seguono un'unica regola generale
 *      (computeEffectiveOwner), non gate per singola azione.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeEffectiveOwner,
} from '../../supabase/functions/_shared/orgContext';
import { computeEffectiveOwnerClient } from '@/hooks/useEffectiveOwner';

const FN_DIR = join(process.cwd(), 'supabase/functions');
const read = (p: string) => readFileSync(join(FN_DIR, p), 'utf8');

/** Funzioni che possono creare un accesso a un'organizzazione. */
const INVITE_CHANNELS = [
  'invite-member/index.ts',              // 1. Admin → Members
  'admin-set-user-password/index.ts',    // 2. Super-admin → Utenti org
  'admin-users/index.ts',                // 3. UserManagement (legacy, reindirizzato)
  'bootstrap-client-org/index.ts',       // 4. Super-admin → Crea organizzazione
  'public-onboarding/index.ts',          // 5. Onboarding pubblico kroneel.com
  'site-api/index.ts',                   // 6. API sito pubblico
];

describe('canale unico di invito', () => {
  it('l helper condiviso esiste', () => {
    expect(existsSync(join(FN_DIR, '_shared/sendOrgInvite.ts'))).toBe(true);
  });

  it.each(INVITE_CHANNELS)('%s importa sendOrgInvite', (file) => {
    expect(read(file)).toMatch(/from ["']\.\.\/_shared\/sendOrgInvite\.ts["']/);
  });

  it.each(INVITE_CHANNELS)('%s non chiama inviteUserByEmail direttamente', (file) => {
    expect(read(file)).not.toMatch(/inviteUserByEmail/);
  });

  it('solo l helper e il flusso SSO generano magic link', () => {
    for (const file of INVITE_CHANNELS) {
      const src = read(file);
      if (!/generateLink/.test(src)) continue;
      // site-api usa generateLink anche per lo scambio ticket SSO (non è un invito)
      expect(file).toBe('site-api/index.ts');
      expect(src).toMatch(/sso_tickets/);
    }
  });

  it('l helper impone il gate password e l host dell organizzazione', () => {
    const src = read('_shared/sendOrgInvite.ts');
    expect(src).toMatch(/must_set_password: true/);
    expect(src).toMatch(/orgSiteUrl\(/);
    expect(src).toMatch(/enqueue_email/);
  });
});

describe('View-as: diritti ereditati dall owner reale', () => {
  const base = {
    isRealOwner: false,
    isOrgAdmin: false,
    isPlatformAdmin: false,
    impersonatingOrgId: null as string | null,
    targetOrgId: 'org-A',
  };

  it('owner reale ha i diritti dell owner', () => {
    const d = computeEffectiveOwner({ ...base, isRealOwner: true });
    expect(d.hasOwnerRights).toBe(true);
    expect(d.reason).toBe('real_owner');
  });

  it('platform admin in View-as sulla stessa org eredita i diritti owner', () => {
    const d = computeEffectiveOwner({
      ...base, isPlatformAdmin: true, impersonatingOrgId: 'org-A',
    });
    expect(d.hasOwnerRights).toBe(true);
    expect(d.reason).toBe('impersonation');
    expect(d.isImpersonating).toBe(true);
  });

  it('platform admin in View-as su UN ALTRA org non eredita nulla', () => {
    const d = computeEffectiveOwner({
      ...base, isPlatformAdmin: true, impersonatingOrgId: 'org-B',
    });
    expect(d.hasOwnerRights).toBe(false);
    expect(d.hasAdminRights).toBe(false);
  });

  it('platform admin dalla console super-admin (consoleIntent) eredita i diritti owner', () => {
    const d = computeEffectiveOwner({ ...base, isPlatformAdmin: true, consoleIntent: true });
    expect(d.hasOwnerRights).toBe(true);
    expect(d.reason).toBe('console');
  });

  it('org admin amministra ma NON eredita i diritti esclusivi dell owner', () => {
    const d = computeEffectiveOwner({ ...base, isOrgAdmin: true });
    expect(d.hasAdminRights).toBe(true);
    expect(d.hasOwnerRights).toBe(false);
  });

  it('membro semplice non ha diritti amministrativi', () => {
    expect(computeEffectiveOwner(base).hasAdminRights).toBe(false);
  });

  it('la regola client coincide con quella server', () => {
    expect(computeEffectiveOwnerClient({ isRealOwner: true, isImpersonating: false })).toBe(true);
    expect(computeEffectiveOwnerClient({ isRealOwner: false, isImpersonating: true })).toBe(true);
    expect(computeEffectiveOwnerClient({ isRealOwner: false, isImpersonating: false })).toBe(false);
  });
});

describe('UI: nessun gate ad-hoc su is_owner nei pannelli di amministrazione', () => {
  const files = [
    'src/components/admin/MembersPanel.tsx',
    'src/components/layout/OrgSwitcher.tsx',
  ];
  it.each(files)('%s usa useEffectiveOwner', (f) => {
    const src = readFileSync(join(process.cwd(), f), 'utf8');
    expect(src).toMatch(/useEffectiveOwner/);
    expect(src).not.toMatch(/activeOrg\.is_owner\s*\|\|/);
  });
});
