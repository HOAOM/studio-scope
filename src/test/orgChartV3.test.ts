/**
 * Test di non regressione — Organigramma v3.
 * Copre: costruzione dell'albero dai dati piatti (profondità emergente),
 * multi-squadra senza duplicazione, e i vincoli architetturali (niente
 * React Flow, nessun uso di coordinate x/y nel nuovo codice).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { buildTree, type OrgPositionV3 } from '@/hooks/useOrgChartV3';

const pos = (id: string, manager_id: string | null, extra: Partial<OrgPositionV3> = {}): OrgPositionV3 => ({
  id,
  organization_id: 'org',
  title: id,
  user_id: null,
  team_id: null,
  manager_id,
  supplier_id: null,
  catalog_id: null,
  node_kind: 'person',
  base_role: null,
  sort_order: 0,
  notes: null,
  can_edit: true,
  is_ancestor: false,
  ...extra,
});

describe('buildTree', () => {
  it('la profondità emerge dai dati, non è imposta', () => {
    const rows = [
      pos('ceo', null),
      pos('coo', 'ceo'),
      pos('team', 'coo', { node_kind: 'team' }),
      pos('worker', 'team'),
    ];
    const roots = buildTree(rows);
    expect(roots).toHaveLength(1);
    expect(roots[0].children[0].children[0].children[0].id).toBe('worker');
    expect(roots[0].children[0].children[0].children[0].depth).toBe(3);
  });

  it('studio da 3 persone: albero piatto di due livelli', () => {
    const roots = buildTree([pos('ceo', null), pos('a', 'ceo'), pos('b', 'ceo')]);
    expect(roots).toHaveLength(1);
    expect(roots[0].children.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('ordina i figli per sort_order e poi per titolo', () => {
    const roots = buildTree([
      pos('root', null),
      pos('z', 'root', { sort_order: 1 }),
      pos('a', 'root', { sort_order: 2 }),
    ]);
    expect(roots[0].children.map((c) => c.id)).toEqual(['z', 'a']);
  });

  it('una persona compare una sola volta anche con più squadre', () => {
    const roots = buildTree([pos('team1', null, { node_kind: 'team' }), pos('mario', 'team1', { user_id: 'u1' })]);
    const flat: string[] = [];
    const walk = (n: any) => { if (n.user_id) flat.push(n.user_id); n.children.forEach(walk); };
    roots.forEach(walk);
    expect(flat.filter((u) => u === 'u1')).toHaveLength(1);
  });

  it('i nodi orfani (parent non visibile) diventano radici, mai persi', () => {
    const roots = buildTree([pos('child', 'invisible-parent')]);
    expect(roots.map((r) => r.id)).toEqual(['child']);
  });
});

const ORG_CHART_DIR = 'src/components/admin/OrgChart';
const orgChartFiles = readdirSync(ORG_CHART_DIR).map((f) => join(ORG_CHART_DIR, f));

describe('vincoli architetturali v3', () => {
  it('nessun file dell organigramma importa React Flow', () => {
    for (const f of [...orgChartFiles, 'src/hooks/useOrgChartV3.ts', 'src/pages/OrgChartPage.tsx']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/reactflow/i);
    }
  });

  it('reactflow non è più una dipendenza del progetto', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.dependencies?.reactflow).toBeUndefined();
  });

  it('il layout è derivato: il drag scrive relazioni, non coordinate', () => {
    const hook = readFileSync('src/hooks/useOrgChartV3.ts', 'utf8');
    const move = hook.slice(hook.indexOf('useMoveOrgNode'));
    expect(move).toMatch(/manager_id/);
    expect(move.slice(0, 600)).not.toMatch(/\bx:\s|\by:\s/);
  });

  it('l organigramma legge l organizzazione attiva, mai localStorage diretto', () => {
    const hook = readFileSync('src/hooks/useOrgChartV3.ts', 'utf8');
    expect(hook).toMatch(/useActiveOrg/);
    expect(hook).not.toMatch(/localStorage/);
  });

  it('i diritti di modifica passano da useEffectiveOwner/usePermissions', () => {
    const panel = readFileSync(join(ORG_CHART_DIR, 'OrgChartPanel.tsx'), 'utf8');
    expect(panel).toMatch(/useEffectiveOwner/);
    expect(panel).toMatch(/usePermissions/);
    expect(panel).not.toMatch(/activeOrg\?\.is_owner/);
  });
});
