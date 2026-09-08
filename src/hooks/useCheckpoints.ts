/**
 * useCheckpoints — reads the real checkpoint state of a single item.
 *
 * Mirrors the DB logic: a definition applies to an item when the item's engine
 * family (master_item_types.motore_categoria) is listed in
 * checkpoint_definitions.motore_categorie. When the family is unknown the
 * definition applies (same COALESCE(...,true) as public.checkpoint_applies_to_item).
 *
 * Writes go straight to checkpoint_instances: the two-level skip mechanism and
 * every hard gate stay enforced by the database triggers/RLS.
 */
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Database } from '@/integrations/supabase/types';

type CheckpointDefinition = Database['public']['Tables']['checkpoint_definitions']['Row'];
type CheckpointInstance = Database['public']['Tables']['checkpoint_instances']['Row'];
export type MacroGroup = CheckpointDefinition['macro_gruppo'];

export const MACRO_GROUP_LABELS: Record<string, string> = {
  planning: 'Planning & Prep',
  design_validation: 'Design & Validation',
  procurement: 'Procurement',
  production: 'Production',
  delivery: 'Delivery',
  installation: 'Installation',
  closing: 'Closing',
};

export type CheckpointUiStatus =
  | 'pending'
  | 'completed'
  | 'skipped'
  | 'rejected'
  | 'blocked';

export interface CheckpointRow {
  definition: CheckpointDefinition;
  instance: CheckpointInstance | null;
  status: CheckpointUiStatus;
  /** Reason of the generic block (rfi_open / ncr_open), when blocked. */
  blockReason: string | null;
  completedByName: string | null;
  skippedByName: string | null;
  /** Approved while the same person covered both required roles. */
  autoApproved: boolean;
}

/** Codes gated by an open RFI / open NCR (hard gates already live in the DB). */
const RFI_GATED = new Set(['external_approval']);
const NCR_GATED = new Set(['defect_list_closure', 'technical_completion_check']);

export function useCheckpoints(itemId: string | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['item-checkpoints', itemId],
    enabled: !!itemId,
    queryFn: async () => {
      const id = itemId as string;

      const [itemRes, defsRes, instRes, rfiRes, ncrRes] = await Promise.all([
        supabase
          .from('project_items')
          .select('id, item_type_id, created_by, lifecycle_status')
          .eq('id', id)
          .maybeSingle(),
        supabase.from('checkpoint_definitions').select('*').order('sort_order'),
        supabase.from('checkpoint_instances').select('*').eq('project_item_id', id),
        supabase.from('item_rfis').select('id').eq('project_item_id', id).eq('status', 'open'),
        supabase.from('item_ncrs').select('id').eq('project_item_id', id).neq('status', 'closed'),
      ]);

      if (defsRes.error) throw defsRes.error;

      let family: string | null = null;
      const typeId = itemRes.data?.item_type_id;
      if (typeId) {
        const { data: mit } = await supabase
          .from('master_item_types')
          .select('motore_categoria')
          .eq('id', typeId)
          .maybeSingle();
        family = (mit?.motore_categoria as string | null) ?? null;
      }

      const instances = (instRes.data ?? []) as CheckpointInstance[];
      const rfiOpen = (rfiRes.data ?? []).length > 0;
      const ncrOpen = (ncrRes.data ?? []).length > 0;

      // Names of everyone referenced by the instances
      const userIds = Array.from(
        new Set(
          instances.flatMap((i) => [i.completed_by, i.skipped_by, i.second_approver_id].filter(Boolean) as string[]),
        ),
      );
      let names = new Map<string, string>();
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);
        names = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || p.email || 'Utente']));
      }

      const defs = (defsRes.data ?? []) as CheckpointDefinition[];
      const applicable = defs.filter((d) => {
        const fams = (d.motore_categorie ?? []) as string[] | null;
        if (!fams || fams.length === 0) return true;
        if (!family) return true;
        return fams.includes(family);
      });

      const rows: CheckpointRow[] = applicable.map((definition) => {
        const instance = instances.find((i) => i.definition_id === definition.id) ?? null;
        const raw = (instance?.status ?? 'pending') as string;
        let status: CheckpointUiStatus =
          raw === 'completed' ? 'completed' : raw === 'skipped' ? 'skipped' : raw === 'rejected' ? 'rejected' : 'pending';
        let blockReason: string | null = null;
        if (status === 'pending') {
          if (rfiOpen && RFI_GATED.has(definition.code)) {
            status = 'blocked';
            blockReason = 'rfi_open';
          } else if (ncrOpen && NCR_GATED.has(definition.code)) {
            status = 'blocked';
            blockReason = 'ncr_open';
          }
        }
        return {
          definition,
          instance,
          status,
          blockReason,
          completedByName: instance?.completed_by ? names.get(instance.completed_by) ?? null : null,
          skippedByName: instance?.skipped_by ? names.get(instance.skipped_by) ?? null : null,
          autoApproved: !!instance?.sod_warning && raw === 'completed',
        };
      });

      return {
        rows,
        family,
        itemCreatedBy: itemRes.data?.created_by ?? null,
        rfiOpen,
        ncrOpen,
      };
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['item-checkpoints', itemId] });
  };

  const approve = useMutation({
    mutationFn: async (args: { definitionId: string; documentUrl?: string | null; requiresDocument: boolean }) => {
      const { error } = await supabase.from('checkpoint_instances').upsert(
        {
          project_item_id: itemId as string,
          definition_id: args.definitionId,
          status: 'completed' as const,
          completed_by: user?.id ?? null,
          completed_at: new Date().toISOString(),
          document_url: args.documentUrl ?? null,
          needs_verification: args.requiresDocument && !args.documentUrl,
        },
        { onConflict: 'project_item_id,definition_id' },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const reject = useMutation({
    mutationFn: async (args: { definitionId: string }) => {
      const { error } = await supabase.from('checkpoint_instances').upsert(
        {
          project_item_id: itemId as string,
          definition_id: args.definitionId,
          status: 'rejected' as const,
          completed_by: user?.id ?? null,
          completed_at: new Date().toISOString(),
        },
        { onConflict: 'project_item_id,definition_id' },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const skip = useMutation({
    mutationFn: async (args: { definitionId: string; reason: string }) => {
      const reason = args.reason.trim();
      if (!reason) throw new Error('Motivo obbligatorio');
      const { error } = await supabase.from('checkpoint_instances').upsert(
        {
          project_item_id: itemId as string,
          definition_id: args.definitionId,
          status: 'skipped' as const,
          skipped_by: user?.id ?? null,
          skipped_at: new Date().toISOString(),
          skip_reason: reason,
        },
        { onConflict: 'project_item_id,definition_id' },
      );
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Groups in canonical order, keeping only groups with applicable checkpoints. */
  const groups = useMemo(() => {
    const rows = query.data?.rows ?? [];
    const order: string[] = [
      'planning', 'design_validation', 'procurement', 'production',
      'delivery', 'installation', 'closing',
    ];
    return order
      .map((g) => ({ group: g, rows: rows.filter((r) => r.definition.macro_gruppo === g) }))
      .filter((g) => g.rows.length > 0);
  }, [query.data]);

  /** Current macro group = the first group that still has open checkpoints. */
  const currentGroup = useMemo(() => {
    const open = groups.find((g) => g.rows.some((r) => r.status === 'pending' || r.status === 'blocked'));
    return open?.group ?? groups[groups.length - 1]?.group ?? null;
  }, [groups]);

  return { ...query, groups, currentGroup, approve, reject, skip };
}
