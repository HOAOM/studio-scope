// War Room Data Types for Interior Design Project Management

export type StatusLevel = 'safe' | 'at-risk' | 'unsafe';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'revision';

export type BOQCategory = 
  | 'joinery' 
  | 'loose-furniture' 
  | 'lighting' 
  | 'finishes' 
  | 'ffe' 
  | 'accessories' 
  | 'appliances';

export type BOQCoverage = 'present' | 'missing' | 'to-confirm';

export interface ProjectKPIs {
  boqCompleteness: number;
  itemApprovalCoverage: number;
  procurementReadiness: number;
  deliveryRiskIndicator: number;
  installationReadiness: number;
}

export interface BOQCategoryStatus {
  category: BOQCategory;
  status: BOQCoverage;
  itemCount: number;
  approvedCount: number;
}

export interface ProjectItem {
  id: string;
  category: BOQCategory;
  area: string;
  description: string;
  image3DRef?: string;
  boqIncluded: boolean;
  approvalStatus: ApprovalStatus;
  purchased: boolean;
  purchaseOrderRef?: string;
  productionDueDate?: string;
  deliveryDate?: string;
  received: boolean;
  receivedDate?: string;
  installed: boolean;
  installedDate?: string;
  supplier?: string;
  unitCost?: number;
  quantity?: number;
  notes?: string;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  client: string;
  location?: string;
  startDate: string;
  targetCompletionDate: string;
  boqMasterRef: string;
  boqVersion: string;
  lastUpdateDate: string;
  projectManager?: string;
  kpis: ProjectKPIs;
  boqCoverage: BOQCategoryStatus[];
  items: ProjectItem[];
}

// Helper functions for status calculation
export function calculateItemStatus(item: ProjectItem): StatusLevel {
  // Missing BOQ or Approval → Red
  if (!item.boqIncluded || item.approvalStatus === 'rejected') {
    return 'unsafe';
  }
  
  // Pending approval → Yellow
  if (item.approvalStatus === 'pending' || item.approvalStatus === 'revision') {
    return 'at-risk';
  }
  
  // Approved but not Ordered → Yellow
  if (item.approvalStatus === 'approved' && !item.purchased) {
    return 'at-risk';
  }
  
  // Ordered, not Received → Yellow
  if (item.purchased && !item.received) {
    return 'at-risk';
  }
  
  // Received but not Installed → Yellow
  if (item.received && !item.installed) {
    return 'at-risk';
  }
  
  // Received and Installed → Green
  if (item.received && item.installed) {
    return 'safe';
  }
  
  return 'at-risk';
}

export function calculateOverallStatus(kpis: ProjectKPIs): StatusLevel {
  const avgScore = (
    kpis.boqCompleteness + 
    kpis.itemApprovalCoverage + 
    kpis.procurementReadiness + 
    (100 - kpis.deliveryRiskIndicator) + 
    kpis.installationReadiness
  ) / 5;
  
  if (avgScore >= 80) return 'safe';
  if (avgScore >= 50) return 'at-risk';
  return 'unsafe';
}

export function getKPIStatus(value: number, inverse: boolean = false): StatusLevel {
  const effectiveValue = inverse ? 100 - value : value;
  if (effectiveValue >= 80) return 'safe';
  if (effectiveValue >= 50) return 'at-risk';
  return 'unsafe';
}

export function getCategoryLabel(category: BOQCategory): string {
  const labels: Record<BOQCategory, string> = {
    'joinery': 'Joinery',
    'loose-furniture': 'Loose Furniture',
    'lighting': 'Lighting',
    'finishes': 'Finishes',
    'ffe': 'FF&E',
    'accessories': 'Accessories',
    'appliances': 'Appliances',
  };
  return labels[category];
}

export function getApprovalLabel(status: ApprovalStatus): string {
  const labels: Record<ApprovalStatus, string> = {
    'pending': 'Pending',
    'approved': 'Approved',
    'rejected': 'Rejected',
    'revision': 'In Revision',
  };
  return labels[status];
}
