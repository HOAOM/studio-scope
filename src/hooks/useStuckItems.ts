/**
 * useStuckItems — read-only aggregation of items that are stuck.
 *
 * No new table: everything is derived from data that already exists
 * (checkpoint_definitions, checkpoint_instances, item_rfis, item_ncrs).
 * No block/unblock logic is touched here.
 *
 * Five signals:
 *  - pending    : first applicable checkpoint still waiting for more than N days
 *  - rfi        : an RFI open for more than N days
 *  - ncr        : an NCR open for more than N days
 *  - verify     : a checkpoint closed without the required document
 *  - skip       : a checkpoint skipped (who + reason)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { MACRO_GROUP_LABELS } from '@/hooks/useCheckpoints';

export type StuckKind = 'pending' | 'rfi' | 'ncr' | 'verify' | 'skip';

export interface StuckRow {
  id: string;
  kind: StuckKind;
  itemId: string;
  itemCode: string | null;
  itemName: string;
  projectId: string;
  projectName: string;
  /** Checkpoint / RFI / NCR label */
  label: string;
  /** Days since the blocking event started; null when not time based. */
  days: number | null;
  detail: string | null;
}

const DAY = 86_400_000;
const daysSince = (iso: string | null | undefined) =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : 0;

export function useStuckItems(thresholdDays: number) {
  const { activeId } = useActiveOrg();

  const query = useQuery({
    queryKey: ['stuck-items', activeId],
    enabled: !!activeId,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: projects, error: pErr } = await supabase
        .from('projects')
        .select('id, name')
        .eq('organization_id', activeId!);
      if (pErr) throw pErr;
      const projectIds = (projects ?? []).map((p) => p.id);
      if (projectIds.length === 0) return { rows: [] as StuckRow[], projects: [] as { id: string; name: string }[] };

      const { data: items, error: iErr } = await supabase
        .from('project_items')
        .select('id, item_code, description, project_id, item_type_id, created_at')
        .in('project_id', projectIds);
      if (iErr) throw iErr;
      const itemIds = (items ?? []).map((i) => i.id);
      if (itemIds.length === 0) return { rows: [] as StuckRow[], projects: projects ?? [] };

      const [defsRes, instRes, rfiRes, ncrRes, typesRes] = await Promise.all([
        supabase.from('checkpoint_definitions').select('*').order('sort_order'),
        supabase.from('checkpoint_instances').select('*').in('project_item_id', itemIds),
        supabase.from('item_rfis').select('id, project_item_id, question, created_at').in('project_item_id', itemIds).eq('status', 'open'),
        supabase.from('item_ncrs').select('id, project_item_id, description, created_at').in('project_item_id', itemIds).neq('status', 'closed'),
        supabase.from('master_item_types').select('id, motore_categoria'),
      ]);

      const defs = defsRes.data ?? [];
      const instances = instRes.data ?? [];
      const familyByType = new Map<string, string | null>(
        (typesRes.data ?? []).map((t: any) => [t.id, t.motore_categoria ?? null]),
      );
      const projectName = new Map((projects ?? []).map((p) => [p.id, p.name]));

      const actorIds = Array.from(
        new Set(instances.flatMap((i: any) => [i.skipped_by].filter(Boolean) as string[])),
      );
      let names = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id, full_name, email').in('id', actorIds);
        names = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email || 'Utente']));
      }

      const rows: StuckRow[] = [];

      for (const item of items ?? []) {
        const base = {
          itemId: item.id,
          itemCode: (item as any).item_code ?? null,
          itemName: (item as any).description ?? '—',
          projectId: item.project_id,
          projectName: projectName.get(item.project_id) ?? '—',
        };
        const mine = instances.filter((i: any) => i.project_item_id === item.id);
        const family = item.item_type_id ? familyByType.get(item.item_type_id) ?? null : null;

        // 1. first applicable checkpoint still pending
        const applicable = defs.filter((d: any) => {
          const fams = (d.motore_categorie ?? []) as string[] | null;
          if (!fams || fams.length === 0) return true;
          if (!family) return true;
          return fams.includes(family);
        });
        const firstPending = applicable.find((d: any) => {
          const inst = mine.find((i: any) => i.definition_id === d.id);
          return !inst || (inst.status !== 'completed' && inst.status !== 'skipped');
        });
        if (firstPending) {
          const lastActivity = mine
            .map((i: any) => i.completed_at || i.skipped_at || i.updated_at)
            .filter(Boolean)
            .sort()
            .pop() as string | undefined;
          const since = lastActivity ?? (item as any).created_at;
          rows.push({
            ...base,
            id: `pending-${item.id}`,
            kind: 'pending',
            label: (firstPending as any).label,
            days: daysSince(since),
            detail: MACRO_GROUP_LABELS[(firstPending as any).macro_gruppo] ?? null,
          });
        }

        // 4. needs_verification / 5. skipped
        for (const inst of mine as any[]) {
          const def = defs.find((d: any) => d.id === inst.definition_id) as any;
          if (inst.needs_verification && inst.status === 'completed') {
            rows.push({
              ...base,
              id: `verify-${inst.id}`,
              kind: 'verify',
              label: def?.label ?? 'Checkpoint',
              days: daysSince(inst.completed_at),
              detail: 'Chiuso senza il documento richiesto',
            });
          }
          if (inst.status === 'skipped') {
            rows.push({
              ...base,
              id: `skip-${inst.id}`,
              kind: 'skip',
              label: def?.label ?? 'Checkpoint',
              days: daysSince(inst.skipped_at),
              detail: `${names.get(inst.skipped_by) ?? 'Utente'} — ${inst.skip_reason || 'nessun motivo'}`,
            });
          }
        }
      }

      const itemById = new Map((items ?? []).map((i: any) => [i.id, i]));
      const baseOf = (itemId: string) => {
        const it = itemById.get(itemId);
        return {
          itemId,
          itemCode: it?.item_code ?? null,
          itemName: it?.description ?? '—',
          projectId: it?.project_id ?? '',
          projectName: projectName.get(it?.project_id) ?? '—',
        };
      };

      for (const r of (rfiRes.data ?? []) as any[]) {
        rows.push({
          ...baseOf(r.project_item_id),
          id: `rfi-${r.id}`,
          kind: 'rfi',
          label: 'RFI aperta',
          days: daysSince(r.created_at),
          detail: r.question,
        });
      }
      for (const n of (ncrRes.data ?? []) as any[]) {
        rows.push({
          ...baseOf(n.project_item_id),
          id: `ncr-${n.id}`,
          kind: 'ncr',
          label: 'Non conformità aperta',
          days: daysSince(n.created_at),
          detail: n.description,
        });
      }

      return { rows, projects: projects ?? [] };
    },
  });

  const all = query.data?.rows ?? [];
  /** Time-based signals respect the threshold; verify/skip are always shown. */
  const rows = all.filter((r) =>
    r.kind === 'verify' || r.kind === 'skip' ? true : (r.days ?? 0) >= thresholdDays,
  );

  return { ...query, rows, projects: query.data?.projects ?? [], total: rows.length };
}
