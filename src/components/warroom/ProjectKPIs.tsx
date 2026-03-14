import { useMemo } from 'react';
import { KPIBlock } from './KPIBlock';
import { Database } from '@/integrations/supabase/types';
import { computeProjectKPIs as computeKPIsFromWorkflow, getLifecycleIndex, LIFECYCLE_ORDER } from '@/lib/workflow';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface ProjectKPIsProps {
  items: ProjectItem[];
}

// Backward compat export
export function computeKPIs(items: ProjectItem[]) {
  const total = items.length;
  if (total === 0) {
    return {
      boqCompleteness: 0,
      itemApprovalCoverage: 0,
      procurementReadiness: 0,
      deliveryRiskIndicator: 0,
      installationReadiness: 0,
    };
  }

  const boqIncluded = items.filter(i => i.boq_included).length;
  const now = new Date();
  const deliveryAtRisk = items.filter(i => {
    if (!i.delivery_date || i.received) return false;
    return new Date(i.delivery_date) < now;
  }).length;

  // Use new workflow KPIs
  const wfKpis = computeKPIsFromWorkflow(items.map(i => ({ lifecycle_status: i.lifecycle_status })));

  return {
    boqCompleteness: Math.round((boqIncluded / total) * 100),
    itemApprovalCoverage: wfKpis.clientBoardSigned,
    procurementReadiness: wfKpis.poIssued,
    deliveryRiskIndicator: Math.round((deliveryAtRisk / total) * 100),
    installationReadiness: wfKpis.installed,
  };
}

export function ProjectKPIs({ items }: ProjectKPIsProps) {
  const wfKpis = useMemo(() => computeKPIsFromWorkflow(items.map(i => ({ lifecycle_status: i.lifecycle_status }))), [items]);
  const legacyKpis = useMemo(() => computeKPIs(items), [items]);

  return (
    <div className="space-y-4">
      {/* Primary KPIs - Workflow phases */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPIBlock label="Design Approved" value={wfKpis.designApproved} />
        <KPIBlock label="Finishes Approved" value={wfKpis.finishesApproved} />
        <KPIBlock label="Board Signed" value={wfKpis.clientBoardSigned} />
        <KPIBlock label="PO Issued" value={wfKpis.poIssued} />
        <KPIBlock label="Payment Done" value={wfKpis.paymentExecuted} />
      </div>
      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KPIBlock label="In Production" value={wfKpis.inProduction} />
        <KPIBlock label="Delivered" value={wfKpis.delivered} />
        <KPIBlock label="Installed" value={wfKpis.installed} />
        <KPIBlock label="Closed" value={wfKpis.closed} />
        <KPIBlock label="Delivery Risk" value={legacyKpis.deliveryRiskIndicator} inverse />
      </div>
    </div>
  );
}
