import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useEffect } from 'react';

export interface ItemMessage {
  id: string;
  project_item_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface DirectMessage {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

export function useItemMessages(itemId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['item-messages', itemId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('item_messages')
        .select('*')
        .eq('project_item_id', itemId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as ItemMessage[];
    },
    enabled: !!itemId,
  });

  // Realtime subscription
  useEffect(() => {
    if (!itemId) return;
    const channel = supabase
      .channel(`item-messages-${itemId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'item_messages',
        filter: `project_item_id=eq.${itemId}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['item-messages', itemId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [itemId, qc]);

  return query;
}

export function useSendItemMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ itemId, body }: { itemId: string; body: string }) => {
      const { error } = await (supabase as any)
        .from('item_messages')
        .insert({ project_item_id: itemId, sender_id: user?.id, body });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['item-messages', vars.itemId] });
    },
  });
}

// Direct messages
export function useDirectConversations() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['dm-conversations', user?.id],
    queryFn: async () => {
      if (!user) return [];
      // Get all DMs involving current user, grouped by conversation partner
      const { data, error } = await (supabase as any)
        .from('direct_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      if (error) throw error;

      // Group by conversation partner
      const convMap = new Map<string, DirectMessage[]>();
      for (const msg of (data || []) as DirectMessage[]) {
        const partnerId = msg.sender_id === user.id ? msg.recipient_id : msg.sender_id;
        if (!convMap.has(partnerId)) convMap.set(partnerId, []);
        convMap.get(partnerId)!.push(msg);
      }
      return Array.from(convMap.entries()).map(([partnerId, messages]) => ({
        partnerId,
        lastMessage: messages[0],
        unreadCount: messages.filter(m => m.recipient_id === user.id && !m.read_at).length,
      }));
    },
    enabled: !!user,
  });

  // Realtime
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`dms-${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
      }, () => {
        qc.invalidateQueries({ queryKey: ['dm-conversations', user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  return query;
}

export function useDirectMessages(partnerId: string | undefined) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['direct-messages', user?.id, partnerId],
    queryFn: async () => {
      if (!user || !partnerId) return [];
      const { data, error } = await (supabase as any)
        .from('direct_messages')
        .select('*')
        .or(`and(sender_id.eq.${user.id},recipient_id.eq.${partnerId}),and(sender_id.eq.${partnerId},recipient_id.eq.${user.id})`)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as DirectMessage[];
    },
    enabled: !!user && !!partnerId,
  });

  // Mark as read
  useEffect(() => {
    if (!user || !partnerId || !query.data?.length) return;
    const unread = query.data.filter(m => m.recipient_id === user.id && !m.read_at);
    if (unread.length > 0) {
      (supabase as any)
        .from('direct_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unread.map(m => m.id))
        .then(() => {
          qc.invalidateQueries({ queryKey: ['dm-conversations', user.id] });
        });
    }
  }, [query.data, user, partnerId, qc]);

  // Realtime
  useEffect(() => {
    if (!user || !partnerId) return;
    const channel = supabase
      .channel(`dm-${user.id}-${partnerId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
      }, () => {
        qc.invalidateQueries({ queryKey: ['direct-messages', user.id, partnerId] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, partnerId, qc]);

  return query;
}

export function useSendDirectMessage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ recipientId, body }: { recipientId: string; body: string }) => {
      const { error } = await (supabase as any)
        .from('direct_messages')
        .insert({ sender_id: user?.id, recipient_id: recipientId, body });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dm-conversations'] });
      qc.invalidateQueries({ queryKey: ['direct-messages'] });
    },
  });
}
