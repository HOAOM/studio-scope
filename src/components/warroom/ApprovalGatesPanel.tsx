import { useMemo } from 'react';
import { Database } from '@/integrations/supabase/types';
import { useUpdateProjectItem } from '@/hooks/useProjects';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ShieldAlert, ShieldCheck, Clock, CheckCircle2, XCircle, ArrowRight, Package } from 'lucide-react';
import { toast } from 'sonner';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];
type ApprovalStatus = Database['public']['Enums']['approval_status'];

interface ApprovalGatesPanelProps {
  items: ProjectItem[];
  projectId: string;
  canApprove?: boolean;
  onItemClick?: (item: ProjectItem) => void;
}

interface GateGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  items: ProjectItem[];
  description: string;
}

export function ApprovalGatesPanel({ items, projectId, canApprove = true, onItemClick }: ApprovalGatesPanelProps) {
  const updateItem = useUpdateProjectItem();

  const gates = useMemo<GateGroup[]>(() => {
    const pending = items.filter(i => i.approval_status === 'pending');
    const revision = items.filter(i => i.approval_status === 'revision');
    const rejected = items.filter(i => i.approval_status === 'rejected');
    const readyToOrder = items.filter(i => i.approval_status === 'approved' && !i.purchased);
    const awaitingDelivery = items.filter(i => i.purchased && !i.received);
    const readyToInstall = items.filter(i => i.received && !i.installed);

    return [
      {
        key: 'pending',
        label: 'Pending Approval',
        icon: <Clock className="w-4 h-4" />,
        color: 'text-status-at-risk',
        bgColor: 'bg-status-at-risk-bg',
        borderColor: 'border-status-at-risk/20',
        items: pending,
        description: 'Items waiting for design/finish approval',
      },
      {
        key: 'revision',
        label: 'In Revision',
        icon: <ShieldAlert className="w-4 h-4" />,
        color: 'text-status-at-risk',
        bgColor: 'bg-status-at-risk-bg',
        borderColor: 'border-status-at-risk/20',
        items: revision,
        description: 'Items sent back for corrections',
      },
      {
        key: 'rejected',
        label: 'Rejected',
        icon: <XCircle className="w-4 h-4" />,
        color: 'text-status-unsafe',
        bgColor: 'bg-status-unsafe-bg',
        borderColor: 'border-status-unsafe/20',
        items: rejected,
        description: 'Items that need complete rework',
      },
      {
        key: 'ready_order',
        label: 'Ready to Order',
        icon: <ShieldCheck className="w-4 h-4" />,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
        items: readyToOrder,
        description: 'Approved — procurement can proceed',
      },
      {
        key: 'awaiting_delivery',
        label: 'Awaiting Delivery',
        icon: <Package className="w-4 h-4" />,
        color: 'text-primary',
        bgColor: 'bg-primary/10',
        borderColor: 'border-primary/20',
        items: awaitingDelivery,
        description: 'Ordered — waiting for delivery',
      },
      {
        key: 'ready_install',
        label: 'Ready to Install',
        icon: <CheckCircle2 className="w-4 h-4" />,
        color: 'text-status-safe',
        bgColor: 'bg-status-safe-bg',
        borderColor: 'border-status-safe/20',
        items: readyToInstall,
        description: 'Delivered — waiting for installation team',
      },
    ].filter(g => g.items.length > 0);
  }, [items]);

  const handleQuickApprove = async (item: ProjectItem) => {
    try {
      await updateItem.mutateAsync({ id: item.id, project_id: projectId, approval_status: 'approved' } as any);
      toast.success(`${item.item_code || item.description} approved`);
    } catch {
      toast.error('Failed to approve');
    }
  };

  const handleQuickReject = async (item: ProjectItem) => {
    try {
      await updateItem.mutateAsync({ id: item.id, project_id: projectId, approval_status: 'rejected' } as any);
      toast.success(`${item.item_code || item.description} rejected`);
    } catch {
      toast.error('Failed to reject');
    }
  };

  const handleAdvanceGate = async (item: ProjectItem, update: Partial<ProjectItem>) => {
    try {
      await updateItem.mutateAsync({ id: item.id, project_id: projectId, ...update } as any);
      toast.success(`${item.item_code || item.description} updated`);
    } catch {
      toast.error('Failed to update');
    }
  };

  if (gates.length === 0) {
    return (
      <div className="bg-card rounded-lg border border-border p-6 text-center">
        <ShieldCheck className="w-8 h-8 mx-auto text-status-safe mb-2" />
        <p className="text-sm text-muted-foreground">All gates clear — no pending actions</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="px-5 py-3.5 border-b border-border bg-surface-elevated flex items-center justify-between">
        <div>
          <h3 className="font-bold text-foreground text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-status-at-risk" />
            Approval Gates
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {gates.reduce((s, g) => s + g.items.length, 0)} items requiring action
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {gates.map(gate => (
          <div key={gate.key} className="px-5 py-3">
            <div className="flex items-center gap-2 mb-2">
              <div className={cn('p-1 rounded', gate.bgColor, gate.color)}>{gate.icon}</div>
              <span className={cn('text-sm font-semibold', gate.color)}>{gate.label}</span>
              <Badge variant="secondary" className="text-[10px] h-5">{gate.items.length}</Badge>
              <span className="text-[10px] text-muted-foreground ml-auto">{gate.description}</span>
            </div>

            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {gate.items.slice(0, 8).map(item => (
                <div
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-2 border transition-colors',
                    gate.bgColor, gate.borderColor, 'hover:bg-muted/30',
                    onItemClick && 'cursor-pointer'
                  )}
                  onClick={() => onItemClick?.(item)}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {item.item_code && (
                      <span className="font-mono text-[10px] text-primary font-medium">{item.item_code}</span>
                    )}
                    <span className="text-xs text-foreground truncate">{item.description}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{item.area}</span>
                    <Eye className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                  </div>

                  <div className="flex items-center gap-1 ml-2 shrink-0">
                    {(gate.key === 'pending' || gate.key === 'revision') && canApprove && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px] text-status-safe hover:bg-status-safe-bg"
                          onClick={() => handleQuickApprove(item)}
                          disabled={updateItem.isPending}
                        >
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[10px] text-status-unsafe hover:bg-status-unsafe-bg"
                          onClick={() => handleQuickReject(item)}
                          disabled={updateItem.isPending}
                        >
                          <XCircle className="w-3 h-3 mr-1" /> Reject
                        </Button>
                      </>
                    )}
                    {gate.key === 'rejected' && canApprove && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] text-status-at-risk hover:bg-status-at-risk-bg"
                        onClick={() => handleQuickApprove(item)}
                        disabled={updateItem.isPending}
                      >
                        <ArrowRight className="w-3 h-3 mr-1" /> Re-approve
                      </Button>
                    )}
                    {gate.key === 'ready_order' && canApprove && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] text-primary hover:bg-primary/10"
                        onClick={() => handleAdvanceGate(item, { purchased: true } as any)}
                        disabled={updateItem.isPending}
                      >
                        <ArrowRight className="w-3 h-3 mr-1" /> Mark Ordered
                      </Button>
                    )}
                    {gate.key === 'awaiting_delivery' && canApprove && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] text-primary hover:bg-primary/10"
                        onClick={() => handleAdvanceGate(item, { received: true, received_date: new Date().toISOString().split('T')[0] } as any)}
                        disabled={updateItem.isPending}
                      >
                        <ArrowRight className="w-3 h-3 mr-1" /> Mark Received
                      </Button>
                    )}
                    {gate.key === 'ready_install' && canApprove && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] text-status-safe hover:bg-status-safe-bg"
                        onClick={() => handleAdvanceGate(item, { installed: true, installed_date: new Date().toISOString().split('T')[0] } as any)}
                        disabled={updateItem.isPending}
                      >
                        <ArrowRight className="w-3 h-3 mr-1" /> Mark Installed
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {gate.items.length > 8 && (
                <p className="text-[10px] text-muted-foreground px-3">+{gate.items.length - 8} more items</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
