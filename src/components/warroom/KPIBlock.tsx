import { StatusLevel, getKPIStatus } from '@/types/warroom';
import { cn } from '@/lib/utils';

interface KPIBlockProps {
  label: string;
  value: number;
  inverse?: boolean; // For metrics where lower is better (like risk)
  suffix?: string;
}

export function KPIBlock({ label, value, inverse = false, suffix = '%' }: KPIBlockProps) {
  const status = getKPIStatus(value, inverse);
  
  const statusClasses: Record<StatusLevel, string> = {
    'safe': 'kpi-safe',
    'at-risk': 'kpi-at-risk',
    'unsafe': 'kpi-unsafe',
  };
  
  const textClasses: Record<StatusLevel, string> = {
    'safe': 'text-status-safe',
    'at-risk': 'text-status-at-risk',
    'unsafe': 'text-status-unsafe',
  };

  return (
    <div className={cn(
      'px-3 py-2 rounded-md',
      statusClasses[status]
    )}>
      <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
        {label}
      </div>
      <div className={cn('text-2xl font-semibold font-mono', textClasses[status])}>
        {value}{suffix}
      </div>
    </div>
  );
}
