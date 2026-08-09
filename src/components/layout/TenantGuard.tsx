import { ReactNode, useEffect } from 'react';
import { useTenant } from '@/hooks/useTenant';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, Loader2 } from 'lucide-react';

/**
 * Se l'app è servita su un dominio tenant (es. marco.amz.ee), seleziona
 * automaticamente l'organizzazione corrispondente. Se l'utente loggato non
 * appartiene a quell'organizzazione mostra un messaggio chiaro.
 * Su preview/localhost (tenant = null) il comportamento resta invariato.
 */
export function TenantGuard({ children }: { children: ReactNode }) {
  const { tenant, loading: tenantLoading } = useTenant();
  const { orgs, activeId, setActiveOrg, isLoading: orgsLoading } = useActiveOrg();
  const { signOut } = useAuth();

  const belongs = tenant ? orgs.some((o) => o.organization_id === tenant.organization_id) : true;

  useEffect(() => {
    if (tenant && belongs && activeId !== tenant.organization_id) {
      setActiveOrg(tenant.organization_id);
    }
  }, [tenant, belongs, activeId, setActiveOrg]);

  if (tenantLoading || (tenant && orgsLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (tenant && !belongs) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-3">
              <Building2 className="w-8 h-8 text-muted-foreground" />
            </div>
            <CardTitle className="text-xl">Accesso non autorizzato</CardTitle>
            <CardDescription>
              Il tuo account non fa parte dell'organizzazione <strong>{tenant.name}</strong> a cui
              appartiene questo indirizzo. Esci e accedi con l'account corretto, oppure chiedi
              all'amministratore di invitarti.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
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
