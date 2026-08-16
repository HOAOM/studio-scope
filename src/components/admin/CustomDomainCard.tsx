/**
 * CustomDomainCard — set/clear the custom domain of an organization.
 * Editable by the organization owner (own org) or by a platform admin
 * (any org). Uniqueness + format are enforced server-side by the
 * security-definer RPC set_org_custom_domain().
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Globe, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function CustomDomainCard({
  orgId,
  orgName,
  compact = false,
}: {
  orgId: string | null;
  orgName?: string;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const [value, setValue] = useState<string | null>(null);

  const { data: current, isLoading } = useQuery({
    queryKey: ['org-custom-domain', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('organizations')
        .select('custom_domain')
        .eq('id', orgId)
        .maybeSingle();
      if (error) throw error;
      return (data?.custom_domain ?? '') as string;
    },
  });

  const save = useMutation({
    mutationFn: async (domain: string) => {
      const { data, error } = await (supabase as any).rpc('set_org_custom_domain', {
        p_org: orgId,
        p_domain: domain,
      });
      if (error) throw error;
      return data as string | null;
    },
    onSuccess: (saved) => {
      toast.success(saved ? `Dominio impostato: ${saved}` : 'Dominio rimosso');
      qc.invalidateQueries({ queryKey: ['org-custom-domain', orgId] });
      qc.invalidateQueries({ queryKey: ['admin-all-orgs'] });
    },
    onError: (e: any) => {
      const m = String(e?.message ?? '');
      if (m.includes('domain_already_assigned')) toast.error('Dominio già assegnato a un\'altra organizzazione');
      else if (m.includes('invalid_domain')) toast.error('Formato dominio non valido (es. studio.example.com)');
      else if (m.includes('forbidden')) toast.error('Solo il titolare dell\'organizzazione o lo staff di piattaforma');
      else toast.error(m || 'Errore');
    },
  });

  const field = value ?? current ?? '';

  const body = (
    <div className="space-y-3">
      {!compact && (
        <div className="flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Dominio personalizzato{orgName ? ` — ${orgName}` : ''}
          </h2>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        Indirizzo dedicato dal quale il tuo studio accede a Studio Scope (es. <code>studio.example.com</code>).
        Deve puntare all'app tramite CNAME. Lascia vuoto per rimuoverlo.
      </p>
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label>Dominio</Label>
          <Input
            className="mt-1"
            placeholder="studio.example.com"
            value={field}
            disabled={isLoading || !orgId}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button
          onClick={() => save.mutate(field.trim())}
          disabled={save.isPending || isLoading || !orgId}
        >
          {save.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Salva
        </Button>
      </div>
    </div>
  );

  if (compact) return body;

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6">{body}</CardContent>
    </Card>
  );
}
