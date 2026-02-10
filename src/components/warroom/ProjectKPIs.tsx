import { useMemo } from 'react';
import { KPIBlock } from './KPIBlock';
import { Database } from '@/integrations/supabase/types';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface ProjectKPIsProps {
  items: ProjectItem[];
}

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
  const approved = items.filter(i => i.approval_status === 'approved').length;
  const purchased = items.filter(i => i.purchased).length;
  const now = new Date();
  const deliveryAtRisk = items.filter(i => {
    if (!i.delivery_date || i.received) return false;
    return new Date(i.delivery_date) < now;
  }).length;
  const installed = items.filter(i => i.installed).length;

  return {
    boqCompleteness: Math.round((boqIncluded / total) * 100),
    itemApprovalCoverage: Math.round((approved / total) * 100),
    procurementReadiness: Math.round((purchased / total) * 100),
    deliveryRiskIndicator: Math.round((deliveryAtRisk / total) * 100),
    installationReadiness: Math.round((installed / total) * 100),
  };
}

export function ProjectKPIs({ items }: ProjectKPIsProps) {
  const kpis = useMemo(() => computeKPIs(items), [items]);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
      <KPIBlock label="BOQ Complete" value={kpis.boqCompleteness} />
      <KPIBlock label="Approved" value={kpis.itemApprovalCoverage} />
      <KPIBlock label="Procurement" value={kpis.procurementReadiness} />
      <KPIBlock label="Delivery Risk" value={kpis.deliveryRiskIndicator} inverse />
      <KPIBlock label="Installation" value={kpis.installationReadiness} />
    </div>
  );
}
