/**
 * LifecycleChecklist — Visual checklist of the 25-state lifecycle
 * Green = completed, Highlighted = current (with action button for authorized role), Gray = future.
 * Follows checklist + sequence logic: each step is visible to all but actionable only by the right role.
 */
import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  LIFECYCLE_ORDER,
  LIFECYCLE_LABELS,
  LIFECYCLE_COLORS,
  STATE_TRANSITIONS,
  getLifecycleIndex,
  getAvailableTransitions,
  type AppRole,
  type ItemLifecycleStatus,
} from '@/lib/workflow';
import {
  CheckCircle2,
  Circle,
  ArrowRight,
  Pause,
  XOctagon,
} from 'lucide-react';

interface LifecycleChecklistProps {
  currentStatus: string | null;
  userRoles: AppRole[];
  onTransition: (toStatus: ItemLifecycleStatus) => void;
  isPending?: boolean;
}

/** Group lifecycle states into phases for visual grouping */
const PHASE_GROUPS: { label: string; states: ItemLifecycleStatus[] }[] = [
  {
    label: 'Design',
    states: ['concept', 'in_design', 'design_ready', 'finishes_proposed', 'finishes_approved_designer', 'finishes_approved_hod'],
  },
  {
    label: 'Client',
    states: ['client_board_ready', 'client_board_waiting_signature', 'client_board_signed'],
  },
  {
    label: 'Procurement',
    states: ['quotation_preparation', 'quotation_inserted', 'quotation_approved_ops', 'quotation_approved_high'],
  },
  {
    label: 'Purchase & Payment',
    states: ['po_issued', 'proforma_received', 'payment_approval', 'payment_executed'],
  },
  {
    label: 'Production & Delivery',
    states: ['in_production', 'ready_to_ship', 'in_delivery', 'delivered_to_site'],
  },
  {
    label: 'Installation & Close',
    states: ['installation_planned', 'installed', 'snagging', 'closed'],
  },
];

