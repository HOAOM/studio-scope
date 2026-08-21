import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { useActiveOrg } from '@/hooks/useMyOrganizations';
import { useNavigate } from 'react-router-dom';
import { useImpersonatedOrgId } from '@/components/layout/ImpersonateBanner';

export function OrgSwitcher() {
  const { orgs: allOrgs, activeOrg, setActiveOrg, isLoading } = useActiveOrg();
  const impersonateId = useImpersonatedOrgId();
  const navigate = useNavigate();

  // In modalità "View as" il selettore è bloccato sull'org impersonata: le
  // altre org (comprese quelle proprie del platform admin) non devono essere
  // raggiungibili senza prima uscire dall'impersonazione.
  const orgs = impersonateId
    ? allOrgs.filter((o) => o.organization_id === impersonateId)
    : allOrgs;

  if (isLoading) return null;
  if (orgs.length === 0) {
    return (
      <Button variant="ghost" size="sm" className="gap-2" disabled>
        <Building2 className="h-4 w-4" />
        <span className="text-xs text-muted-foreground">No organization</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 max-w-[220px]">
          <Building2 className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-medium">
            {activeOrg?.name ?? 'Select organization'}
          </span>
          {activeOrg && (
            <Badge variant="secondary" className="ml-1 capitalize text-[10px] px-1.5 py-0">
              {activeOrg.tier}
            </Badge>
          )}
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 z-[70]">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Your organizations
        </DropdownMenuLabel>
        {orgs.map((o) => (
          <DropdownMenuItem
            key={o.organization_id}
            onClick={() => setActiveOrg(o.organization_id)}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex flex-col min-w-0">
              <span className="truncate text-sm font-medium">{o.name}</span>
              <span className="text-[11px] text-muted-foreground capitalize">
                {o.tier} · {o.status}
                {o.is_owner ? ' · owner' : ''}
              </span>
            </div>
            {o.organization_id === activeOrg?.organization_id && (
              <Check className="h-4 w-4 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/admin?tab=members')}>
          Manage members & invites
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
