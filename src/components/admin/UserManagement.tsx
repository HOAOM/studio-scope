import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Loader2, UserPlus, Trash2, KeyRound, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Constants } from '@/integrations/supabase/types';
import type { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];
const ROLES = Constants.public.Enums.app_role;

interface Profile {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

interface UserRoleRow {
  id: string;
  user_id: string;
  role: AppRole;
}

export function UserManagement() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>('designer');
  const [inviting, setInviting] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('admin-users', {
        body: { action: 'list_users' },
      });
      if (res.error) throw res.error;
      setProfiles(res.data.profiles || []);
      setRoles(res.data.roles || []);
    } catch (e: any) {
      toast.error(e.message || 'Error loading users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) { toast.error('Inserisci una email'); return; }
    setInviting(true);
    try {
      const res = await supabase.functions.invoke('admin-users', {
        body: { action: 'invite', email: inviteEmail.trim(), role: inviteRole },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast.success(`Utente ${inviteEmail} creato con ruolo ${inviteRole}`);
      setInviteEmail('');
      setInviteOpen(false);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || 'Errore nella creazione utente');
    } finally {
      setInviting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUserId) return;
    setDeleting(true);
    try {
      const res = await supabase.functions.invoke('admin-users', {
        body: { action: 'delete', user_id: deleteUserId },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Utente eliminato');
      setDeleteUserId(null);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || 'Errore eliminazione utente');
    } finally {
      setDeleting(false);
    }
  };

  const handleRoleChange = async (userId: string, oldRole: AppRole | null, newRole: AppRole) => {
    try {
      const res = await supabase.functions.invoke('admin-users', {
        body: { action: 'update_role', user_id: userId, old_role: oldRole, new_role: newRole },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Ruolo aggiornato');
      fetchUsers();
    } catch (e: any) {
      toast.error(e.message || 'Errore aggiornamento ruolo');
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      const res = await supabase.functions.invoke('admin-users', {
        body: { action: 'reset_password', email },
      });
      if (res.error) throw res.error;
      if (res.data?.error) throw new Error(res.data.error);
      setResetResult({ email, password: res.data.temp_password });
    } catch (e: any) {
      toast.error(e.message || 'Errore reset password');
    }
  };

  const getUserRole = (userId: string): AppRole | null => {
    const r = roles.find(r => r.user_id === userId);
    return r ? r.role : null;
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-foreground">Gestione Utenti</h3>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchUsers} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Aggiorna
            </Button>
            <Button size="sm" onClick={() => setInviteOpen(true)}>
              <UserPlus className="w-4 h-4 mr-1" />
              Invita Utente
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Nome</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Ruolo</th>
                  <th className="px-4 py-3 w-24 text-center text-xs font-medium text-muted-foreground">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {profiles.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Nessun utente trovato</td></tr>
                ) : (
                  profiles.map(p => {
                    const role = getUserRole(p.id);
                    return (
                      <tr key={p.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm text-foreground font-medium">{p.display_name || '—'}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{p.email}</td>
                        <td className="px-4 py-3">
                          <Select
                            value={role || ''}
                            onValueChange={(v) => handleRoleChange(p.id, role, v as AppRole)}
                          >
                            <SelectTrigger className="w-40 h-8 text-xs">
                              <SelectValue placeholder="Nessun ruolo" />
                            </SelectTrigger>
                            <SelectContent>
                              {ROLES.map(r => (
                                <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 justify-center">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Reset password"
                              onClick={() => handleResetPassword(p.email)}>
                              <KeyRound className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="Elimina utente"
                              onClick={() => setDeleteUserId(p.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Invite Dialog */}
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Invita Nuovo Utente</DialogTitle>
              <DialogDescription>Crea un account per un nuovo membro del team.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Email</label>
                <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@esempio.com" type="email" />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground mb-1 block">Ruolo</label>
                <Select value={inviteRole} onValueChange={v => setInviteRole(v as AppRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInviteOpen(false)}>Annulla</Button>
              <Button onClick={handleInvite} disabled={inviting}>
                {inviting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <UserPlus className="w-4 h-4 mr-1" />}
                Crea Utente
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirm */}
        <AlertDialog open={!!deleteUserId} onOpenChange={(open) => !open && setDeleteUserId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Elimina Utente</AlertDialogTitle>
              <AlertDialogDescription>Questa azione è irreversibile. L'utente e tutti i suoi dati verranno eliminati.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annulla</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Trash2 className="w-4 h-4 mr-1" />}
                Elimina
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reset Password Result */}
        <Dialog open={!!resetResult} onOpenChange={(open) => !open && setResetResult(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Password Temporanea</DialogTitle>
              <DialogDescription>Comunica questa password temporanea all'utente. Dovrà cambiarla al primo accesso.</DialogDescription>
            </DialogHeader>
            {resetResult && (
              <div className="space-y-3 py-4">
                <div>
                  <label className="text-xs text-muted-foreground">Email</label>
                  <p className="text-sm font-medium text-foreground">{resetResult.email}</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Password temporanea</label>
                  <div className="flex gap-2 items-center">
                    <code className="text-sm bg-muted px-3 py-2 rounded font-mono flex-1">{resetResult.password}</code>
                    <Button variant="outline" size="sm" onClick={() => {
                      navigator.clipboard.writeText(resetResult.password);
                      toast.success('Copiata!');
                    }}>Copia</Button>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setResetResult(null)}>Chiudi</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
