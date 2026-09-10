/**
 * useProjectSetup — supporto al wizard "Nuovo Progetto" e al pannello "Primi passi".
 *
 * Riusa le strutture esistenti:
 *  - projects            (progetto, ora con project_type / budget_estimate)
 *  - project_assignments (livello 2: funzione operativa sul progetto)
 *  - project_members     (accesso al progetto)
 *  - boq_coverage        (macro-gruppi / categorie BOQ pre-attivate dal template)
 *  - project_items       (primi item essenziali)
 *  - project_tasks       (eventuale assegnatario del primo item)
 *  - project_documents   (archivio documenti di progetto, 4 categorie)
 * Nessuna nuova entità "squadra": le persone restano una sola volta, sul progetto.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { uploadWithQuota, describeTierError } from '@/lib/tierLimits';

export type ProjectType = 'residential' | 'commercial' | 'general_contractor';

export const PROJECT_TYPES: { value: ProjectType; label: string; desc: string }[] = [
  { value: 'residential', label: 'Residenziale', desc: 'Ville, appartamenti, interni privati' },
  { value: 'commercial', label: 'Commerciale', desc: 'Uffici, retail, hospitality' },
  { value: 'general_contractor', label: 'General Contractor', desc: 'Appalto completo, tutte le lavorazioni' },
];

/** Macro-gruppi (categorie BOQ) pre-attivati dal template, per tipo progetto. */
export const TEMPLATE_CATEGORIES: Record<ProjectType, string[]> = {
  residential: ['joinery', 'loose-furniture', 'lighting', 'finishes', 'ffe', 'sanitary', 'electrical'],
  commercial: ['joinery', 'finishes', 'lighting', 'ffe', 'hvac', 'electrical', 'low-voltage', 'fire-protection'],
  general_contractor: [
    'joinery', 'loose-furniture', 'lighting', 'finishes', 'ffe', 'accessories', 'appliances',
    'hvac', 'electrical', 'plumbing', 'fire-protection', 'low-voltage', 'sanitary',
  ],
};

export const DOC_CATEGORIES: { value: string; label: string }[] = [
  { value: 'contract', label: 'Contratto' },
  { value: 'floor_plan', label: 'Planimetria' },
  { value: 'budget', label: 'Preventivo / Budget' },
  { value: 'other', label: 'Altro' },
];

export interface OrgPerson {
  id: string;
  display_name: string | null;
  email: string | null;
}

/** Utenti già esistenti nell'organizzazione attiva (qui non si creano utenti). */
export function useOrgPeople() {
  const { activeId } = useActiveOrg();
  return useQuery({
    queryKey: ['org-people-setup', activeId],
    enabled: !!activeId,
    queryFn: async () => {
      const { data: members, error } = await (supabase as any)
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', activeId);
      if (error) throw error;
      const ids = (members ?? []).map((m: any) => m.user_id);
      if (!ids.length) return [] as OrgPerson[];
      const { data: profiles } = await (supabase as any).rpc('directory_profiles', { p_ids: ids });
      return (profiles ?? []) as OrgPerson[];
    },
  });
}

export const personLabel = (p: OrgPerson) => p.display_name || p.email || 'Utente';

/** Codice progetto suggerito, modificabile dall'utente. */
export function suggestProjectCode(name: string, existing: string[]): string {
  const slug = (name || 'PRJ')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3)
    .padEnd(3, 'X');
  const year = new Date().getFullYear();
  const prefix = `${slug}-${year}-`;
  let n = 1;
  const taken = new Set(existing.map((c) => c.toUpperCase()));
  while (taken.has(`${prefix}${String(n).padStart(3, '0')}`)) n += 1;
  return `${prefix}${String(n).padStart(3, '0')}`;
}

export interface ResponsibleInput {
  project_manager?: string | null;
  head_of_design?: string | null;
  site_engineer?: string | null;
}

export interface QuickItemInput {
  description: string;
  category: string;
  assignee_id?: string | null;
}

export interface CreateProjectPayload {
  name: string;
  code: string;
  client: string;
  project_type: ProjectType;
  budget_estimate?: number | null;
  start_date: string;
  target_completion_date: string;
  responsibles: ResponsibleInput;
  /** true = parti dal template (macro-gruppi pre-attivati) */
  useTemplate: boolean;
  quickItems: QuickItemInput[];
}

