import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Database } from '@/integrations/supabase/types';

type MasterFloor = Database['public']['Tables']['master_floors']['Row'];
type MasterRoom = Database['public']['Tables']['master_rooms']['Row'];
type MasterItemType = Database['public']['Tables']['master_item_types']['Row'];
type MasterSubcategory = Database['public']['Tables']['master_subcategories']['Row'];
type CostCategory = Database['public']['Tables']['cost_categories']['Row'];
type UserRole = Database['public']['Tables']['user_roles']['Row'];

// ── Floors ──
export function useFloors() {
  return useQuery({
    queryKey: ['master_floors'],
    queryFn: async () => {
      const { data, error } = await supabase.from('master_floors').select('*').order('sort_order');
      if (error) throw error;
      return data as MasterFloor[];
    },
  });
}

export function useUpsertFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (floor: { id?: string; name: string; code: string; sort_order?: number }) => {
      if (floor.id) {
        const { error } = await supabase.from('master_floors').update({ name: floor.name, code: floor.code, sort_order: floor.sort_order ?? 0 }).eq('id', floor.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('master_floors').insert({ name: floor.name, code: floor.code, sort_order: floor.sort_order ?? 0 });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_floors'] }),
  });
}

export function useDeleteFloor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('master_floors').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_floors'] }),
  });
}

// ── Rooms ──
export function useRooms() {
  return useQuery({
    queryKey: ['master_rooms'],
    queryFn: async () => {
      const { data, error } = await supabase.from('master_rooms').select('*').order('sort_order');
      if (error) throw error;
      return data as MasterRoom[];
    },
  });
}

export function useUpsertRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (room: { id?: string; name: string; code: string; sort_order?: number }) => {
      if (room.id) {
        const { error } = await supabase.from('master_rooms').update({ name: room.name, code: room.code, sort_order: room.sort_order ?? 0 }).eq('id', room.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('master_rooms').insert({ name: room.name, code: room.code, sort_order: room.sort_order ?? 0 });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_rooms'] }),
  });
}

export function useDeleteRoom() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('master_rooms').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_rooms'] }),
  });
}

// ── Item Types ──
export function useItemTypes() {
  return useQuery({
    queryKey: ['master_item_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('master_item_types').select('*').order('sort_order');
      if (error) throw error;
      return data as MasterItemType[];
    },
  });
}

export function useUpsertItemType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: { id?: string; name: string; code: string; sort_order?: number; allowed_categories?: string[] }) => {
      const payload: any = { name: item.name, code: item.code, sort_order: item.sort_order ?? 0 };
      if (item.allowed_categories !== undefined) payload.allowed_categories = item.allowed_categories;
      if (item.id) {
        const { error } = await supabase.from('master_item_types').update(payload).eq('id', item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('master_item_types').insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_item_types'] }),
  });
}

export function useDeleteItemType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('master_item_types').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_item_types'] }),
  });
}

// ── Subcategories ──
export function useSubcategories() {
  return useQuery({
    queryKey: ['master_subcategories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('master_subcategories').select('*, master_item_types(name, code)').order('sort_order');
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertSubcategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sub: { id?: string; name: string; code: string; item_type_id: string; sort_order?: number }) => {
      if (sub.id) {
        const { error } = await supabase.from('master_subcategories').update({ name: sub.name, code: sub.code, item_type_id: sub.item_type_id, sort_order: sub.sort_order ?? 0 }).eq('id', sub.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('master_subcategories').insert({ name: sub.name, code: sub.code, item_type_id: sub.item_type_id, sort_order: sub.sort_order ?? 0 });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_subcategories'] }),
  });
}

export function useDeleteSubcategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('master_subcategories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['master_subcategories'] }),
  });
}

// ── Cost Categories ──
export function useCostCategories() {
  return useQuery({
    queryKey: ['cost_categories'],
    queryFn: async () => {
      const { data, error } = await supabase.from('cost_categories').select('*').order('sort_order');
      if (error) throw error;
      return data as CostCategory[];
    },
  });
}

export function useUpsertCostCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cat: { id?: string; name: string; code: string; sort_order?: number; is_active?: boolean }) => {
      if (cat.id) {
        const { error } = await supabase.from('cost_categories').update({ name: cat.name, code: cat.code, sort_order: cat.sort_order ?? 0, is_active: cat.is_active ?? true }).eq('id', cat.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cost_categories').insert({ name: cat.name, code: cat.code, sort_order: cat.sort_order ?? 0, is_active: cat.is_active ?? true });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost_categories'] }),
  });
}

export function useDeleteCostCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cost_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cost_categories'] }),
  });
}

// ── User Roles ──
export function useUserRoles() {
  return useQuery({
    queryKey: ['user_roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('user_roles').select('*');
      if (error) throw error;
      return data as UserRole[];
    },
  });
}

export function useAddUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (role: { user_id: string; role: Database['public']['Enums']['app_role'] }) => {
      const { error } = await supabase.from('user_roles').insert(role);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_roles'] }),
  });
}

export function useDeleteUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user_roles'] }),
  });
}

// ── Admin check ──
export function useIsAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['is_admin', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'admin');
      if (error) return false;
      return (data?.length ?? 0) > 0;
    },
    enabled: !!user,
  });
}
