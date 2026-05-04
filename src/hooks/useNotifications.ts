import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  item_id: string | null;
  project_id: string | null;
  read: boolean;
  created_at: string;
}

const sb = supabase as any;

export function useNotifications() {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['notifications', user?.id],
    enabled: !!user,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await sb
        .from('notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as AppNotification[];
    },
  });

  const unreadCount = (query.data || []).filter(n => !n.read).length;
  return { ...query, unreadCount };
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('notifications').update({ read: true }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await sb
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications', user?.id] }),
  });
}

export async function createNotification(input: {
  user_id: string;
  type: string;
  title: string;
  body?: string | null;
  item_id?: string | null;
  project_id?: string | null;
}) {
  const { error } = await sb.from('notifications').insert(input);
  if (error) console.error('createNotification failed', error);
}
