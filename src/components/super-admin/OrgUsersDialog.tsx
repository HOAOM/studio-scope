/**
 * OrgUsersDialog — elenco membri di un'organizzazione con possibilità, per il
 * platform admin, di impostare direttamente la password di un utente
 * (edge function admin-set-user-password), senza passare da email/reset.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Users, KeyRound } from 'lucide-react';
import { toast } from 'sonner';

interface Member {
  user_id: string;
  is_owner: boolean;
  email: string | null;
  display_name: string | null;
}

export function OrgUsersDialog({ orgId, orgName }: { orgId: string; orgName: string }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['org-members-admin', orgId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('admin-set-user-password', {
        body: { action: 'list_members', organization_id: orgId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.members ?? []) as Member[];
    },
  });

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

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setEditing(null); setPassword(''); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="h-7 text-xs">
          <Users className="w-3.5 h-3.5 mr-1" /> Utenti
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Utenti — {orgName}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : members.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nessun membro.</p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div key={m.user_id} className="rounded-md border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {m.display_name || m.email || m.user_id}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{m.email ?? '—'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {m.is_owner && <Badge variant="secondary" className="text-[10px]">Owner</Badge>}
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => { setEditing(editing === m.user_id ? null : m.user_id); setPassword(''); }}
                    >
                      <KeyRound className="w-3.5 h-3.5 mr-1" /> Imposta password
                    </Button>
                  </div>
                </div>
                {editing === m.user_id && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="password"
                      autoComplete="new-password"
                      placeholder="Nuova password (min 8 caratteri)"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-8 text-xs"
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
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
