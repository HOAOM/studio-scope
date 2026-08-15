/**
 * SubscriptionTierPanel — mostra il piano REALE dell'organizzazione, letto dal
 * database (organization_subscriptions + tier_limits). I limiti sono applicati
 * lato server: questo pannello è di sola lettura, il cambio piano avviene dal
 * pannello di piattaforma / contatto commerciale.
 *
 * @see mem://constraints/subscription-tiers
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgSubscription, type OrgTier } from '@/hooks/useOrgSubscription';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Building, Zap, Crown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TierLimitRow {
  tier: OrgTier;
  max_seats: number | null;
  max_active_projects: number | null;
  max_boq_items_per_project: number | null;
  max_storage_bytes: number | null;
}

const TIER_ORDER: OrgTier[] = ['starter', 'pro', 'business'];

const TIER_META: Record<OrgTier, { label: string; tagline: string; icon: typeof Building }> = {
  starter: { label: 'Starter', tagline: 'Studio singolo · progetti limitati', icon: Building },
  pro: { label: 'Pro', tagline: 'Team completo · procurement e export', icon: Zap },
  business: { label: 'Business', tagline: 'Illimitato · multi-team e SLA', icon: Crown },
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Attivo',
  grace: 'In tolleranza',
  suspended: 'Sospeso',
  purge_pending: 'In cancellazione',
  purged: 'Cancellato',
};

function fmt(v: number | null): string {
  return v === null || v === undefined ? 'Illimitato' : v.toLocaleString('it-IT');
}

function fmtBytes(v: number | null): string {
  if (v === null || v === undefined) return 'Illimitato';
  return `${Math.round(v / 1024 ** 3)} GB`;
}

function useTierLimits() {
  return useQuery<TierLimitRow[]>({
    queryKey: ['tier-limits'],
    staleTime: 300_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('tier_limits').select('*');
      if (error) throw error;
      return (data ?? []) as TierLimitRow[];
    },
  });
}

export function SubscriptionTierPanel() {
  const { data: sub, isLoading: subLoading } = useOrgSubscription();
  const { data: limits, isLoading: limitsLoading } = useTierLimits();

  if (subLoading || limitsLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  const rows = TIER_ORDER.map((t) => limits?.find((l) => l.tier === t)).filter(
    Boolean,
  ) as TierLimitRow[];
  const current = sub?.tier;
  const currentLimits = rows.find((r) => r.tier === current);

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Abbonamento</h2>
          </div>
          <div className="flex items-center gap-2">
            {current && (
              <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                Piano: {TIER_META[current].label}
              </Badge>
            )}
            {sub?.status && (
              <Badge variant="outline" className="border-border text-muted-foreground">
                {STATUS_LABEL[sub.status] ?? sub.status}
              </Badge>
            )}
          </div>
        </div>

        {sub && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Organizzazione</div>
              <div className="text-sm font-medium text-foreground">{sub.organization_name}</div>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Progetti attivi</div>
              <div className="text-sm font-medium text-foreground">
                {sub.projects_used} / {currentLimits?.max_active_projects ?? '∞'}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Storage incluso</div>
              <div className="text-sm font-medium text-foreground">
                {fmtBytes(currentLimits?.max_storage_bytes ?? null)}
              </div>
            </div>
            <div className="rounded-lg border border-border bg-background/40 p-3">
              <div className="text-xs text-muted-foreground">Rinnovo</div>
              <div className="text-sm font-medium text-foreground">
                {sub.current_period_end
                  ? new Date(sub.current_period_end).toLocaleDateString('it-IT')
                  : '—'}
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {rows.map((r) => {
            const meta = TIER_META[r.tier];
            const Icon = meta.icon;
            const isCurrent = r.tier === current;
            return (
              <div
                key={r.tier}
                className={cn(
                  'rounded-lg border p-4 flex flex-col gap-2',
                  isCurrent
                    ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                    : 'border-border bg-background/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground">{meta.label}</span>
                  {isCurrent && (
                    <Badge className="ml-auto bg-primary/20 text-primary text-[10px]">
                      Piano attivo
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground min-h-[2.5em]">{meta.tagline}</p>
                <dl className="text-sm space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Utenti</dt>
                    <dd className="text-foreground">{fmt(r.max_seats)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Progetti attivi</dt>
                    <dd className="text-foreground">{fmt(r.max_active_projects)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Voci BOQ / progetto</dt>
                    <dd className="text-foreground">{fmt(r.max_boq_items_per_project)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Storage</dt>
                    <dd className="text-foreground">{fmtBytes(r.max_storage_bytes)}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          I limiti mostrati sono quelli effettivamente applicati dal database: superarli blocca
          l'operazione lato server. Per cambiare piano contatta il supporto Kroneel.
        </p>
      </CardContent>
    </Card>
  );
}
