/**
 * SectionResponsibilityPanel — Shows the responsible team member(s) for each
 * macro-phase of a project, derived from project_members + workflow role mapping.
 *
 * No new tables: maps existing role assignments to macro-phases. Highlights gaps
 * (phases with nobody assigned) so the PM can fix the team before kickoff.
 */
import { useMemo } from 'react';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, ShieldCheck, Users } from 'lucide-react';
import type { TaskMacroArea, AppRole } from '@/lib/workflow';
import { MACRO_PHASES } from '@/lib/workflow';
import { cn } from '@/lib/utils';

/** Roles primarily responsible for each macro-phase (validation hierarchy). */
const PHASE_OWNERS: Record<TaskMacroArea, AppRole[]> = {
  planning: ['project_manager', 'coo', 'admin'],
  design_validation: ['head_of_design', 'designer', 'architectural_dept'],
  procurement: ['procurement_manager', 'qs', 'accountant'],
  production: ['procurement_manager', 'project_manager'],
  delivery: ['site_engineer', 'project_manager'],
  installation: ['site_engineer', 'project_manager'],
  closing: ['project_manager', 'coo'],
  custom: ['project_manager'],
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin', coo: 'COO', ceo: 'CEO',
  designer: 'Designer', head_of_design: 'Head of Design', architectural_dept: 'Architectural',
  qs: 'QS', accountant: 'Accountant', head_of_payments: 'Head of Payments',
  procurement_manager: 'Procurement Mgr', project_manager: 'Project Mgr',
  site_engineer: 'Site Engineer', mep_engineer: 'MEP Engineer', client: 'Client',
};

interface SectionResponsibilityPanelProps {
  projectId: string;
}

export function SectionResponsibilityPanel({ projectId }: SectionResponsibilityPanelProps) {
  const { data: members = [], isLoading } = useProjectMembers(projectId);

  const matrix = useMemo(() => {
    return MACRO_PHASES.map((phase) => {
      const owners = PHASE_OWNERS[phase.key] || [];
      const assigned = members.filter((m: any) => owners.includes(m.role as AppRole));
      return {
        key: phase.key,
        label: phase.label,
        ownerRoles: owners,
        assigned,
        isGap: assigned.length === 0,
      };
    });
  }, [members]);

  const gaps = matrix.filter((m) => m.isGap).length;

  return (
    <Card className="border-border">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Users className="h-4 w-4" /> Section Responsibility
        </CardTitle>
        {gaps > 0 ? (
          <Badge variant="destructive" className="text-[10px]">
            {gaps} unassigned phase{gaps > 1 ? 's' : ''}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] gap-1">
            <ShieldCheck className="h-3 w-3" /> All phases covered
          </Badge>
        )}
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="text-xs text-muted-foreground py-4">Loading team…</div>
        ) : (
          <div className="space-y-1.5">
            {matrix.map((row) => (
              <div
                key={row.key}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-xs',
                  row.isGap ? 'bg-destructive/5 border border-destructive/30' : 'bg-muted/30',
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {row.isGap && <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />}
                  <span className="font-medium text-foreground truncate">{row.label}</span>
                  <span className="text-[10px] text-muted-foreground hidden sm:inline">
                    {row.ownerRoles.map((r) => ROLE_LABELS[r] || r).join(' · ')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1 justify-end">
                  {row.assigned.length === 0 ? (
                    <span className="text-[10px] text-destructive font-medium">No owner</span>
                  ) : (
                    row.assigned.slice(0, 4).map((m: any) => (
                      <Badge key={m.id} variant="secondary" className="text-[10px] font-normal">
                        {m.profile?.display_name || m.profile?.email?.split('@')[0] || 'User'}
                        <span className="text-muted-foreground ml-1">· {ROLE_LABELS[m.role] || m.role}</span>
                      </Badge>
                    ))
                  )}
                  {row.assigned.length > 4 && (
                    <span className="text-[10px] text-muted-foreground">+{row.assigned.length - 4}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[10px] text-muted-foreground">
          Phase owners are derived from project team roles. Update the Team tab to fill gaps.
        </p>
      </CardContent>
    </Card>
  );
}
