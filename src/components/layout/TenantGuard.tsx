import { ReactNode, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTenant } from '@/hooks/useTenant';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { LOGIN_DENIED_FLAG, LOGIN_NO_ORG_FLAG } from '@/pages/Auth';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Loader2 } from 'lucide-react';

/**
 * Se l'app è servita su un dominio tenant (es. marco.amz.ee), seleziona
 * automaticamente l'organizzazione corrispondente.
 *
 * IMPORTANTE: su dominio tenant l'accesso è consentito SOLO se l'utente è
 * membro REALE dell'organizzazione (riga in organization_members), non in base
 * alla lista `get_my_organizations`, che include anche le organizzazioni
 * visibili tramite una sessione "View as" di un platform admin. Un platform
 * admin che fa login diretto su un dominio cliente vede "Accesso non
 * autorizzato": l'unico canale legittimo è il dominio neutro + "View as".
 *
 * Su preview/localhost (tenant = null) il comportamento resta invariato.
 */
export function TenantGuard({ children }: { children: ReactNode }) {
  const { tenant, loading: tenantLoading } = useTenant();
  const { orgs, activeId, setActiveOrg, isLoading: orgsLoading } = useActiveOrg();
  const { signOut } = useAuth();

  // Appartenenza reale: query diretta sulla propria riga di membership.
  // Sotto impersonazione la RLS lascia leggere le righe dell'org, ma nessuna
  // riga ha user_id = platform admin → risultato vuoto → accesso negato.
  const { data: realMember, isLoading: memberLoading } = useQuery({
    queryKey: ['real-membership', tenant?.organization_id],
    enabled: !!tenant?.organization_id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return false;
      const { data, error } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', tenant!.organization_id)
        .eq('user_id', auth.user.id)
        .maybeSingle();
      if (error) return false;
      return !!data;
    },
  });

  const belongs = tenant ? realMember === true : true;

  useEffect(() => {
    if (tenant && belongs && activeId !== tenant.organization_id) {
      setActiveOrg(tenant.organization_id);
    }
  }, [tenant, belongs, activeId, setActiveOrg]);

  // Accesso negato su dominio tenant: nessuna schermata dedicata (rivelerebbe
  // che le credenziali sono valide). Sessione invalidata e ritorno al login con
  // lo stesso identico messaggio generico di password errata.
  useEffect(() => {
    if (tenant && realMember === false) {
      void (async () => {
        const { data: auth } = await supabase.auth.getUser();
        let anyOrg = 0;
        if (auth.user) {
          const { count } = await supabase
            .from('organization_members')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', auth.user.id);
          anyOrg = count ?? 0;
        }
        if (anyOrg === 0) localStorage.setItem(LOGIN_NO_ORG_FLAG, '1');
        else localStorage.setItem(LOGIN_DENIED_FLAG, '1');
        await signOut().catch(() => {});
        window.location.replace('/auth');
      })();
    }
  }, [tenant, realMember, signOut]);

  // Su dominio tenant non renderizziamo nulla finché l'org attiva non è
  // ESATTAMENTE quella del tenant: altrimenti il primo paint userebbe l'org
  // precedente in localStorage (flash con i progetti dell'altro studio).
  const tenantOrgNotReady =
    !!tenant && belongs && activeId !== tenant.organization_id;

  if (tenantLoading || (tenant && (orgsLoading || memberLoading)) || tenantOrgNotReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }



  if (tenant && !belongs) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }


  // Utente autenticato ma senza organizzazione (es. registrazione diretta):
  // niente dashboard vuota, messaggio esplicito.
  if (!orgsLoading && orgs.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-xl">Nessuna organizzazione collegata</CardTitle>
            <CardDescription>
              Il tuo account non è ancora associato a uno studio. Chiedi all'amministratore del tuo
              studio di invitarti, oppure attiva un abbonamento su kroneel.com per creare la tua
              organizzazione.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center gap-2">
            <Button asChild>
              <a href="https://kroneel.com" target="_blank" rel="noreferrer">
                Vai a kroneel.com
              </a>
            </Button>
            <Button variant="outline" onClick={() => signOut()}>
              Esci
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

