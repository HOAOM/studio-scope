/**
 * Test di NON-REGRESSIONE permanente — classe di bug "View-as scrive sull'org sbagliata".
 *
 * Regola di piattaforma: mentre un platform admin è in View-as, QUALUNQUE
 * azione (lettura o scrittura) deve operare sull'organizzazione impersonata,
 * mai su quella del platform admin.
 *
 * Questo file deve restare nella suite per sempre: ogni nuova feature che
 * tocca il contesto organizzazione (organigramma, calendario, addon, ...) viene
 * automaticamente controllata contro lo stesso errore.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { resolveActiveOrgId } from '@/hooks/useMyOrganizations';
import { decideOrgAccess } from '../../supabase/functions/_shared/orgContext';

const ADMIN_ORG = '11111111-1111-4111-8111-111111111111';
const TENANT_ORG = '22222222-2222-4222-8222-222222222222';

describe('View-as — risoluzione client dell organizzazione attiva', () => {
  it('l org impersonata vince anche se il platform admin non ne è membro', () => {
    expect(
      resolveActiveOrgId({
        orgs: [{ organization_id: ADMIN_ORG }],
        storedId: ADMIN_ORG,
        impersonatedId: TENANT_ORG,
      }),
    ).toBe(TENANT_ORG);
  });

  it('l org impersonata vince anche prima che la lista org sia caricata', () => {
    expect(
      resolveActiveOrgId({ orgs: undefined, storedId: ADMIN_ORG, impersonatedId: TENANT_ORG }),
    ).toBe(TENANT_ORG);
  });

  it('senza impersonazione mantiene la scelta valida dell utente', () => {
    expect(
      resolveActiveOrgId({
        orgs: [{ organization_id: ADMIN_ORG }, { organization_id: TENANT_ORG }],
        storedId: TENANT_ORG,
        impersonatedId: null,
      }),
    ).toBe(TENANT_ORG);
  });

  it('senza impersonazione ricade sulla prima org se la scelta non è più valida', () => {
    expect(
      resolveActiveOrgId({ orgs: [{ organization_id: ADMIN_ORG }], storedId: 'stale', impersonatedId: null }),
    ).toBe(ADMIN_ORG);
  });
});

describe('View-as — guardia server-side sul contesto organizzazione', () => {
  it('rifiuta il platform admin senza sessione View-as sull org target', () => {
    const d = decideOrgAccess({
      isPlatformAdmin: true,
      isOrgMember: false,
      impersonatingOrgId: null,
      targetOrgId: TENANT_ORG,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toBe('ambiguous_platform_context');
  });

  it('rifiuta se la sessione View-as è aperta su un ALTRA organizzazione', () => {
    expect(
      decideOrgAccess({
        isPlatformAdmin: true,
        isOrgMember: false,
        impersonatingOrgId: ADMIN_ORG,
        targetOrgId: TENANT_ORG,
      }).allowed,
    ).toBe(false);
  });

  it('consente il platform admin in View-as sull org target', () => {
    expect(
      decideOrgAccess({
        isPlatformAdmin: true,
        isOrgMember: false,
        impersonatingOrgId: TENANT_ORG,
        targetOrgId: TENANT_ORG,
      }).reason,
    ).toBe('impersonation');
  });

  it('consente la console super-admin con org scelta esplicitamente', () => {
    expect(
      decideOrgAccess({
        isPlatformAdmin: true,
        isOrgMember: false,
        impersonatingOrgId: null,
        targetOrgId: TENANT_ORG,
        consoleIntent: true,
      }).reason,
    ).toBe('console');
  });

  it('consente sempre i membri reali e blocca gli estranei', () => {
    expect(
      decideOrgAccess({ isPlatformAdmin: false, isOrgMember: true, impersonatingOrgId: null, targetOrgId: TENANT_ORG })
        .allowed,
    ).toBe(true);
    expect(
      decideOrgAccess({ isPlatformAdmin: false, isOrgMember: false, impersonatingOrgId: null, targetOrgId: TENANT_ORG })
        .allowed,
    ).toBe(false);
  });
});

/** Scansione statica: nessuna feature può reintrodurre una sorgente org "parallela". */
function srcFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) srcFiles(p, acc);
    else if (/\.(ts|tsx)$/.test(p)) acc.push(p);
  }
  return acc;
}

describe('View-as — nessuna sorgente parallela di organizzazione attiva', () => {
  const files = srcFiles('src').filter((f) => !f.includes(`${'src'}/test/`));

  it("solo useMyOrganizations e ImpersonateBanner toccano le chiavi localStorage dell'org", () => {
    const offenders = files.filter(
      (f) =>
        /studioscope\.(activeOrgId|impersonateOrgId)/.test(readFileSync(f, 'utf8')) &&
        !/useMyOrganizations\.ts$|ImpersonateBanner\.tsx$/.test(f),
    );
    expect(offenders, `File che leggono direttamente l'org attiva: ${offenders.join(', ')}`).toEqual([]);
  });

  it('nessun componente ricava l org attiva da orgs[0] (bypassa il View-as)', () => {
    const offenders = files.filter(
      (f) => /\borgs\[0\]/.test(readFileSync(f, 'utf8')) && !/useMyOrganizations\.ts$/.test(f),
    );
    expect(offenders, `File che usano orgs[0] come org attiva: ${offenders.join(', ')}`).toEqual([]);
  });
});
