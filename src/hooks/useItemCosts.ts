import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Fase 3 — Isolamento dati costo/margine.
 *
 * Unico punto di accesso ai dati economici degli item. I costi NON vivono più
 * (logicamente) su project_items: la tabella project_item_costs è protetta da
 * can_see_costs() e restituisce zero righe ai ruoli senza visibilità costi.
 *
 * Nessun componente deve leggere item.unit_cost & co. da una query propria:
 * passa sempre da qui (direttamente o tramite gli item già arricchiti da
 * useProjectItems, che usa questo hook).
 */

export const COST_FIELDS = [
  'unit_cost',
  'budget_unit_cost',
  'budget_estimate',
  'selling_price',
  'margin_percentage',
  'delivery_cost',
  'installation_cost',
  'insurance_cost',
  'duty_cost',
  'custom_cost',
  'boxing_cost',
  'shifting_cost',
  'extra_safe_cost',
] as const;

export type CostField = (typeof COST_FIELDS)[number];

export type ItemCosts = { item_id: string; project_id: string } & {
  [K in CostField]?: number | null;
};

export type CostsById = Record<string, ItemCosts>;

/** Separa i campi economici dal resto di un payload di scrittura item. */
export function splitCostFields<T extends Record<string, any>>(payload: T) {
  const costs: Record<string, any> = {};
  const rest: Record<string, any> = {};
  for (const [k, v] of Object.entries(payload)) {
    if ((COST_FIELDS as readonly string[]).includes(k)) costs[k] = v;
    else rest[k] = v;
  }
  return { costs, rest, hasCosts: Object.keys(costs).length > 0 };
}

/** Unisce in memoria i valori economici agli item (solo se l'utente li può vedere). */
export function mergeItemCosts<T extends { id: string }>(items: T[], costsById: CostsById): T[] {
  if (!items?.length) return items ?? [];
  return items.map((it) => {
    const c = costsById[it.id];
    if (!c) return it;
    const merged: any = { ...it };
    for (const f of COST_FIELDS) merged[f] = c[f] ?? null;
    return merged as T;
  });
}

async function fetchCosts(filter: (q: any) => any): Promise<CostsById> {
  const { data, error } = await filter(
    (supabase as any).from('project_item_costs').select('*')
  );
  // RLS: un ruolo senza visibilità costi riceve semplicemente zero righe.
  if (error) return {};
  const map: CostsById = {};
  for (const row of (data || []) as ItemCosts[]) map[row.item_id] = row;
  return map;
}

/** Costi di tutti gli item di un progetto. */
export function useItemCosts(projectId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['item-costs', projectId],
    queryFn: async () => {
      if (!projectId) return {} as CostsById;
      return fetchCosts((q: any) => q.eq('project_id', projectId));
    },
    enabled: !!user && !!projectId,
  });
}

/** Costi di un insieme puntuale di item (scheda item + sue opzioni). */
export function useItemCostsByIds(itemIds: string[]) {
  const { user } = useAuth();
  const key = [...itemIds].sort().join(',');

  return useQuery({
    queryKey: ['item-costs-ids', key],
    queryFn: async () => {
      if (!itemIds.length) return {} as CostsById;
      return fetchCosts((q: any) => q.in('item_id', itemIds));
    },
    enabled: !!user && itemIds.length > 0,
  });
}

/** Scrittura centralizzata dei valori economici sulla tabella protetta. */
export function useUpsertItemCosts() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      itemId,
      projectId,
      values,
    }: {
      itemId: string;
      projectId: string;
      values: Record<string, any>;
    }) => {
      const { error } = await (supabase as any)
        .from('project_item_costs')
        .upsert(
          {
            item_id: itemId,
            project_id: projectId,
            ...values,
            updated_at: new Date().toISOString(),
            updated_by: user?.id ?? null,
          },
          { onConflict: 'item_id' }
        );
      if (error) throw error;
      return { itemId, projectId };
    },
    onSuccess: ({ projectId }) => {
      queryClient.invalidateQueries({ queryKey: ['item-costs', projectId] });
      queryClient.invalidateQueries({ queryKey: ['item-costs-ids'] });
    },
  });
}

/** Upsert diretto (fuori da React Query) usato dalle mutation item centralizzate. */
export async function upsertItemCosts(
  itemId: string,
  projectId: string,
  values: Record<string, any>,
  userId?: string | null
) {
  const { error } = await (supabase as any).from('project_item_costs').upsert(
    {
      item_id: itemId,
      project_id: projectId,
      ...values,
      updated_at: new Date().toISOString(),
      updated_by: userId ?? null,
    },
    { onConflict: 'item_id' }
  );
  if (error) throw error;
}
