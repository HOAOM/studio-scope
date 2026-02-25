import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, UserPlus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  designer: 'Designer',
  accountant: 'Accountant',
  qs: 'QS / Preventivista',
  head_of_payments: 'Head of Payments',
  client: 'Client',
  ceo: 'CEO',
  site_engineer: 'Site Engineer',
  project_manager: 'Project Manager',
  procurement_manager: 'Procurement Manager',
  mep_engineer: 'MEP Engineer',
};

interface Profile {
  id: string;
  email: string;
  display_name: string;
}

interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile?: Profile;
}

interface TeamManagementProps {
  projectId: string;
}

export function TeamManagement({ projectId }: TeamManagementProps) {
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('designer');
  const [adding, setAdding] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch profiles and members via edge function
      const [profilesRes, membersRes] = await Promise.all([
        supabase.functions.invoke('admin-users', { body: { action: 'list_users' } }),
        supabase.functions.invoke('admin-users', { body: { action: 'list_project_members', project_id: projectId } }),
      ]);

      const profiles: Profile[] = profilesRes.data?.profiles || [];
      const rawMembers = membersRes.data?.members || [];

      setAllProfiles(profiles);
      setMembers(rawMembers.map((m: any) => ({
        ...m,
        profile: profiles.find((p: Profile) => p.id === m.user_id),
      })));
    } catch (e: any) {
      toast.error('Error loading team');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [projectId]);

  const availableUsers = allProfiles.filter(
    p => !members.some(m => m.user_id === p.id)
  );

  const handleAdd = async () => {
    if (!selectedUserId) { toast.error('Seleziona un utente'); return; }
    setAdding(true);
    try {
      const res = await supabase.functions.invoke('admin-users', {
        body: { action: 'add_project_member', project_id: projectId, user_id: selectedUserId, role: selectedRole },
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Membro aggiunto al progetto');
      setSelectedUserId('');
      fetchData();
    } catch (e: any) {
      toast.error(e.message || 'Errore');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await supabase.functions.invoke('admin-users', {
        body: { action: 'remove_project_member', member_id: deleteId },
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Membro rimosso');
      setDeleteId(null);
      fetchData();
    } catch {
      toast.error('Errore rimozione');
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    try {
      const res = await supabase.functions.invoke('admin-users', {
        body: { action: 'update_project_member_role', member_id: memberId, new_role: newRole },
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Ruolo aggiornato');
      fetchData();
    } catch {
      toast.error('Errore aggiornamento ruolo');
    }
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold text-foreground">Project Team</h3>
      </div>

      {/* Add member */}
      <div className="flex gap-2 mb-4 items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Utente</label>
          <Select value={selectedUserId} onValueChange={setSelectedUserId}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue placeholder="Seleziona utente..." />
            </SelectTrigger>
            <SelectContent>
              {availableUsers.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-sm">
                  {p.display_name || p.email} ({p.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-44">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Ruolo</label>
          <Select value={selectedRole} onValueChange={setSelectedRole}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ROLE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k} className="text-sm">{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={handleAdd} disabled={adding}>
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />}
          Aggiungi
        </Button>
      </div>

      {/* Members list */}
      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">Nessun membro assegnato</p>
      ) : (
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Nome</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Email</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Ruolo</th>
                <th className="px-3 py-2 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2 text-sm text-foreground">{m.profile?.display_name || '—'}</td>
                  <td className="px-3 py-2 text-sm text-muted-foreground">{m.profile?.email || m.user_id}</td>
                  <td className="px-3 py-2">
                    <Select value={m.role} onValueChange={(v) => handleRoleChange(m.id, v)}>
                      <SelectTrigger className="w-40 h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(ROLE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k} className="text-xs">{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteId(m.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rimuovi Membro</AlertDialogTitle>
            <AlertDialogDescription>L'utente non avrà più accesso a questo progetto.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Rimuovi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
