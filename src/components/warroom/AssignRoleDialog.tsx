/**
 * AssignRoleDialog — Lightweight dialog opened by double-clicking a role row in
 * SectionResponsibilityPanel. Lets the PM/admin either pick an existing user
 * with a compatible role and assign them to the project, or invite a brand-new
 * user via the `admin-users` Edge Function (action: 'invite') and immediately
 * attach them to the project.
 *
 * Both flows reuse the existing `admin-users` function — no new tables.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, UserPlus, Mail, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { AppRole } from '@/lib/workflow';

interface AssignRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** The macro-phase row that was double-clicked (e.g. 'Design Validation') */
  phaseLabel: string;
  /** Roles considered owners for this phase (filter for "Existing" tab) */
  candidateRoles: AppRole[];
  /** Currently assigned member ids on this project (to show "already in") */
  alreadyAssignedUserIds: string[];
}

interface ProfileWithRoles {
  id: string;
  email: string | null;
  display_name: string | null;
  roles: AppRole[];
}

export function AssignRoleDialog({
  open,
  onOpenChange,
  projectId,
  phaseLabel,
  candidateRoles,
  alreadyAssignedUserIds,
}: AssignRoleDialogProps) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'existing' | 'invite'>('existing');
  const [search, setSearch] = useState('');
  const [profiles, setProfiles] = useState<ProfileWithRoles[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [pendingRoleAssignment, setPendingRoleAssignment] = useState<Record<string, AppRole>>({});

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<AppRole>(candidateRoles[0] || 'project_manager');
  const [inviting, setInviting] = useState(false);

  // Reset state on open
  useEffect(() => {
    if (open) {
      setTab('existing');
      setSearch('');
      setInviteEmail('');
      setInviteName('');
      setInviteRole(candidateRoles[0] || 'project_manager');
    }
  }, [open, candidateRoles]);

  // Load all profiles + their roles when opening
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingProfiles(true);
      try {
        const [{ data: profs }, { data: roleRows }] = await Promise.all([
          supabase.from('profiles').select('id, email, display_name').order('display_name', { ascending: true }),
          supabase.from('user_roles').select('user_id, role'),
        ]);
        if (cancelled) return;
        const rolesByUser: Record<string, AppRole[]> = {};
        (roleRows || []).forEach((r: any) => {
          (rolesByUser[r.user_id] ||= []).push(r.role as AppRole);
        });
        const enriched: ProfileWithRoles[] = (profs || []).map((p: any) => ({
          id: p.id,
          email: p.email,
          display_name: p.display_name,
          roles: rolesByUser[p.id] || [],
        }));
        setProfiles(enriched);
      } finally {
        if (!cancelled) setLoadingProfiles(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Candidates: users having at least one role compatible with this phase
  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase();
    return profiles
      .filter(p => p.roles.some(r => candidateRoles.includes(r)))
      .filter(p => {
        if (!term) return true;
        return (
          (p.display_name || '').toLowerCase().includes(term) ||
          (p.email || '').toLowerCase().includes(term)
        );
      });
  }, [profiles, candidateRoles, search]);

  const handleAssign = async (profile: ProfileWithRoles) => {
    const role = pendingRoleAssignment[profile.id]
      || profile.roles.find(r => candidateRoles.includes(r))
      || candidateRoles[0];
    if (!role) {
      toast.error('Nessun ruolo compatibile per questa fase');
      return;
    }
    setBusyUserId(profile.id);
    try {
      const { data, error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'add_project_member', project_id: projectId, user_id: profile.id, role },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`${profile.display_name || profile.email} assegnato come ${role.replace(/_/g, ' ')}`);
      await queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
    } catch (e: any) {
      toast.error(e?.message || 'Assegnazione fallita');
    } finally {
      setBusyUserId(null);
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail.trim()) {
      toast.error('Email obbligatoria');
      return;
    }
    setInviting(true);
    try {
      // 1. Create the user + assign global role
      const { data: invData, error: invErr } = await supabase.functions.invoke('admin-users', {
        body: { action: 'invite', email: inviteEmail.trim(), role: inviteRole },
      });
      if (invErr) throw invErr;
      if ((invData as any)?.error) throw new Error((invData as any).error);
      const newUserId = (invData as any)?.user_id;
      if (!newUserId) throw new Error('User creato ma id mancante');

      // 2. Update display_name if provided
      if (inviteName.trim()) {
        await supabase.from('profiles').update({ display_name: inviteName.trim() }).eq('id', newUserId);
      }

      // 3. Attach to project
      const { error: addErr } = await supabase.functions.invoke('admin-users', {
        body: { action: 'add_project_member', project_id: projectId, user_id: newUserId, role: inviteRole },
      });
      if (addErr) throw addErr;

      toast.success(`${inviteEmail} invitato e assegnato come ${inviteRole.replace(/_/g, ' ')}`);
      await queryClient.invalidateQueries({ queryKey: ['project-members', projectId] });
      setInviteEmail('');
      setInviteName('');
    } catch (e: any) {
      toast.error(e?.message || 'Invito fallito');
    } finally {
      setInviting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Assegna responsabili — {phaseLabel}</DialogTitle>
          <DialogDescription className="text-xs">
            Scegli persone esistenti compatibili con questa fase, oppure invita un nuovo utente direttamente nel progetto.
          </DialogDescription>
        </DialogHeader>

        <div className="text-[11px] text-muted-foreground -mt-2">
          Ruoli accettati per questa fase:&nbsp;
          {candidateRoles.map(r => (
            <Badge key={r} variant="outline" className="text-[9px] mr-1">{r.replace(/_/g, ' ')}</Badge>
          ))}
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as 'existing' | 'invite')} className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="existing" className="text-xs">
              <Search className="w-3 h-3 mr-1" /> Utenti esistenti
            </TabsTrigger>
            <TabsTrigger value="invite" className="text-xs">
              <UserPlus className="w-3 h-3 mr-1" /> Invita nuovo
            </TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-2 mt-3">
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cerca per nome o email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-7 h-8 text-sm"
              />
            </div>

            <ScrollArea className="h-[280px] rounded-md border border-border">
              {loadingProfiles ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 inline animate-spin mr-1" /> Caricamento…
                </div>
              ) : candidates.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  Nessun utente con ruoli compatibili. Usa "Invita nuovo".
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {candidates.map(p => {
                    const isAssigned = alreadyAssignedUserIds.includes(p.id);
                    const compatibleRoles = p.roles.filter(r => candidateRoles.includes(r));
                    return (
                      <div key={p.id} className="flex items-center gap-2 p-2 hover:bg-muted/30">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.display_name || p.email?.split('@')[0]}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {compatibleRoles.map(r => (
                              <Badge
                                key={r}
                                variant={pendingRoleAssignment[p.id] === r ? 'default' : 'outline'}
                                className="text-[9px] cursor-pointer"
                                onClick={() => setPendingRoleAssignment(prev => ({ ...prev, [p.id]: r }))}
                              >
                                {r.replace(/_/g, ' ')}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {isAssigned ? (
                          <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                            <Check className="w-3 h-3" /> già nel team
                          </Badge>
                        ) : (
                          <Button
                            size="sm"
                            className="h-7 text-[10px] shrink-0"
                            onClick={() => handleAssign(p)}
                            disabled={busyUserId === p.id}
                          >
                            {busyUserId === p.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Assegna'}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="invite" className="space-y-3 mt-3">
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Nome</Label>
                <Input
                  placeholder="Mario Rossi"
                  value={inviteName}
                  onChange={e => setInviteName(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Email *</Label>
                <Input
                  type="email"
                  placeholder="mario.rossi@studio.it"
                  value={inviteEmail}
                  onChange={e => setInviteEmail(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <div>
                <Label className="text-xs">Ruolo per questa fase</Label>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value as AppRole)}
                  className="w-full h-8 text-sm border border-border rounded-md bg-background px-2"
                >
                  {candidateRoles.map(r => (
                    <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="rounded-md bg-muted/30 border border-border p-2 text-[10px] text-muted-foreground">
              <Mail className="w-3 h-3 inline mr-1" />
              L'utente verrà creato con password temporanea, assegnato al ruolo scelto e aggiunto subito a questo progetto.
            </div>
            <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="w-full h-9">
              {inviting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <UserPlus className="w-3 h-3 mr-1" />}
              Invita e assegna
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
