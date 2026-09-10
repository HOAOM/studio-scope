import type { Database } from '@/integrations/supabase/types';
import type { CostField } from '@/hooks/useItemCosts';

export type ProjectItem = Database['public']['Tables']['project_items']['Row'] &
  Partial<Record<CostField, number | null>>;

export type ProjectItemInsert = Database['public']['Tables']['project_items']['Insert'] &
  Partial<Record<CostField, number | null>>;

export type ProjectItemUpdate = Database['public']['Tables']['project_items']['Update'] &
  Partial<Record<CostField, number | null>>;