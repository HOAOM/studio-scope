/**
 * RoleSummaryBar — barra riepilogo in cima all'organigramma.
 * Contatori cliccabili: posizioni da definire, eccezioni di mappatura,
 * posizioni vacanti, slot admin/coo extra usati sul piano.
 */
import { AlertTriangle, Pencil, ShieldCheck, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrgQuotaUsage } from '@/hooks/useOrgChartV3';

export interface RoleSummary {
  toDefine: number;
  overrides: number;
  vacant: number;
  noAccess: number;
}

export type SummaryFilter = 'to_define' | 'override' | 'vacant' | null;

function Counter({
  label, value, icon, active, tone, onClick,
}: {
  label: string; value: string; icon: React.ReactNode; active?: boolean;
  tone?: 'warning' | 'muted'; onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        'flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left text-[11px] transition-colors',
        onClick && 'hover:bg-accent',
        active && 'border-primary ring-1 ring-primary',
        tone === 'warning' && 'border-status-warning/60',
      )}
    >
      <span className={cn('shrink-0', tone === 'warning' ? 'text-status-warning' : 'text-muted-foreground')}>
        {icon}
      </span>
      <span className="leading-tight">
        <span className="block font-semibold">{value}</span>
        <span className="block text-muted-foreground">{label}</span>
      </span>
    </button>
  );
}

export function RoleSummaryBar({
  summary, quota, filter, onFilter,
}: {
  summary: RoleSummary;
  quota?: OrgQuotaUsage | null;
  filter: SummaryFilter;
  onFilter: (f: SummaryFilter) => void;
}) {
  const toggle = (f: Exclude<SummaryFilter, null>) => () => onFilter(filter === f ? null : f);
  const superMax = quota?.max_super_role_extra;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Counter
        label="Ruolo da definire"
        value={String(summary.toDefine)}
        tone={summary.toDefine > 0 ? 'warning' : undefined}
        icon={<AlertTriangle className="h-3.5 w-3.5" />}
        active={filter === 'to_define'}
        onClick={toggle('to_define')}
      />
      <Counter
        label="Eccezioni di studio"
        value={String(summary.overrides)}
        icon={<Pencil className="h-3.5 w-3.5" />}
        active={filter === 'override'}
        onClick={toggle('override')}
      />
      <Counter
        label="Posizioni vacanti"
        value={String(summary.vacant)}
        icon={<UserPlus className="h-3.5 w-3.5" />}
        active={filter === 'vacant'}
        onClick={toggle('vacant')}
      />
      <Counter
        label="Senza accesso al sistema"
        value={String(summary.noAccess)}
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
      />
      {quota && (
        <Counter
          label="Slot admin/COO extra"
          value={`${quota.super_roles_used ?? 0}${superMax === null || superMax === undefined ? ' / ∞' : ` / ${superMax}`}`}
          icon={<ShieldCheck className="h-3.5 w-3.5" />}
          tone={
            superMax !== null && superMax !== undefined && (quota.super_roles_used ?? 0) >= superMax
              ? 'warning'
              : undefined
          }
        />
      )}
    </div>
  );
}
