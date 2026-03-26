/**
 * MilestonesPanel — COO milestone setting + feasibility alerts
 */
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Target, Plus, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { useProjectMilestones, useCreateMilestone, useDeleteMilestone, type ProjectMilestone } from '@/hooks/useMilestones';
import { LIFECYCLE_ORDER, LIFECYCLE_LABELS, getLifecycleIndex, type ItemLifecycleStatus } from '@/lib/workflow';
import { Database } from '@/integrations/supabase/types';
import { differenceInDays, parseISO } from 'date-fns';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface MilestonesPanelProps {
  projectId: string;
  items: ProjectItem[];
  canEdit?: boolean;
}

const MILESTONE_STATUSES: { value: string; label: string }[] = [
  { value: 'design_ready', label: 'All designs approved' },
  { value: 'finishes_approved_hod', label: 'All finishes approved' },
  { value: 'client_board_signed', label: 'All client boards signed' },
  { value: 'po_issued', label: 'All POs issued' },
  { value: 'payment_executed', label: 'All payments executed' },
  { value: 'delivered_to_site', label: 'All items delivered' },
  { value: 'installed', label: 'All items installed' },
  { value: 'closed', label: 'All items closed' },
];

export function MilestonesPanel({ projectId, items, canEdit = false }: MilestonesPanelProps) {
  const { data: milestones = [] } = useProjectMilestones(projectId);
  const createMilestone = useCreateMilestone();
  const deleteMilestone = useDeleteMilestone();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ label: '', target_date: '', required_status: '' });

  const handleCreate = async () => {
    if (!form.label || !form.target_date || !form.required_status) { toast.error('All fields required'); return; }
    try {
      await createMilestone.mutateAsync({
        project_id: projectId,
        label: form.label,
        target_date: form.target_date,
        required_status: form.required_status,
        macro_area: null,
      });
      setForm({ label: '', target_date: '', required_status: '' });
      setShowForm(false);
      toast.success('Milestone created');
    } catch { toast.error('Failed to create'); }
  };

  const handleDelete = async (m: ProjectMilestone) => {
    try {
      await deleteMilestone.mutateAsync({ id: m.id, projectId });
      toast.success('Milestone deleted');
    } catch { toast.error('Failed to delete'); }
  };

  // Calculate feasibility for each milestone
  const milestoneStatus = useMemo(() => {
    return milestones.map(m => {
      const requiredIdx = LIFECYCLE_ORDER.indexOf(m.required_status as ItemLifecycleStatus);
      const activeItems = items.filter(i => i.is_active !== false);
      const passedCount = activeItems.filter(i => getLifecycleIndex(i.lifecycle_status) >= requiredIdx).length;
      const total = activeItems.length;
      const progress = total > 0 ? Math.round((passedCount / total) * 100) : 100;
      const daysLeft = differenceInDays(parseISO(m.target_date), new Date());
      const isOverdue = daysLeft < 0 && progress < 100;
      const atRisk = daysLeft < 14 && progress < 80;
      const feasible = progress === 100 || daysLeft > 7;

      return { ...m, progress, passedCount, total, daysLeft, isOverdue, atRisk, feasible };
    });
  }, [milestones, items]);

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-border bg-surface-elevated flex items-center justify-between">
        <div>
          <h3 className="font-bold text-foreground text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Project Milestones
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">COO-defined targets with feasibility tracking</p>
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="h-7 text-[11px]">
            <Plus className="w-3 h-3 mr-1" /> Add Milestone
          </Button>
        )}
      </div>

      {showForm && (
        <div className="px-5 py-3 border-b border-border bg-muted/20 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Label</Label>
              <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. All finishes by Q2" className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Target Date</Label>
              <Input type="date" value={form.target_date} onChange={e => setForm(f => ({ ...f, target_date: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Required Status</Label>
              <Select value={form.required_status} onValueChange={v => setForm(f => ({ ...f, required_status: v }))}>
                <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {MILESTONE_STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={createMilestone.isPending} className="h-7 text-[11px]">Save</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)} className="h-7 text-[11px]">Cancel</Button>
          </div>
        </div>
      )}

      {milestoneStatus.length === 0 && !showForm ? (
        <div className="px-5 py-6 text-center text-sm text-muted-foreground">
          No milestones set. {canEdit ? 'Add targets to track project feasibility.' : ''}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {milestoneStatus.map(m => (
            <div key={m.id} className={cn('px-5 py-3 flex items-center gap-4', m.isOverdue && 'bg-status-unsafe-bg/30')}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {m.progress === 100 ? (
                    <CheckCircle2 className="w-4 h-4 text-status-safe shrink-0" />
                  ) : m.isOverdue ? (
                    <AlertTriangle className="w-4 h-4 text-status-unsafe shrink-0" />
                  ) : m.atRisk ? (
                    <AlertTriangle className="w-4 h-4 text-status-at-risk shrink-0" />
                  ) : (
                    <Target className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-medium truncate">{m.label}</span>
                  <Badge variant="outline" className="text-[9px] font-mono h-4 px-1">
                    {LIFECYCLE_LABELS[m.required_status] || m.required_status}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 mt-1.5">
                  <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[200px]">
                    <div className={cn('h-full rounded-full transition-all',
                      m.progress === 100 ? 'bg-status-safe' : m.isOverdue ? 'bg-status-unsafe' : m.atRisk ? 'bg-status-at-risk' : 'bg-primary'
                    )} style={{ width: `${m.progress}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{m.passedCount}/{m.total} items ({m.progress}%)</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <span className="text-xs font-mono text-muted-foreground">{m.target_date}</span>
                <div className={cn('text-[10px] mt-0.5',
                  m.isOverdue ? 'text-status-unsafe font-semibold' :
                  m.atRisk ? 'text-status-at-risk' : 'text-muted-foreground'
                )}>
                  {m.daysLeft === 0 ? 'Today' : m.daysLeft > 0 ? `${m.daysLeft}d left` : `${Math.abs(m.daysLeft)}d overdue`}
                </div>
              </div>
              {canEdit && (
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => handleDelete(m)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