export function LifecycleChecklist({ currentStatus, userRoles, onTransition, isPending }: LifecycleChecklistProps) {
  const currentIdx = getLifecycleIndex(currentStatus);
  const isSpecialState = currentStatus === 'on_hold' || currentStatus === 'cancelled';

  // Get available transitions for the current user
  const availableTransitions = useMemo(() => {
    return getAvailableTransitions(currentStatus, userRoles);
  }, [currentStatus, userRoles]);

  // Which roles can action the NEXT normal transition
  const nextNormalTransition = useMemo(() => {
    const normalStatuses = STATE_TRANSITIONS[currentStatus || 'concept'] || [];
    return normalStatuses.length > 0 ? normalStatuses[0] : null;
  }, [currentStatus]);

  // Check if user can perform the next forward transition
  const canUserAdvance = useMemo(() => {
    if (!nextNormalTransition) return false;
    return nextNormalTransition.roles.some(r => userRoles.includes(r));
  }, [nextNormalTransition, userRoles]);

  return (
    <div className="space-y-4">
      {/* Special state banner */}
      {isSpecialState && (
        <div className={cn(
          'flex items-center gap-3 rounded-lg p-3 border',
          currentStatus === 'on_hold'
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-700'
            : 'bg-destructive/10 border-destructive/30 text-destructive'
        )}>
          {currentStatus === 'on_hold' ? (
            <Pause className="w-4 h-4 shrink-0" />
          ) : (
            <XOctagon className="w-4 h-4 shrink-0" />
          )}
          <span className="text-sm font-medium">
            {currentStatus === 'on_hold' ? 'Item is On Hold' : 'Item is Cancelled'}
          </span>
          {availableTransitions.filter(t => t.to !== 'cancelled' && t.to !== 'on_hold').map(t => (
            <Button
              key={t.to}
              size="sm"
              variant="outline"
              className="ml-auto h-7 text-xs"
              onClick={() => onTransition(t.to)}
              disabled={isPending}
            >
              {t.label}
            </Button>
          ))}
        </div>
      )}

      {/* Phase groups */}
      {PHASE_GROUPS.map((phase) => {
        // Determine phase completion status
        const phaseIndices = phase.states.map(s => LIFECYCLE_ORDER.indexOf(s));
        const phaseMin = Math.min(...phaseIndices);
        const phaseMax = Math.max(...phaseIndices);
        const isPhaseComplete = !isSpecialState && currentIdx > phaseMax;
        const isPhaseActive = !isSpecialState && currentIdx >= phaseMin && currentIdx <= phaseMax;
        const isPhaseFuture = isSpecialState || currentIdx < phaseMin;

        return (
          <div key={phase.label} className="space-y-0.5">
            {/* Phase header */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn(
                'text-[11px] font-semibold uppercase tracking-wider',
                isPhaseComplete ? 'text-primary' :
                isPhaseActive ? 'text-foreground' :
                'text-muted-foreground/60'
              )}>
                {phase.label}
              </span>
              {isPhaseComplete && (
                <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-primary/10 text-primary">
                  Complete
                </Badge>
              )}
            </div>

            {/* Steps */}
            <div className="space-y-0">
              {phase.states.map((status, i) => {
                const stepIdx = LIFECYCLE_ORDER.indexOf(status);
                const isComplete = !isSpecialState && currentIdx > stepIdx;
                const isCurrent = !isSpecialState && currentIdx === stepIdx;
                const isFuture = isSpecialState || currentIdx < stepIdx;
                const colors = LIFECYCLE_COLORS[status] || LIFECYCLE_COLORS['concept'];

                // Find the forward transition for this step (if it's current)
                const forwardTransition = isCurrent
                  ? availableTransitions.find(t => {
                      const tIdx = LIFECYCLE_ORDER.indexOf(t.to);
                      return tIdx > stepIdx && t.to !== 'on_hold' && t.to !== 'cancelled';
                    })
                  : null;

                // Get who's responsible for this step's transition
                const transitionsFromHere = STATE_TRANSITIONS[status] || [];
                const responsibleRoles = transitionsFromHere.length > 0
                  ? transitionsFromHere[0].roles.filter(r => !['admin', 'coo'].includes(r))
                  : [];

                const isLastInPhase = i === phase.states.length - 1;

                return (
                  <div key={status} className="flex items-stretch gap-0">
                    {/* Timeline connector */}
                    <div className="flex flex-col items-center w-6 shrink-0">
                      {/* Icon */}
                      <div className={cn(
                        'w-5 h-5 rounded-full flex items-center justify-center shrink-0 z-10',
                        isComplete ? 'bg-primary text-primary-foreground' :
                        isCurrent ? 'bg-primary/20 border-2 border-primary' :
                        'bg-muted border border-border'
                      )}>
                        {isComplete ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : isCurrent ? (
                          <Circle className="w-2.5 h-2.5 fill-primary text-primary" />
                        ) : (
                          <Circle className="w-2.5 h-2.5 text-muted-foreground/40" />
                        )}
                      </div>
                      {/* Line */}
                      {!isLastInPhase && (
                        <div className={cn(
                          'w-px flex-1 min-h-[8px]',
                          isComplete ? 'bg-primary/40' : 'bg-border'
                        )} />
                      )}
                    </div>

                    {/* Content */}
                    <div className={cn(
                      'flex-1 flex items-center justify-between py-1 px-2 rounded-md -ml-0.5 min-h-[32px]',
                      isCurrent && 'bg-primary/5 border border-primary/20',
                    )}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          'text-xs font-medium',
                          isComplete ? 'text-primary' :
                          isCurrent ? 'text-foreground font-semibold' :
                          'text-muted-foreground/50'
                        )}>
                          {LIFECYCLE_LABELS[status]}
                        </span>
                        {isCurrent && responsibleRoles.length > 0 && (
                          <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded hidden sm:inline-block">
                            {responsibleRoles.slice(0, 2).map(r => r.replace(/_/g, ' ')).join(', ')}
                          </span>
                        )}
                      </div>

                      {/* Action button for current step */}
                      {isCurrent && forwardTransition && (
                        <Button
                          size="sm"
                          className="h-6 text-[10px] px-2 ml-2 shrink-0"
                          onClick={() => onTransition(forwardTransition.to)}
                          disabled={isPending}
                        >
                          <ArrowRight className="w-3 h-3 mr-0.5" />
                          {forwardTransition.label}
                        </Button>
                      )}
                      {isCurrent && !forwardTransition && !canUserAdvance && transitionsFromHere.length > 0 && (
                        <span className="text-[9px] text-muted-foreground italic ml-2 shrink-0">
                          Waiting for approval
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
