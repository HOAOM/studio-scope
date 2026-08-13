/**
 * ProjectAssignmentsPanel — Level 2 of the role model.
 * Assign organization members to a specific project with an operational
 * function (e.g. Tony = Purchasing on Project A). Independent from the
 * organization roles: the same person can be assigned to many projects,
 * or to none.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Trash2, FolderKanban } from 'lucide-react';
import { toast } from 'sonner';
import { ORG_ROLES, roleLabel } from '@/lib/roles';

interface AssignmentRow {
  id: string;
  user_id: string;
  function_role: string;
  created_at: string;
  display_name?: string | null;
  email?: string | null;
}

export function ProjectAssignmentsPanel() {
  const { activeOrg } = useActiveOrg();
  const qc = useQueryClient();
  const [projectId, setProjectId] = useState<string>('');
  const [userId, setUserId] = useState<string>('');
  const [fn, setFn] = useState<string>('project_manager');

  const { data: projects = [] } = useQuery({
    queryKey: ['org-projects-lite', activeOrg?.organization_id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('projects')
        .select('id, code, name')
        .eq('organization_id', activeOrg!.organization_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; code: string; name: string }[];
    },
  });

  const { data: people = [] } = useQuery({
    queryKey: ['org-people', activeOrg?.organization_id],
    enabled: !!activeOrg,
    queryFn: async () => {
      const { data: m, error } = await (supabase as any)
        .from('organization_members')
        .select('user_id')
        .eq('organization_id', activeOrg!.organization_id);
      if (error) throw error;
      const ids = (m ?? []).map((x: any) => x.user_id);
      if (!ids.length) return [];
      const { data: profiles } = await (supabase as any)
        .from('profiles').select('id, display_name, email').in('id', ids);
      return (profiles ?? []) as { id: string; display_name: string | null; email: string | null }[];
    },
  });

  const { data: assignments = [], isLoading } = useQuery<AssignmentRow[]>({
    queryKey: ['project-assignments', projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('project_assignments')
        .select('id, user_id, function_role, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as AssignmentRow[];
      const ids = [...new Set(rows.map((r) => r.user_id))];
      if (!ids.length) return rows;
      const { data: profiles } = await (supabase as any)
        .from('profiles').select('id, display_name, email').in('id', ids);
      const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      return rows.map((r) => ({
        ...r,
        display_name: (map.get(r.user_id) as any)?.display_name,
        email: (map.get(r.user_id) as any)?.email,
      }));
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from('project_assignments').insert({
        project_id: projectId,
        user_id: userId,
        function_role: fn,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-assignments', projectId] });
      toast.success('Assegnazione creata');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Assegnazione fallita'),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('project_assignments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['project-assignments', projectId] });
      toast.success('Assegnazione rimossa');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Rimozione fallita'),
  });

  const personLabel = (p: { display_name: string | null; email: string | null }) =>
    p.display_name || p.email || 'Utente';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderKanban className="w-4 h-4" /> Assegnazioni per progetto
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4 items-end">
            <div className="space-y-1.5 md:col-span-2">
              <Label>Progetto</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder="Seleziona progetto" /></SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.code} — {p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Persona</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger><SelectValue placeholder="Seleziona persona" /></SelectTrigger>
                <SelectContent>
                  {people.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{personLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Funzione sul progetto</Label>
              <Select value={fn} onValueChange={setFn}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORG_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            disabled={!projectId || !userId || add.isPending}
            onClick={() => add.mutate()}
          >
            {add.isPending
              ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              : <Plus className="w-4 h-4 mr-2" />}
            Assegna al progetto
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Persone assegnate</CardTitle>
        </CardHeader>
        <CardContent>
          {!projectId ? (
            <p className="text-sm text-muted-foreground">Seleziona un progetto.</p>
          ) : isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna assegnazione su questo progetto.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Funzione</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.display_name ?? '—'}</TableCell>
                    <TableCell className="text-xs">{a.email ?? '—'}</TableCell>
                    <TableCell><Badge variant="secondary">{roleLabel(a.function_role)}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
