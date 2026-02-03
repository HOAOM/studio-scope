import { BOQCategoryStatus, getCategoryLabel } from '@/types/warroom';
import { CoverageDot } from './StatusBadge';
import { cn } from '@/lib/utils';

interface BOQMatrixProps {
  coverage: BOQCategoryStatus[];
}

export function BOQMatrix({ coverage }: BOQMatrixProps) {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-surface-elevated">
        <h3 className="font-semibold text-foreground">BOQ Coverage Matrix</h3>
        <p className="text-xs text-muted-foreground mt-1">Category status and approval coverage</p>
      </div>
      
      <div className="divide-y divide-border">
        {coverage.map((cat) => {
          const approvalRate = cat.itemCount > 0 
            ? Math.round((cat.approvedCount / cat.itemCount) * 100) 
            : 0;
          
          return (
            <div 
              key={cat.category}
              className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors"
            >
              <div className="flex items-center gap-4 flex-1">
                <span className="font-medium text-foreground min-w-[140px]">
                  {getCategoryLabel(cat.category)}
                </span>
                <CoverageDot coverage={cat.status} />
              </div>
              
              <div className="flex items-center gap-4 text-sm">
                <div className="text-right">
                  <span className="text-muted-foreground">Items: </span>
                  <span className="font-mono text-foreground">{cat.itemCount}</span>
                </div>
                <div className="text-right min-w-[100px]">
                  <span className="text-muted-foreground">Approved: </span>
                  <span className={cn(
                    'font-mono',
                    approvalRate >= 80 ? 'text-status-safe' : 
                    approvalRate >= 50 ? 'text-status-at-risk' : 
                    'text-status-unsafe'
                  )}>
                    {cat.approvedCount}/{cat.itemCount}
                  </span>
                </div>
                <div className="w-24">
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className={cn(
                        'h-full rounded-full transition-all',
                        approvalRate >= 80 ? 'bg-status-safe' : 
                        approvalRate >= 50 ? 'bg-status-at-risk' : 
                        'bg-status-unsafe'
                      )}
                      style={{ width: `${approvalRate}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Legend */}
      <div className="px-4 py-3 bg-surface-elevated border-t border-border">
        <div className="flex items-center gap-6 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-safe" />
            <span className="text-muted-foreground">Present</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-at-risk" />
            <span className="text-muted-foreground">To Confirm</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-status-unsafe" />
            <span className="text-muted-foreground">Missing</span>
          </div>
        </div>
      </div>
    </div>
  );
}
