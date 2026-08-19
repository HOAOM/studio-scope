/**
 * CredentialsPanel — vista testuale delle organizzazioni attive con impostazione
 * rapida della password dell'owner.
 *
 * PRIVACY: nessuna password viene mai letta dal database (sono hash) né salvata
 * in localStorage/log. L'unica password mostrata in chiaro è quella appena
 * impostata, tenuta esclusivamente in memoria React fino al refresh della pagina.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllOrganizations } from '@/hooks/useAllOrganizations';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, ExternalLink, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export function CredentialsPanel() {
  const { data: orgs, isLoading } = useAllOrganizations();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data: domains } = useQuery({
    queryKey: ['admin-org-domains'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, slug, custom_domain');
      if (error) throw error;
      const map: Record<string, string | null> = {};
      for (const o of data ?? []) map[o.id] = (o as any).custom_domain ?? null;
      return map;
    },
  });

  const activeOrgs = useMemo(
    () => (orgs ?? []).filter((o) => o.status === 'active'),
    [orgs]
  );

  const setPassword = async (org: { organization_id: string; owner_user_id: string | null }) => {
    const pwd = drafts[org.organization_id] ?? '';
    if (!org.owner_user_id) {
      toast({ title: 'Nessun owner associato', variant: 'destructive' });
      return;
    }
    if (pwd.length < 8) {
      toast({ title: 'La password deve avere almeno 8 caratteri', variant: 'destructive' });
      return;
    }
    setBusy(org.organization_id);
    const { data, error } = await supabase.functions.invoke('admin-set-user-password', {
      body: { action: 'set_password', user_id: org.owner_user_id, new_password: pwd },
    });
    setBusy(null);
    if (error || (data as any)?.error) {
      toast({
        title: 'Errore',
        description: (data as any)?.error ?? error?.message ?? 'Impossibile impostare la password',
        variant: 'destructive',
      });
      return;
    }
    setShown((s) => ({ ...s, [org.organization_id]: pwd }));
    setDrafts((d) => ({ ...d, [org.organization_id]: '' }));
    toast({ title: 'Password impostata' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Credenziali organizzazioni attive</CardTitle>
        <p className="text-xs text-muted-foreground">
          Le password esistenti non sono recuperabili (salvate come hash). Qui compare solo
          quella appena impostata, finché non ricarichi la pagina.
        </p>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Caricamento…</div>
        ) : activeOrgs.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nessuna organizzazione attiva.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Organizzazione</th>
                  <th className="py-2 pr-4 font-medium">Dominio</th>
                  <th className="py-2 pr-4 font-medium">Email owner</th>
                  <th className="py-2 pr-4 font-medium">Nuova password</th>
                  <th className="py-2 font-medium">Password impostata</th>
                </tr>
              </thead>
              <tbody>
                {activeOrgs.map((o) => {
                  const domain = domains?.[o.organization_id] ?? null;
                  const justSet = shown[o.organization_id];
                  return (
                    <tr key={o.organization_id} className="border-b last:border-0 align-middle">
                      <td className="py-2 pr-4 font-medium">{o.name}</td>
                      <td className="py-2 pr-4">
                        {domain ? (
                          <a
                            href={`https://${domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                          >
                            {domain}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        {o.owner_email ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <PasswordInput
                            className="h-8 w-48"
                            placeholder="min. 8 caratteri"
                            autoComplete="new-password"
                            value={drafts[o.organization_id] ?? ''}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [o.organization_id]: e.target.value }))
                            }
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy === o.organization_id || !o.owner_user_id}
                            onClick={() => setPassword(o)}
                          >
                            {busy === o.organization_id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              'Imposta'
                            )}
                          </Button>
                        </div>
                      </td>
                      <td className="py-2">
                        {justSet ? (
                          <div className="flex items-center gap-2">
                            <code className="rounded bg-muted px-2 py-1 text-xs">{justSet}</code>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                navigator.clipboard.writeText(justSet);
                                toast({ title: 'Password copiata' });
                              }}
                            >
                              <Copy className="h-3.5 w-3.5 mr-1" /> Copia
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
