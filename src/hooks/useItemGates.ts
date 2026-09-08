/**
 * useItemGates — RFI, Submittal, NCR and Change Requests of a single item.
 *
 * Every write goes straight to the tables: the DB keeps the hard gates
 * (open RFI blocks external_approval, open NCR blocks defect_list_closure /
 * technical_completion_check). After each write we invalidate the checkpoint
 * query so the panel unlocks by itself, with no page reload.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole } from '@/hooks/useUserRole';
import type { Database } from '@/integrations/supabase/types';

export type Rfi = Database['public']['Tables']['item_rfis']['Row'];
export type Ncr = Database['public']['Tables']['item_ncrs']['Row'];
export type Submittal = Database['public']['Tables']['item_submittals']['Row'];
export type ChangeRequest = Database['public']['Tables']['item_change_requests']['Row'];
type AppRole = Database['public']['Enums']['app_role'];

/** Responsible role per section — mirrors the checkpoint each entity gates. */
export const GATE_RESPONSIBLE: Record<'rfi' | 'submittal' | 'ncr' | 'change', AppRole> = {
  rfi: 'client',
  submittal: 'head_of_design',
  ncr: 'site_engineer',
  change: 'project_manager',
};

export function useGatePermissions() {
  const { roles } = useUserRole();
  // SUPER_ROLE: admin and coo bypass every gate.
  const isSuper = roles.includes('admin') || roles.includes('coo');
  return {
    isSuper,
    can: (section: keyof typeof GATE_RESPONSIBLE) =>
      isSuper || roles.includes(GATE_RESPONSIBLE[section]),
  };
}

export function useItemGates(itemId: string | null | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['item-gates', itemId],
    enabled: !!itemId,
    queryFn: async () => {
      const id = itemId as string;
      const [rfis, ncrs, submittals, changes] = await Promise.all([
        supabase.from('item_rfis').select('*').eq('project_item_id', id).order('opened_at', { ascending: false }),
        supabase.from('item_ncrs').select('*').eq('project_item_id', id).order('opened_at', { ascending: false }),
        supabase.from('item_submittals').select('*').eq('project_item_id', id).order('version', { ascending: false }),
        supabase.from('item_change_requests').select('*').eq('project_item_id', id).order('created_at', { ascending: false }),
      ]);
      if (rfis.error) throw rfis.error;
      return {
        rfis: (rfis.data ?? []) as Rfi[],
        ncrs: (ncrs.data ?? []) as Ncr[],
        submittals: (submittals.data ?? []) as Submittal[],
        changes: (changes.data ?? []) as ChangeRequest[],
      };
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['item-gates', itemId] });
    qc.invalidateQueries({ queryKey: ['item-checkpoints', itemId] });
  };

  const mut = <T,>(fn: (args: T) => Promise<void>) =>
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useMutation({ mutationFn: fn, onSuccess: refresh });

  const openRfi = mut(async ({ question }: { question: string }) => {
    const q = question.trim();
    if (!q) throw new Error('Domanda obbligatoria');
    const { error } = await supabase.from('item_rfis').insert({
      project_item_id: itemId as string,
      question: q,
      opened_by: user?.id ?? null,
      status: 'open' as const,
    });
    if (error) throw error;
  });

  const answerRfi = mut(async ({ id, answer }: { id: string; answer: string }) => {
    const a = answer.trim();
    if (!a) throw new Error('Risposta obbligatoria');
    const now = new Date().toISOString();
    const { error } = await supabase.from('item_rfis').update({
      answer: a,
      answered_by: user?.id ?? null,
      answered_at: now,
      closed_at: now,
      status: 'closed' as const,
    }).eq('id', id);
    if (error) throw error;
  });

  const openNcr = mut(async ({ description }: { description: string }) => {
    const d = description.trim();
    if (!d) throw new Error('Descrizione obbligatoria');
    const { error } = await supabase.from('item_ncrs').insert({
      project_item_id: itemId as string,
      description: d,
      opened_by: user?.id ?? null,
      status: 'open' as const,
    });
    if (error) throw error;
  });

  const closeNcr = mut(async ({ id, correctiveAction }: { id: string; correctiveAction: string }) => {
    const a = correctiveAction.trim();
    if (!a) throw new Error('Azione correttiva obbligatoria');
    const { error } = await supabase.from('item_ncrs').update({
      corrective_action: a,
      closed_by: user?.id ?? null,
      closed_at: new Date().toISOString(),
      status: 'closed' as const,
    }).eq('id', id);
    if (error) throw error;
  });

  const reopenNcr = mut(async ({ id }: { id: string }) => {
    const { error } = await supabase.from('item_ncrs').update({
      status: 'open' as const,
      closed_by: null,
      closed_at: null,
      rework_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
  });

  const addSubmittal = mut(async ({ title, documentUrl }: { title: string; documentUrl: string | null }) => {
    const t = title.trim();
    if (!t) throw new Error('Titolo obbligatorio');
    const nextVersion = (query.data?.submittals[0]?.version ?? 0) + 1;
    const { error } = await supabase.from('item_submittals').insert({
      project_item_id: itemId as string,
      title: t,
      version: nextVersion,
      document_url: documentUrl,
      submitted_by: user?.id ?? null,
      status: 'proposed' as const,
    });
    if (error) throw error;
  });

  const reviewSubmittal = mut(async (
    { id, status, notes }: { id: string; status: Database['public']['Enums']['submittal_status']; notes?: string },
  ) => {
    const { error } = await supabase.from('item_submittals').update({
      status,
      review_notes: notes?.trim() || null,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
  });

  const requestChange = mut(async ({ title, description }: { title: string; description: string }) => {
    const t = title.trim();
    if (!t) throw new Error('Descrizione obbligatoria');
    const { error } = await supabase.from('item_change_requests').insert({
      project_item_id: itemId as string,
      title: t,
      description: description.trim() || null,
      requested_by: user?.id ?? null,
      status: 'requested' as const,
    });
    if (error) throw error;
  });

  const setChangeImpact = mut(async (
    { id, costImpact, timeImpactDays, notes }:
    { id: string; costImpact: number | null; timeImpactDays: number | null; notes?: string },
  ) => {
    const { error } = await supabase.from('item_change_requests').update({
      cost_impact: costImpact,
      time_impact_days: timeImpactDays,
      impact_notes: notes?.trim() || null,
      status: 'impact_assessment' as const,
    }).eq('id', id);
    if (error) throw error;
  });

  const approveChange = mut(async ({ id }: { id: string }) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from('item_change_requests').update({
      status: 'incorporated' as const,
      approved_by: user?.id ?? null,
      approved_at: now,
      incorporated_at: now,
    }).eq('id', id);
    if (error) throw error;
  });

  const rejectChange = mut(async ({ id }: { id: string }) => {
    const { error } = await supabase.from('item_change_requests').update({
      status: 'rejected' as const,
      approved_by: user?.id ?? null,
      approved_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
  });

  return {
    ...query,
    openRfi, answerRfi,
    openNcr, closeNcr, reopenNcr,
    addSubmittal, reviewSubmittal,
    requestChange, setChangeImpact, approveChange, rejectChange,
  };
}
