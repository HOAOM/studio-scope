/**
 * BudgetOverview — Pie chart showing budget allocation by category
 * Shows total budget, allocated, free, and over-budget amounts.
 */
import { useMemo } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { CATEGORY_LABELS } from '@/lib/categories';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];
type BOQCategory = Database['public']['Enums']['boq_category'];

const CATEGORY_COLORS: Record<string, string> = {
  'joinery': 'hsl(210, 70%, 50%)',
  'loose-furniture': 'hsl(160, 60%, 45%)',
  'lighting': 'hsl(45, 80%, 55%)',
  'finishes': 'hsl(280, 50%, 55%)',
  'ffe': 'hsl(340, 60%, 50%)',
  'accessories': 'hsl(30, 70%, 50%)',
  'appliances': 'hsl(200, 50%, 45%)',
  'hvac': 'hsl(190, 60%, 50%)',
  'electrical': 'hsl(50, 70%, 50%)',
  'plumbing': 'hsl(220, 55%, 55%)',
  'fire-protection': 'hsl(0, 65%, 50%)',
  'low-voltage': 'hsl(270, 50%, 55%)',
  'sanitary': 'hsl(170, 50%, 45%)',
};

interface BudgetOverviewProps {
  items: ProjectItem[];
  totalBudget?: number | null;
  canSeeCosts: boolean;
}

export function BudgetOverview({ items, totalBudget, canSeeCosts }: BudgetOverviewProps) {
  const data = useMemo(() => {
    // Only count active parent items or selected options
    const relevantItems = items.filter(i => {
      if (i.parent_item_id) return !!i.is_selected_option;
      const hasChildren = items.some(c => c.parent_item_id === i.id);
      if (hasChildren) {
        const selectedChild = items.find(c => c.parent_item_id === i.id && c.is_selected_option);
        return !selectedChild; // Only count parent if no child is selected
      }
      return true;
    });

    const byCategory = new Map<BOQCategory, number>();
    let totalAllocated = 0;

    for (const item of relevantItems) {
      const cost = (item.unit_cost || 0) * (item.quantity || 1);
      totalAllocated += cost;
      const current = byCategory.get(item.category) || 0;
      byCategory.set(item.category, current + cost);
    }

    const chartData = Array.from(byCategory.entries())
      .filter(([, v]) => v > 0)
      .map(([cat, val]) => ({
        name: CATEGORY_LABELS[cat],
        value: Math.round(val * 100) / 100,
        color: CATEGORY_COLORS[cat],
      }))
      .sort((a, b) => b.value - a.value);

    const budget = totalBudget || 0;
    const free = budget > 0 ? Math.max(0, budget - totalAllocated) : 0;
    const overBudget = budget > 0 ? Math.max(0, totalAllocated - budget) : 0;

    if (budget > 0 && free > 0) {
      chartData.push({ name: 'Available', value: Math.round(free * 100) / 100, color: 'hsl(0, 0%, 30%)' });
    }

    return { chartData, totalAllocated, budget, free, overBudget, totalItems: relevantItems.length };
  }, [items, totalBudget]);

  const formatCurrency = (v: number) => `€${v.toLocaleString('en', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  if (!canSeeCosts) return null;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Budget Overview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Pie Chart */}
          <div className="h-[250px]">
            {data.chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {data.chartData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    formatter={(value) => <span className="text-xs text-muted-foreground">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                No cost data yet
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-3">
            {data.budget > 0 && (
              <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Total Budget</span>
                  <span className="text-sm font-bold font-mono text-foreground">{formatCurrency(data.budget)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Allocated</span>
                  <span className="text-sm font-mono text-foreground">{formatCurrency(data.totalAllocated)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Available</span>
                  <span className={cn('text-sm font-mono font-bold', data.free > 0 ? 'text-primary' : 'text-muted-foreground')}>
                    {formatCurrency(data.free)}
                  </span>
                </div>
                {data.overBudget > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-destructive font-medium">Over Budget</span>
                    <Badge variant="destructive" className="text-xs font-mono">
                      +{formatCurrency(data.overBudget)}
                    </Badge>
                  </div>
                )}
                {/* Progress bar */}
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all', data.overBudget > 0 ? 'bg-destructive' : 'bg-primary')}
                    style={{ width: `${Math.min(100, (data.totalAllocated / data.budget) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {Math.round((data.totalAllocated / data.budget) * 100)}% allocated
                </span>
              </div>
            )}

            {!data.budget && (
              <div className="rounded-lg bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Total Allocated</span>
                  <span className="text-sm font-bold font-mono text-foreground">{formatCurrency(data.totalAllocated)}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  Set a total budget in project settings to see allocation progress
                </span>
              </div>
            )}

            {/* Category breakdown */}
            <div className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">By Category</span>
              {data.chartData
                .filter(d => d.name !== 'Available')
                .map(d => (
                <div key={d.name} className="flex items-center justify-between py-0.5">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-xs text-foreground">{d.name}</span>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">{formatCurrency(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
