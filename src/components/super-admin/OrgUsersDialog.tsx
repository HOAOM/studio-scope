/**
 * OrgUsersDialog — elenco membri di un'organizzazione con possibilità, per il
 * platform admin, di impostare direttamente la password di un utente
 * (edge function admin-set-user-password) e di aggiungere utenti extra,
 * eventualmente "omaggio / fuori tier" (non conteggiati nei limiti di piano).
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PasswordInput } from '@/components/ui/password-input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, KeyRound, UserPlus, Gift, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const APP_ROLES = [
  'admin', 'designer', 'accountant', 'qs', 'head_of_payments', 'client', 'ceo',
  'site_engineer', 'project_manager', 'procurement_manager', 'mep_engineer',
  'coo', 'head_of_design', 'architectural_dept',
];

interface Member {
  user_id: string;
  is_owner: boolean;
  email: string | null;
  display_name: string | null;
  is_complimentary?: boolean;
  complimentary_reason?: string | null;
  is_over_tier_limit?: boolean;
  roles?: string[];
}

interface Invite {
  id: string;
  email: string;
  base_role: string;
  is_complimentary: boolean;
  complimentary_reason: string | null;
  is_over_tier_limit?: boolean;
}

export function OrgUsersDialog({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  // form "Aggiungi utente"
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('designer');
  const [freeUser, setFreeUser] = useState(false);
  const [reason, setReason] = useState('');
  const [inviting, setInviting] = useState(false);

  // Quota del tier per il ruolo selezionato nel form "Aggiungi utente"
  const { data: quota } = useQuery({
    queryKey: ['org-role-quota', orgId, newRole],
    enabled: open && adding,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-set-user-password', {
        body: { action: 'role_quota', organization_id: orgId, role: newRole },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { used: number; max: number | null; full: boolean };
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['org-members-admin', orgId],
    enabled: open,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-set-user-password', {
        body: { action: 'list_members', organization_id: orgId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { members: Member[]; invites: Invite[] };
    },
  });
  const members = data?.members ?? [];
  const invites = data?.invites ?? [];

  const submit = async (userId: string) => {
    if (password.length < 8) {
      toast.error('La password deve avere almeno 8 caratteri');
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-user-password', {
        body: { action: 'set_password', user_id: userId, new_password: password },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success('Password aggiornata');
      setEditing(null);
      setPassword('');
    } catch (e: any) {
      toast.error(e?.message ?? 'Errore impostazione password');
    } finally {
      setSaving(false);
    }
  };

  const inviteUser = async () => {
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-user-password', {
        body: {
          action: 'invite_extra_user',
          organization_id: orgId,
          email: newEmail,
          role: newRole,
          is_complimentary: freeUser,
          reason,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.over_tier_limit) {
        toast.warning('Utente creato in eccedenza rispetto al limite del tier');
      }
      toast.success(
        data?.existing_user
          ? 'Utente aggiunto all\u2019organizzazione'
          : data?.email_sent
            ? 'Invito inviato via email'
            : 'Invito creato (email non inviata)',
      );
      setAdding(false);
      setNewEmail(''); setReason(''); setFreeUser(false); setNewRole('designer');
      qc.invalidateQueries({ queryKey: ['org-members-admin', orgId] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Errore aggiunta utente');
    } finally {
      setInviting(false);
    }
  };

  const toggleComplimentary = async (m: Member) => {
    const next = !m.is_complimentary;
    let why = m.complimentary_reason ?? '';
    if (next) {
      why = window.prompt('Motivo dell\u2019eccezione fuori tier:', why) ?? '';
      if (why.trim().length < 3) return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('admin-set-user-password', {
        body: {
          action: 'set_complimentary',
          organization_id: orgId,
          user_id: m.user_id,
          is_complimentary: next,
          reason: why,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(next ? 'Utente segnato come omaggio' : 'Contrassegno omaggio rimosso');
      qc.invalidateQueries({ queryKey: ['org-members-admin', orgId] });
    } catch (e: any) {
      toast.error(e?.message ?? 'Errore aggiornamento');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setEditing(null); setPassword(''); setAdding(false); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs">
          <Users className="w-3.5 h-3.5 mr-1" /> Utenti
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl w-[92vw] max-h-[90vh] p-0 overflow-hidden">
        <div className="flex flex-col h-full">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle>Utenti — {orgName}</DialogTitle>
          </DialogHeader>

          <div className="flex justify-end px-6 py-3 shrink-0 border-b">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAdding((v) => !v)}>
              <UserPlus className="w-3.5 h-3.5 mr-1" /> Aggiungi utente
            </Button>
          </div>

          {adding && (
            <div className="px-6 py-3 space-y-3 shrink-0 border-b bg-muted/30">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input
                    type="email" className="h-8 text-xs" placeholder="nome@studio.com"
                    value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Ruolo</Label>
                  <Select value={newRole} onValueChange={setNewRole}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APP_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <Label className="text-xs">Utente omaggio / fuori tier</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Non conteggiato nei limiti di piano. Registrato nell'audit log.
                  </p>
                </div>
                <Switch checked={freeUser} onCheckedChange={setFreeUser} />
              </div>
              {freeUser && (
                <Input
                  className="h-8 text-xs" placeholder="Motivo dell'eccezione (obbligatorio)"
                  value={reason} onChange={(e) => setReason(e.target.value)}
                />
              )}
              {quota?.full && !freeUser && (
                <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-500">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Il tier ha raggiunto il limite per questo ruolo
                    {quota.max !== null && ` (${quota.used}/${quota.max})`}.
                    L'utente verrà comunque creato in eccedenza.
                  </span>
                </div>
              )}
              <Button
                size="sm" className="h-8 text-xs w-full md:w-auto"
                disabled={inviting || !newEmail || (freeUser && reason.trim().length < 3)}
                onClick={inviteUser}
              >
                {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Conferma'}
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0 space-y-6">
            {isLoading ? (
              <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : members.length === 0 && invites.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nessun membro.</p>
            ) : (
              <>
                {members.length > 0 && (
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-secondary/60 sticky top-0 z-10">
                        <tr>
                          <th className="text-left p-3 font-medium">Utente</th>
                          <th className="text-left p-3 font-medium">Email</th>
                          <th className="text-left p-3 font-medium">Ruoli</th>
                          <th className="text-left p-3 font-medium">Stato</th>
                          <th className="text-right p-3 font-medium">Azioni</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m) => (
                          <tr key={m.user_id} className="border-t border-border">
                            <td className="p-3">
                              <div className="font-medium">{m.display_name || m.email || m.user_id}</div>
                              {m.is_complimentary && m.complimentary_reason && (
                                <div className="text-[11px] text-muted-foreground mt-1">
                                  Motivo: {m.complimentary_reason}
                                </div>
                              )}
                            </td>
                            <td className="p-3 text-muted-foreground">{m.email ?? '—'}</td>
                            <td className="p-3 text-muted-foreground">{m.roles?.join(', ') ?? '—'}</td>
                            <td className="p-3">
                              <div className="flex flex-wrap gap-1">
                                {m.is_owner && <Badge variant="secondary" className="text-[10px]">Owner</Badge>}
                                {m.is_complimentary && (
                                  <Badge className="text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/40">
                                    <Gift className="w-3 h-3 mr-1" /> Omaggio · fuori tier
                                  </Badge>
                                )}
                                {m.is_over_tier_limit && !m.is_complimentary && (
                                  <Badge className="text-[10px] bg-orange-500/20 text-orange-500 border-orange-500/40">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> In eccedenza
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  size="sm" variant="ghost" className="h-7 text-xs"
                                  onClick={() => toggleComplimentary(m)}
                                >
                                  {m.is_complimentary ? 'Rimuovi omaggio' : 'Segna omaggio'}
                                </Button>
                                <Button
                                  size="sm" variant="outline" className="h-7 text-xs"
                                  onClick={() => { setEditing(editing === m.user_id ? null : m.user_id); setPassword(''); }}
                                >
                                  <KeyRound className="w-3.5 h-3.5 mr-1" /> Imposta password
                                </Button>
                              </div>
                              {editing === m.user_id && (
                                <div className="flex items-center gap-2 mt-2 justify-end">
                                  <PasswordInput
                                    autoComplete="new-password"
                                    placeholder="Nuova password (min 8 caratteri)"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="h-8 text-xs max-w-xs"
                                  />
                                  <Button
                                    size="sm" className="h-8 text-xs"
                                    disabled={saving || password.length < 8}
                                    onClick={() => submit(m.user_id)}
                                  >
                                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Conferma'}
                                  </Button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {invites.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Inviti in sospeso</h4>
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/60 sticky top-0 z-10">
                          <tr>
                            <th className="text-left p-3 font-medium">Email</th>
                            <th className="text-left p-3 font-medium">Ruolo</th>
                            <th className="text-left p-3 font-medium">Stato</th>
                            <th className="text-right p-3 font-medium">Azioni</th>
                          </tr>
                        </thead>
                        <tbody>
                          {invites.map((i) => (
                            <tr key={i.id} className="border-t border-border">
                              <td className="p-3">{i.email}</td>
                              <td className="p-3 text-muted-foreground">{i.base_role}</td>
                              <td className="p-3">
                                <div className="flex flex-wrap gap-1">
                                  {i.is_complimentary && (
                                    <Badge className="text-[10px] bg-amber-500/20 text-amber-500 border-amber-500/40">
                                      <Gift className="w-3 h-3 mr-1" /> Omaggio · fuori tier
                                    </Badge>
                                  )}
                                  {i.is_over_tier_limit && !i.is_complimentary && (
                                    <Badge className="text-[10px] bg-orange-500/20 text-orange-500 border-orange-500/40">
                                      <AlertTriangle className="w-3 h-3 mr-1" /> In eccedenza
                                    </Badge>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-right text-muted-foreground text-[11px]">
                                In attesa
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
