import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllOrganizations } from '@/hooks/useAllOrganizations';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Eye, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { startImpersonation } from '@/components/layout/ImpersonateBanner';
import { CustomDomainCard } from '@/components/admin/CustomDomainCard';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { CreateOrgDialog } from './CreateOrgDialog';
import { useNavigate } from 'react-router-dom';

const TIER_COLORS: Record<string, string> = {
  basic: 'bg-slate-500/15 text-slate-300',
  advanced: 'bg-blue-500/15 text-blue-300',
  pro: 'bg-emerald-500/15 text-emerald-300',
};
const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-300',
  grace: 'bg-yellow-500/15 text-yellow-300',
  suspended: 'bg-red-500/15 text-red-300',
  purge_pending: 'bg-red-700/30 text-red-200',
};

export function OrganizationsTable() {
  const { data: orgs = [], isLoading } = useAllOrganizations();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const setTier = useMutation({
    mutationFn: async ({ org, tier }: { org: string; tier: string }) => {
      const { error } = await (supabase as any).rpc('admin_set_org_tier', { p_org: org, p_tier: tier });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-all-orgs'] });
      toast.success('Tier updated');
    },
    onError: (e: any) => toast.error(e?.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ org, status }: { org: string; status: string }) => {
      const { error } = await (supabase as any).rpc('admin_set_org_status', { p_org: org, p_status: status });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-all-orgs'] });
      toast.success('Status updated');
    },
    onError: (e: any) => toast.error(e?.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">All client organizations</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            {orgs.length} total · sorted by creation date
          </p>
        </div>
        <CreateOrgDialog />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
        ) : orgs.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No organizations yet. Create one to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Projects</TableHead>
                  <TableHead>Domain</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orgs.map((o) => (
                  <TableRow key={o.organization_id}>
                    <TableCell>
                      <div className="font-medium text-sm">{o.name}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{o.slug}</div>
                    </TableCell>
                    <TableCell className="text-xs">{o.owner_email ?? '—'}</TableCell>
                    <TableCell>
                      <Select
                        value={o.tier}
                        onValueChange={(v) => setTier.mutate({ org: o.organization_id, tier: v })}
                      >
                        <SelectTrigger className={`h-7 w-28 text-xs capitalize ${TIER_COLORS[o.tier]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="basic">Basic</SelectItem>
                          <SelectItem value="advanced">Advanced</SelectItem>
                          <SelectItem value="pro">Pro</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={o.status}
                        onValueChange={(v) => setStatus.mutate({ org: o.organization_id, status: v })}
                      >
                        <SelectTrigger className={`h-7 w-32 text-xs capitalize ${STATUS_COLORS[o.status]}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="grace">Grace</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                          <SelectItem value="purge_pending">Purge pending</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      <Badge variant="secondary" className="text-[10px]">
                        {o.active_projects} / {o.project_limit > 1_000_000 ? '∞' : o.project_limit}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="h-7 text-xs">
                            <Globe className="w-3.5 h-3.5 mr-1" /> Domain
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Dominio personalizzato — {o.name}</DialogTitle>
                          </DialogHeader>
                          <CustomDomainCard orgId={o.organization_id} orgName={o.name} compact />
                        </DialogContent>
                      </Dialog>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm" variant="ghost"
                        className="h-7 text-xs"
                        onClick={async () => {
                          try {
                            await startImpersonation(o.organization_id);
                            toast.success(`Viewing as ${o.name}`);
                            navigate('/');
                            window.location.reload();
                          } catch (e: any) {
                            toast.error(e?.message ?? 'Impersonation failed');
                          }
                        }}
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> View as
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
