import { StatusLevel } from '@/types/warroom';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: StatusLevel;
  label?: string;
  pulse?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function StatusBadge({ status, label, pulse = false, size = 'md' }: StatusBadgeProps) {
  const dotClasses: Record<StatusLevel, string> = {
    'safe': 'bg-status-safe',
    'at-risk': 'bg-status-at-risk',
    'unsafe': 'bg-status-unsafe',
  };
  
  const bgClasses: Record<StatusLevel, string> = {
    'safe': 'bg-status-safe-bg text-status-safe',
    'at-risk': 'bg-status-at-risk-bg text-status-at-risk',
    'unsafe': 'bg-status-unsafe-bg text-status-unsafe',
  };
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };
  
  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5',
  };
  
  const statusLabels: Record<StatusLevel, string> = {
    'safe': 'Safe',
    'at-risk': 'At Risk',
    'unsafe': 'Unsafe',
  };

  if (label !== undefined) {
    return (
      <span className={cn(
        'inline-flex items-center gap-1.5 rounded-full font-medium',
        bgClasses[status],
        sizeClasses[size]
      )}>
        <span className={cn(
          'rounded-full',
          dotClasses[status],
          dotSizes[size],
          pulse && 'status-pulse'
        )} />
        {label || statusLabels[status]}
      </span>
    );
  }

  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-full',
      dotClasses[status],
      dotSizes[size],
      pulse && 'status-pulse'
    )} />
  );
}

// Dot indicator for BOQ Coverage Matrix
interface CoverageDotProps {
  coverage: 'present' | 'missing' | 'to-confirm';
}

export function CoverageDot({ coverage }: CoverageDotProps) {
  const classes = {
    'present': 'bg-status-safe',
    'missing': 'bg-status-unsafe',
    'to-confirm': 'bg-status-at-risk',
  };
  
  const labels = {
    'present': 'Present',
    'missing': 'Missing',
    'to-confirm': 'To Confirm',
  };

  return (
    <div className="flex items-center gap-2">
      <span className={cn('w-3 h-3 rounded-full', classes[coverage])} />
      <span className="text-sm text-muted-foreground">{labels[coverage]}</span>
    </div>
  );
}
