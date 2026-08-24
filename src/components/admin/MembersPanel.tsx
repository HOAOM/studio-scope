/**
 * MembersPanel — manage members and invites of the active organization.
 * Shown in AdminPanel under the "Members" tab.
 *
 * Capabilities:
 *  - List current members
 *  - Invite by email (calls edge function invite-member)
 *  - Revoke pending invites
 *  - Remove members (owner only; cannot remove the only owner)
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { useEffectiveOwner } from '@/hooks/useEffectiveOwner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Mail, Trash2, Copy, UserPlus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { ORG_ROLES, roleLabel } from '@/lib/roles';

interface OrgMemberRow {
  id: string;
  user_id: string;
  is_owner: boolean;
  joined_at: string;
  email?: string;
  display_name?: string;
}


interface OrgInviteRow {
  id: string;
  email: string;
  base_role: string;
  status: string;
  expires_at: string;
  token: string;
  created_at: string;
}

export function MembersPanel() {
  const { activeOrg, isLoading } = useActiveOrg();
  const { isEffectiveOwner, consoleIntent } = useEffectiveOwner();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('designer');
  const [domainWarning, setDomainWarning] = useState<string | null>(null);

  /** Verifica coerenza dominio email con quello dell'organizzazione (owner/primo membro). */
  const submitInvite = async () => {
    if (!activeOrg || !email) return;
    try {
      const { data } = await (supabase as any).rpc('record_invite_domain', {
        p_org: activeOrg.organization_id,
        p_email: email.trim().toLowerCase(),
      });
      if (data?.mismatch) {
        setDomainWarning(data.primary_domain as string);
        return;
      }
    } catch {
      /* controllo non bloccante */
    }
    invite.mutate();
  };


  /**
   * Una sola query che carica membri, ruoli e inviti in parallelo (Promise.all).
   * I profili richiedono gli id dei membri, quindi restano un secondo round-trip.
   */
  const { data: directory } = useQuery<{
    members: OrgMemberRow[];
    orgRoles: { id: string; user_id: string; role: string }[];
    invites: OrgInviteRow[];
  }>({
    queryKey: ['org-directory', activeOrg?.organization_id],
    enabled: !!activeOrg,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const orgId = activeOrg!.organization_id;
      const [mRes, rRes, iRes] = await Promise.all([
        (supabase as any)
          .from('organization_members')
          .select('id, user_id, is_owner, joined_at')
          .eq('organization_id', orgId),
        (supabase as any)
          .from('user_roles')
          .select('id, user_id, role')
          .eq('organization_id', orgId),
        (supabase as any)
          .from('organization_invites')
          .select('id, email, base_role, status, expires_at, token, created_at')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: false }),
      ]);
      if (mRes.error) throw mRes.error;
      if (rRes.error) throw rRes.error;
      if (iRes.error) throw iRes.error;

      const rows = (mRes.data ?? []) as any[];
      let members: OrgMemberRow[] = rows;
      const ids = rows.map((x) => x.user_id);
      if (ids.length) {
        const { data: profiles } = await (supabase as any)
          .rpc('directory_profiles', { p_ids: ids });
        const map = new Map((profiles ?? []).map((p: any) => [p.id, p]));
        members = rows.map((row) => ({
          ...row,
          email: (map.get(row.user_id) as any)?.email,
          display_name: (map.get(row.user_id) as any)?.display_name,
        }));
      }
      return { members, orgRoles: rRes.data ?? [], invites: iRes.data ?? [] };
    },
  });

  const members = directory?.members ?? [];
  const orgRoles = directory?.orgRoles ?? [];
  const invites = directory?.invites ?? [];

  const toggleRole = useMutation({
    mutationFn: async ({ userId, role, on }: { userId: string; role: string; on: boolean }) => {
      if (on) {
        const { error } = await (supabase as any).from('user_roles').insert({
          user_id: userId, role, organization_id: activeOrg!.organization_id,
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from('user_roles').delete()
          .eq('user_id', userId).eq('role', role)
          .eq('organization_id', activeOrg!.organization_id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-directory'] }),
    onError: (e: any) => toast.error(e?.message ?? 'Aggiornamento ruolo fallito'),
  });

  const invite = useMutation({
    mutationFn: async () => {
      if (!activeOrg) throw new Error('No active organization');
      const { data, error } = await supabase.functions.invoke('invite-member', {
        body: {
          organization_id: activeOrg.organization_id,
          email: email.trim().toLowerCase(),
          base_role: role,
          // Intento esplicito: invito eseguito dal pannello admin sull'org
          // attualmente in View-as (il server valida comunque la sessione).
          console_intent: consoleIntent,
        },
      });
      if (error) {
        // Estrae il messaggio chiaro (es. limite posti raggiunto) dalla risposta
        let detail = '';
        try {
          const body = await (error as any)?.context?.json?.();
          detail = body?.detail || body?.error || '';
        } catch { /* body non JSON */ }
        throw new Error(detail || error.message || 'Invite failed');
      }

      return data as { accept_url: string; email_sent: boolean; existing_user: boolean };
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['org-directory'] });
      setEmail('');
      if (data.email_sent) {
        toast.success('Invite email sent');
      } else {
        toast.success('Invite created', {
          description: 'User already exists — share the link manually.',
        });
        navigator.clipboard?.writeText(data.accept_url).catch(() => {});
      }
    },
    onError: (e: any) => toast.error(e?.message ?? 'Invite failed'),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from('organization_invites').update({ status: 'revoked' }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-directory'] });
      toast.success('Invite revoked');
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await (supabase as any)
        .from('organization_members').delete().eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-directory'] });
      toast.success('Member removed');
    },
    onError: (e: any) => toast.error(e?.message ?? 'Remove failed'),
  });

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin" />;
  if (!activeOrg) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground space-y-3">
          <p>No active organization selected.</p>
          <p className="text-xs">
            If you are a StudioScope super-admin, use{' '}
            <a href="/super-admin" className="text-primary underline">Super-Admin → Organizations</a>{' '}
            to create or impersonate a client organization. Otherwise, ask your studio owner for an invite.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Diritti dell'owner: reali oppure ereditati in View-as (regola unica di
  // piattaforma, vedi useEffectiveOwner / effectiveOwnerContext lato server).
  const isOwner = isEffectiveOwner;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Invite a member to {activeOrg.name}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!isOwner ? (
            <p className="text-sm text-muted-foreground">
              Only the organization owner can invite members.
            </p>
          ) : (
            <form
              className="flex flex-col md:flex-row gap-3 items-end"
              onSubmit={(e) => { e.preventDefault(); submitInvite(); }}
            >
              <div className="flex-1 space-y-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="person@studio.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="w-full md:w-56 space-y-1.5">
                <Label htmlFor="invite-role">Role</Label>
                <Select value={role} onValueChange={setRole}>
                  <SelectTrigger id="invite-role">
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {ORG_ROLES.filter((r) => isOwner || r !== 'admin').map((r) => (
                      <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                    ))}

                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" disabled={invite.isPending || !email}>
                {invite.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                <Mail className="w-4 h-4 mr-2" /> Send invite
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Pending invites</CardTitle></CardHeader>
        <CardContent>
          {invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No invites yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => {
                  const url = `${window.location.origin}/accept-invite?token=${inv.token}`;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell>{inv.base_role}</TableCell>
                      <TableCell>
                        <Badge variant={inv.status === 'pending' ? 'default' : 'secondary'}>
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(inv.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right space-x-1">
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(url);
                            toast.success('Invite link copied');
                          }}
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        {inv.status === 'pending' && isOwner && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => revoke.mutate(inv.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current members</CardTitle>
          <p className="text-xs text-muted-foreground">
            Una persona = un posto. I ruoli organizzativi sono cumulabili senza costi extra.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Seat</TableHead>
                <TableHead>Ruoli organizzativi</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const mine = orgRoles.filter((r) => r.user_id === m.user_id).map((r) => r.role);
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.display_name ?? '—'}</TableCell>
                    <TableCell className="text-xs">{m.email ?? '—'}</TableCell>
                    <TableCell>
                      <Badge variant={m.is_owner ? 'default' : 'secondary'}>
                        {m.is_owner ? 'owner' : 'member'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {mine.length === 0 ? (
                          <span className="text-xs text-muted-foreground">Nessun ruolo</span>
                        ) : (
                          mine.map((r) => (
                            <Badge key={r} variant="outline" className="text-[10px]">
                              {roleLabel(r)}
                            </Badge>
                          ))
                        )}
                        {isOwner && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button size="sm" variant="ghost" className="h-6 px-2">
                                <Settings2 className="w-3.5 h-3.5" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="start" className="w-64 max-h-80 overflow-auto">
                              <p className="text-xs font-medium mb-2">Ruoli organizzativi</p>
                              <div className="space-y-2">
                                {ORG_ROLES.map((r) => (
                                  <label key={r} className="flex items-center gap-2 text-xs cursor-pointer">
                                    <Checkbox
                                      checked={mine.includes(r)}
                                      onCheckedChange={(v) =>
                                        toggleRole.mutate({ userId: m.user_id, role: r, on: !!v })
                                      }
                                    />
                                    {roleLabel(r)}
                                  </label>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {isOwner && !m.is_owner && (
                        <Button
                          size="sm" variant="ghost"
                          onClick={() => removeMember.mutate(m.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!domainWarning} onOpenChange={(o) => !o && setDomainWarning(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dominio email diverso</AlertDialogTitle>
            <AlertDialogDescription>
              Questo indirizzo usa un dominio diverso da quello della tua organizzazione
              ({domainWarning}) — confermi comunque l'invito?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setDomainWarning(null); invite.mutate(); }}>
              Invia comunque
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

