import { useGlobalMetrics } from '@/hooks/useAllOrganizations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Building2, TrendingUp, AlertTriangle, Sparkles, Boxes } from 'lucide-react';

// Approx monthly price per tier (EUR) for MRR estimate
const TIER_PRICE: Record<string, number> = { basic: 79, advanced: 99, pro: 135 };

export function GlobalMetricsPanel() {
  const { data, isLoading } = useGlobalMetrics();
  if (isLoading || !data) return <Loader2 className="w-5 h-5 animate-spin" />;

  const mrr = Object.entries(data.orgs_by_tier ?? {}).reduce(
    (sum, [tier, count]) => sum + (TIER_PRICE[tier] ?? 0) * (count as number), 0,
  );
  const atRisk = (data.orgs_by_status?.grace ?? 0) + (data.orgs_by_status?.suspended ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard icon={<Building2 className="w-4 h-4" />} label="Total orgs" value={data.total_orgs} />
        <MetricCard icon={<TrendingUp className="w-4 h-4" />} label="Est. MRR" value={`€${mrr.toLocaleString()}`} />
        <MetricCard icon={<Sparkles className="w-4 h-4" />} label="New (30d)" value={data.new_orgs_30d} accent="emerald" />
        <MetricCard icon={<AlertTriangle className="w-4 h-4" />} label="At risk" value={atRisk} accent={atRisk > 0 ? 'red' : undefined} />
        <MetricCard icon={<Boxes className="w-4 h-4" />} label="Active projects" value={data.total_projects} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Orgs by tier</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(data.orgs_by_tier ?? {}).map(([k, v]) => (
              <Row key={k} label={k} value={v as number} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Orgs by status</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {Object.entries(data.orgs_by_status ?? {}).map(([k, v]) => (
              <Row key={k} label={k.replace('_', ' ')} value={v as number} />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Top 5 orgs by projects</CardTitle></CardHeader>
          <CardContent className="space-y-1.5">
            {(data.top_orgs ?? []).map((o) => (
              <Row key={o.name} label={o.name} value={o.active_projects} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value, accent }: {
  icon: React.ReactNode; label: string; value: React.ReactNode; accent?: 'emerald' | 'red';
}) {
  const tone = accent === 'red' ? 'text-red-400' : accent === 'emerald' ? 'text-emerald-400' : 'text-foreground';
  return (
    <Card>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
          {icon} {label}
        </div>
        <div className={`text-2xl font-bold mt-1 ${tone}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center text-xs">
      <span className="capitalize text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
