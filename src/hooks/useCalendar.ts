/**
 * useCalendar — unified calendar (v_calendar) + calendar_entries mutations.
 * v_calendar merges project tasks and manual entries (work/leave/permit/...).
 * RLS decides what is visible/writable; the UI mirrors can_manage_member.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { useAuth } from '@/hooks/useAuth';

const sb = supabase as any;

export type CalendarEntryType = 'work' | 'leave' | 'permit' | 'sick' | 'travel' | 'holiday' | 'other';
export type CalendarEntryStatus = 'requested' | 'confirmed' | 'rejected' | 'cancelled';

export interface CalendarRow {
  id: string;
  source: string; // 'entry' | 'task'
  organization_id: string;
  title: string;
  entry_type: string;
  status: string;
  start_date: string;
  end_date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean | null;
  assignee_id: string | null;
  team_id: string | null;
  supplier_id: string | null;
  project_id: string | null;
  task_id: string | null;
}

export interface CalendarRange { from: string; to: string }

/** All calendar rows visible to the current user in the active org, in range. */
export function useCalendarRows(range: CalendarRange) {
  const { activeId } = useActiveOrg();
  return useQuery({
    queryKey: ['calendar-rows', activeId, range.from, range.to],
    enabled: !!activeId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from('v_calendar')
        .select('*')
        .eq('organization_id', activeId)
        .lte('start_date', range.to)
        .gte('end_date', range.from)
        .order('start_date');
      if (error) throw error;
      return (data || []) as CalendarRow[];
    },
  });
}

function useInvalidateCalendar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['calendar-rows'] });
}

export interface NewCalendarEntry {
  title: string;
  entry_type: CalendarEntryType;
  start_date: string;
  end_date: string;
  user_id?: string | null;
  team_id?: string | null;
  supplier_id?: string | null;
  project_id?: string | null;
  status?: CalendarEntryStatus;
  notes?: string | null;
  all_day?: boolean;
}

export function useCreateCalendarEntry() {
  const invalidate = useInvalidateCalendar();
  const { activeId } = useActiveOrg();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: NewCalendarEntry) => {
      if (!activeId) throw new Error('Nessuna organizzazione attiva');
      const { data, error } = await sb
        .from('calendar_entries')
        .insert({
          organization_id: activeId,
          created_by: user?.id ?? null,
          user_id: input.user_id ?? user?.id ?? null,
          team_id: input.team_id ?? null,
          supplier_id: input.supplier_id ?? null,
          project_id: input.project_id ?? null,
          entry_type: input.entry_type,
          status: input.status ?? 'requested',
          title: input.title,
          notes: input.notes ?? null,
          start_date: input.start_date,
          end_date: input.end_date,
          all_day: input.all_day ?? true,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: invalidate,
  });
}

export function useDecideCalendarEntry() {
  const invalidate = useInvalidateCalendar();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: CalendarEntryStatus; note?: string }) => {
      const { error } = await sb
        .from('calendar_entries')
        .update({
          status,
          decided_by: user?.id ?? null,
          decided_at: new Date().toISOString(),
          decision_note: note ?? null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteCalendarEntry() {
  const invalidate = useInvalidateCalendar();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('calendar_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