/** Crea il progetto e tutto il contorno scelto nel wizard / setup manuale. */
export function useCreateProjectSetup() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { activeId } = useActiveOrg();

  return useMutation({
    mutationFn: async (payload: CreateProjectPayload) => {
      if (!user) throw new Error('Devi essere autenticato');

      const { data: project, error } = await supabase
        .from('projects')
        .insert({
          name: payload.name,
          code: payload.code,
          client: payload.client,
          start_date: payload.start_date,
          target_completion_date: payload.target_completion_date,
          owner_id: user.id,
          organization_id: activeId ?? null,
          project_type: payload.project_type,
          budget_estimate: payload.budget_estimate ?? null,
        } as any)
        .select('id')
        .single();
      if (error) throw new Error(describeTierError(error));

      const projectId = (project as any).id as string;

      // Responsabili → livello 2 (assegnazione funzionale) + accesso al progetto
      const roleMap: [keyof ResponsibleInput, string][] = [
        ['project_manager', 'project_manager'],
        ['head_of_design', 'head_of_design'],
        ['site_engineer', 'site_engineer'],
      ];
      for (const [key, fnRole] of roleMap) {
        const uid = payload.responsibles[key];
        if (!uid) continue;
        await (supabase as any).from('project_assignments').insert({
          project_id: projectId, user_id: uid, function_role: fnRole, created_by: user.id,
        });
        await (supabase as any)
          .from('project_members')
          .insert({ project_id: projectId, user_id: uid, role: fnRole });
      }

      // Template → macro-gruppi (categorie BOQ) pre-attivati
      if (payload.useTemplate) {
        const cats = TEMPLATE_CATEGORIES[payload.project_type] ?? [];
        if (cats.length) {
          await (supabase as any).from('boq_coverage').insert(
            cats.map((c) => ({ project_id: projectId, category: c, status: 'to-confirm' }))
          );
        }
      }

      // Primi item essenziali
      for (const qi of payload.quickItems) {
        if (!qi.description.trim()) continue;
        const { data: item } = await (supabase as any)
          .from('project_items')
          .insert({
            project_id: projectId,
            description: qi.description.trim(),
            category: qi.category,
            area: '-',
          })
          .select('id')
          .single();
        if (item && qi.assignee_id) {
          await (supabase as any).from('project_tasks').insert({
            project_id: projectId,
            title: `Prendi in carico: ${qi.description.trim()}`,
            macro_area: 'planning',
            assignee_id: qi.assignee_id,
            linked_item_id: item.id,
          });
        }
      }

      return project as any;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

/** Documenti di progetto (archivio semplice, 4 categorie, nessun effetto sui dati). */
export function useProjectDocuments(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-documents', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('project_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useUploadProjectDocument(projectId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ file, category }: { file: File; category: string }) => {
      if (!projectId || !user) throw new Error('Progetto non valido');
      const safeName = file.name.replace(/[^\w.\-]/g, '_');
      const path = `${projectId}/${crypto.randomUUID()}-${safeName}`;
      await uploadWithQuota('project-docs', path, file);
      const { error } = await (supabase as any).from('project_documents').insert({
        project_id: projectId,
        category,
        file_name: file.name,
        file_path: path,
        uploaded_by: user.id,
      });
      if (error) throw new Error(describeTierError(error));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-documents', projectId] }),
  });
}

export function useDeleteProjectDocument(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (doc: { id: string; file_path: string }) => {
      await supabase.storage.from('project-docs').remove([doc.file_path]);
      const { error } = await (supabase as any).from('project_documents').delete().eq('id', doc.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project-documents', projectId] }),
  });
}

export async function openProjectDocument(path: string) {
  const { data, error } = await supabase.storage.from('project-docs').createSignedUrl(path, 60);
  if (error || !data?.signedUrl) throw new Error('Impossibile aprire il documento');
  window.open(data.signedUrl, '_blank', 'noopener');
}

/** Aggiunge un utente già esistente in azienda al progetto (+ riferimento facoltativo a un gruppo dell'organigramma). */
export function useAddProjectMember(projectId: string | undefined) {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      userId, functionRole, teamNote,
    }: { userId: string; functionRole: string; teamNote?: string | null }) => {
      if (!projectId) throw new Error('Progetto non valido');
      const { error: mErr } = await (supabase as any)
        .from('project_members')
        .insert({ project_id: projectId, user_id: userId, role: functionRole });
      if (mErr && !/duplicate key/i.test(mErr.message)) throw mErr;
      const { error } = await (supabase as any).from('project_assignments').insert({
        project_id: projectId,
        user_id: userId,
        function_role: functionRole,
        notes: teamNote || null,
        created_by: user?.id ?? null,
      });
      if (error && !/duplicate key/i.test(error.message)) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-members-profiles', projectId] });
      qc.invalidateQueries({ queryKey: ['project-assignments', projectId] });
    },
  });
}

/** Chiude definitivamente il pannello "Primi passi". */
export function useDismissProjectSetup(projectId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!projectId) return;
      const { error } = await (supabase as any)
        .from('projects')
        .update({ setup_dismissed_at: new Date().toISOString() })
        .eq('id', projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}
