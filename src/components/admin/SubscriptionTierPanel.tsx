/**
 * SubscriptionTierPanel — Admin UI to view & switch the current subscription tier.
 * Shows the 3 plans side-by-side with feature comparison.
 *
 * @see mem://constraints/subscription-tiers
 */
import { useSubscriptionTier } from '@/hooks/useSubscriptionTier';
import { TIERS, type TierFeatures } from '@/lib/subscriptionTiers';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X, Crown, Zap, Building, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const FEATURE_LABELS: Record<keyof TierFeatures, string> = {
  maxProjects: 'Active projects',
  maxUsersPerRole: 'Users per role',
  maxTotalUsers: 'Total team members',
  bulkImport: 'Bulk Excel/CSV import',
  presentationBuilder: 'Presentation Builder',
  supplierExports: 'Supplier exports (RFQ/PO)',
  clientBoards: 'Client Boards (signed PDF)',
  customBranding: 'Custom branding in PDFs',
  apiAccess: 'API access / integrations',
  auditRetentionDays: 'Audit log retention',
};

const TIER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  base: Building,
  pro: Zap,
  enterprise: Crown,
};

function formatValue(key: keyof TierFeatures, value: number | boolean): React.ReactNode {
  if (typeof value === 'boolean') {
    return value ? (
      <Check className="w-4 h-4 text-primary" />
    ) : (
      <X className="w-4 h-4 text-muted-foreground/40" />
    );
  }
  if (value === Infinity) return <span className="text-primary font-semibold">Unlimited</span>;
  if (key === 'auditRetentionDays') return `${value} days`;
  return value.toLocaleString();
}

export function SubscriptionTierPanel() {
  const { tier, setTier, definition } = useSubscriptionTier();

  const handleSelect = (next: typeof tier) => {
    if (next === tier) return;
    setTier(next);
    toast.success(`Subscription switched to ${TIERS.find((t) => t.id === next)?.label}`);
  };

  return (
    <Card className="bg-card border-border">
      <CardContent className="pt-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Subscription Tiers</h2>
          </div>
          <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
            Current: {definition.label}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Choose the plan that fits your organization. Limits apply softly across projects, users, and exports.
          Switching is instant; existing data is never modified.
        </p>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {TIERS.map((t) => {
            const Icon = TIER_ICONS[t.id] ?? Building;
            const isCurrent = t.id === tier;
            return (
              <div
                key={t.id}
                className={cn(
                  'relative rounded-lg border p-4 flex flex-col gap-3 transition-all',
                  isCurrent
                    ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/20'
                    : 'border-border bg-background/40 hover:border-primary/40',
                  t.highlight && !isCurrent && 'border-accent/60'
                )}
              >
                {t.highlight && (
                  <Badge className="absolute -top-2 right-3 bg-accent text-accent-foreground text-[10px]">
                    Most popular
                  </Badge>
                )}
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-foreground">{t.label}</span>
                </div>
                <p className="text-xs text-muted-foreground min-h-[2.5em]">{t.tagline}</p>
                <div className="text-2xl font-bold text-foreground">
                  {t.monthlyPrice === 0 ? (
                    <span className="text-base text-muted-foreground">Contact sales</span>
                  ) : (
                    <>
                      €{t.monthlyPrice}
                      <span className="text-xs text-muted-foreground font-normal"> /mo</span>
                    </>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={isCurrent ? 'default' : 'outline'}
                  className="w-full"
                  onClick={() => handleSelect(t.id)}
                  disabled={isCurrent}
                >
                  {isCurrent ? 'Active plan' : 'Switch to ' + t.label}
                </Button>
              </div>
            );
          })}
        </div>

        {/* Comparison matrix */}
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Feature</th>
                {TIERS.map((t) => (
                  <th key={t.id} className="px-3 py-2 text-center font-medium text-foreground">
                    {t.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(Object.keys(FEATURE_LABELS) as Array<keyof TierFeatures>).map((key, i) => (
                <tr key={key} className={cn('border-t border-border', i % 2 === 1 && 'bg-muted/10')}>
                  <td className="px-3 py-2 text-muted-foreground">{FEATURE_LABELS[key]}</td>
                  {TIERS.map((t) => (
                    <td key={t.id} className="px-3 py-2 text-center">
                      <div className="inline-flex items-center justify-center">
                        {formatValue(key, t.features[key])}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-muted-foreground italic">
          Tier preference is currently stored locally for development. The production rollout will
          persist subscriptions per organization via Lovable Cloud billing.
        </p>
      </CardContent>
    </Card>
  );
}
