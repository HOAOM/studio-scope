import { useState, useMemo } from 'react';
import { 
  ProjectItem, 
  BOQCategory, 
  StatusLevel, 
  calculateItemStatus, 
  getCategoryLabel,
  getApprovalLabel 
} from '@/types/warroom';
import { StatusBadge } from './StatusBadge';
import { cn } from '@/lib/utils';
import { 
  Check, 
  X, 
  Filter,
  ChevronDown,
  Package,
  Truck,
  Wrench,
  FileCheck
} from 'lucide-react';

interface ItemTrackerProps {
  items: ProjectItem[];
}

type FilterKey = 'all' | BOQCategory | StatusLevel;

export function ItemTracker({ items }: ItemTrackerProps) {
  const [categoryFilter, setCategoryFilter] = useState<BOQCategory | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<StatusLevel | 'all'>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  
  // Get unique areas
  const areas = useMemo(() => {
    const uniqueAreas = new Set(items.map(item => item.area));
    return ['all', ...Array.from(uniqueAreas).sort()];
  }, [items]);
  
  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && calculateItemStatus(item) !== statusFilter) return false;
      if (areaFilter !== 'all' && item.area !== areaFilter) return false;
      return true;
    });
  }, [items, categoryFilter, statusFilter, areaFilter]);
  
  // Stats
  const stats = useMemo(() => {
    const byStatus = { safe: 0, 'at-risk': 0, unsafe: 0 };
    filteredItems.forEach(item => {
      byStatus[calculateItemStatus(item)]++;
    });
    return byStatus;
  }, [filteredItems]);

  const categories: (BOQCategory | 'all')[] = [
    'all', 'joinery', 'loose-furniture', 'lighting', 'finishes', 'ffe', 'accessories', 'appliances'
  ];

  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header with Filters */}
      <div className="px-4 py-3 border-b border-border bg-surface-elevated">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-foreground">Item Tracker</h3>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredItems.length} items • 
              <span className="text-status-safe ml-1">{stats.safe} ready</span> • 
              <span className="text-status-at-risk ml-1">{stats['at-risk']} in progress</span> • 
              <span className="text-status-unsafe ml-1">{stats.unsafe} blocked</span>
            </p>
          </div>
          <Filter className="w-4 h-4 text-muted-foreground" />
        </div>
        
        {/* Filter Row */}
        <div className="flex flex-wrap gap-3">
          {/* Category Filter */}
          <div className="relative">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as BOQCategory | 'all')}
              className="appearance-none bg-background border border-border rounded-md px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Categories</option>
              {categories.filter(c => c !== 'all').map(cat => (
                <option key={cat} value={cat}>{getCategoryLabel(cat as BOQCategory)}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          
          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusLevel | 'all')}
              className="appearance-none bg-background border border-border rounded-md px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Statuses</option>
              <option value="safe">✓ Safe</option>
              <option value="at-risk">⚠ At Risk</option>
              <option value="unsafe">✕ Unsafe</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          
          {/* Area Filter */}
          <div className="relative">
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              className="appearance-none bg-background border border-border rounded-md px-3 py-1.5 pr-8 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {areas.map(area => (
                <option key={area} value={area}>
                  {area === 'all' ? 'All Areas' : area}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
          
          {(categoryFilter !== 'all' || statusFilter !== 'all' || areaFilter !== 'all') && (
            <button
              onClick={() => {
                setCategoryFilter('all');
                setStatusFilter('all');
                setAreaFilter('all');
              }}
              className="text-xs text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">ID</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Description</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Category</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Area</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                <span className="flex items-center justify-center gap-1">
                  <FileCheck className="w-3.5 h-3.5" /> BOQ
                </span>
              </th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Approval</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                <span className="flex items-center justify-center gap-1">
                  <Package className="w-3.5 h-3.5" /> Ordered
                </span>
              </th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                <span className="flex items-center justify-center gap-1">
                  <Truck className="w-3.5 h-3.5" /> Received
                </span>
              </th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                <span className="flex items-center justify-center gap-1">
                  <Wrench className="w-3.5 h-3.5" /> Installed
                </span>
              </th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filteredItems.map((item) => {
              const status = calculateItemStatus(item);
              return (
                <tr 
                  key={item.id} 
                  className={cn(
                    'tracker-row transition-colors',
                    status === 'unsafe' && 'bg-status-unsafe-bg'
                  )}
                >
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                    {item.id.split('-').slice(-1)[0]}
                  </td>
                  <td className="px-4 py-3 text-foreground max-w-[200px] truncate" title={item.description}>
                    {item.description}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {getCategoryLabel(item.category)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {item.area}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <BoolIndicator value={item.boqIncluded} />
                  </td>
                  <td className="px-4 py-3">
                    <ApprovalBadge status={item.approvalStatus} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <BoolIndicator value={item.purchased} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <BoolIndicator value={item.received} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <BoolIndicator value={item.installed} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge status={status} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        
        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No items match the selected filters.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Boolean indicator component
function BoolIndicator({ value }: { value: boolean }) {
  return value ? (
    <Check className="w-4 h-4 text-status-safe mx-auto" />
  ) : (
    <X className="w-4 h-4 text-status-unsafe mx-auto" />
  );
}

// Approval status badge
function ApprovalBadge({ status }: { status: ProjectItem['approvalStatus'] }) {
  const classes = {
    'pending': 'bg-status-neutral-bg text-status-neutral',
    'approved': 'bg-status-safe-bg text-status-safe',
    'rejected': 'bg-status-unsafe-bg text-status-unsafe',
    'revision': 'bg-status-at-risk-bg text-status-at-risk',
  };
  
  return (
    <span className={cn(
      'inline-flex px-2 py-0.5 rounded text-xs font-medium',
      classes[status]
    )}>
      {getApprovalLabel(status)}
    </span>
  );
}
