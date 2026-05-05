import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditLogFilters {
  page?: number;
  dateFrom?: string; // ISO date
  dateTo?: string;   // ISO date
  userId?: string;
  action?: string;   // 'all' or specific
}

export interface AuditLogRow {
  id: string;
  entity_type: string;
  entity_id: string;
  action: string;
  user_id: string | null;
  summary: string;
  created_at: string;
  user_email?: string | null;
  user_display_name?: string | null;
}

const PAGE_SIZE = 50;

export function useAuditLog(filters: AuditLogFilters = {}) {
  const { page = 1, dateFrom, dateTo, userId, action } = filters;

  return useQuery({
    queryKey: ['audit_log', page, dateFrom, dateTo, userId, action],
    queryFn: async () => {
      let q = supabase
        .from('audit_log')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo);
      if (userId && userId !== 'all') q = q.eq('user_id', userId);
      if (action && action !== 'all') q = q.eq('action', action);

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      q = q.range(from, to);

      const { data, error, count } = await q;
      if (error) throw error;

      const rows = (data || []) as any[];
      const userIds = Array.from(new Set(rows.map(r => r.user_id).filter(Boolean)));

      let profilesMap: Record<string, { email: string | null; display_name: string | null }> = {};
      if (userIds.length) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, display_name')
          .in('id', userIds);
        (profiles || []).forEach((p: any) => {
          profilesMap[p.id] = { email: p.email, display_name: p.display_name };
        });
      }

      const enriched: AuditLogRow[] = rows.map(r => ({
        ...r,
        user_email: r.user_id ? profilesMap[r.user_id]?.email ?? null : null,
        user_display_name: r.user_id ? profilesMap[r.user_id]?.display_name ?? null : null,
      }));

      return {
        rows: enriched,
        total: count ?? 0,
        page,
        pageSize: PAGE_SIZE,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
      };
    },
  });
}

export function useAuditLogActions() {
  return useQuery({
    queryKey: ['audit_log_actions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('action')
        .limit(1000);
      if (error) throw error;
      const set = new Set<string>();
      (data || []).forEach((r: any) => r.action && set.add(r.action));
      return Array.from(set).sort();
    },
  });
}

export function useAuditLogUsers() {
  return useQuery({
    queryKey: ['audit_log_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('user_id')
        .not('user_id', 'is', null)
        .limit(1000);
      if (error) throw error;
      const ids = Array.from(new Set((data || []).map((r: any) => r.user_id)));
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, display_name')
        .in('id', ids);
      return (profiles || []) as { id: string; email: string | null; display_name: string | null }[];
    },
  });
}
