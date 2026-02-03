import { Project, BOQCategory } from '@/types/warroom';

// Mock data representing various project states for the War Room
export const mockProjects: Project[] = [
  {
    id: 'proj-001',
    code: 'VL-2024-001',
    name: 'Villa Serena',
    client: 'Al Rashid Family',
    location: 'Palm Jumeirah, Dubai',
    startDate: '2024-01-15',
    targetCompletionDate: '2024-06-30',
    boqMasterRef: 'BOQ-VL001-R12',
    boqVersion: '12.3',
    lastUpdateDate: '2024-02-01',
    projectManager: 'Sarah Mitchell',
    kpis: {
      boqCompleteness: 92,
      itemApprovalCoverage: 78,
      procurementReadiness: 65,
      deliveryRiskIndicator: 25,
      installationReadiness: 45,
    },
    boqCoverage: [
      { category: 'joinery', status: 'present', itemCount: 45, approvedCount: 38 },
      { category: 'loose-furniture', status: 'present', itemCount: 72, approvedCount: 55 },
      { category: 'lighting', status: 'to-confirm', itemCount: 28, approvedCount: 20 },
      { category: 'finishes', status: 'present', itemCount: 35, approvedCount: 32 },
      { category: 'ffe', status: 'present', itemCount: 120, approvedCount: 95 },
      { category: 'accessories', status: 'missing', itemCount: 0, approvedCount: 0 },
      { category: 'appliances', status: 'present', itemCount: 18, approvedCount: 18 },
    ],
    items: generateItems('proj-001', 85),
  },
  {
    id: 'proj-002',
    code: 'PH-2024-002',
    name: 'Skyline Penthouse',
    client: 'Chen Holdings',
    location: 'Downtown Dubai',
    startDate: '2024-02-01',
    targetCompletionDate: '2024-08-15',
    boqMasterRef: 'BOQ-PH002-R08',
    boqVersion: '8.1',
    lastUpdateDate: '2024-01-28',
    projectManager: 'Marco Rossi',
    kpis: {
      boqCompleteness: 45,
      itemApprovalCoverage: 35,
      procurementReadiness: 20,
      deliveryRiskIndicator: 72,
      installationReadiness: 10,
    },
    boqCoverage: [
      { category: 'joinery', status: 'to-confirm', itemCount: 32, approvedCount: 12 },
      { category: 'loose-furniture', status: 'missing', itemCount: 0, approvedCount: 0 },
      { category: 'lighting', status: 'missing', itemCount: 0, approvedCount: 0 },
      { category: 'finishes', status: 'to-confirm', itemCount: 22, approvedCount: 8 },
      { category: 'ffe', status: 'present', itemCount: 45, approvedCount: 18 },
      { category: 'accessories', status: 'missing', itemCount: 0, approvedCount: 0 },
      { category: 'appliances', status: 'to-confirm', itemCount: 12, approvedCount: 5 },
    ],
    items: generateItems('proj-002', 45),
  },
  {
    id: 'proj-003',
    code: 'BR-2024-003',
    name: 'Boutique Resort Suites',
    client: 'Luxe Hospitality Group',
    location: 'Ras Al Khaimah',
    startDate: '2023-11-01',
    targetCompletionDate: '2024-04-30',
    boqMasterRef: 'BOQ-BR003-R22',
    boqVersion: '22.0',
    lastUpdateDate: '2024-02-02',
    projectManager: 'Emma Thompson',
    kpis: {
      boqCompleteness: 98,
      itemApprovalCoverage: 95,
      procurementReadiness: 88,
      deliveryRiskIndicator: 15,
      installationReadiness: 72,
    },
    boqCoverage: [
      { category: 'joinery', status: 'present', itemCount: 156, approvedCount: 150 },
      { category: 'loose-furniture', status: 'present', itemCount: 234, approvedCount: 220 },
      { category: 'lighting', status: 'present', itemCount: 89, approvedCount: 85 },
      { category: 'finishes', status: 'present', itemCount: 67, approvedCount: 65 },
      { category: 'ffe', status: 'present', itemCount: 312, approvedCount: 298 },
      { category: 'accessories', status: 'present', itemCount: 145, approvedCount: 138 },
      { category: 'appliances', status: 'present', itemCount: 78, approvedCount: 76 },
    ],
    items: generateItems('proj-003', 180),
  },
  {
    id: 'proj-004',
    code: 'OF-2024-004',
    name: 'Corporate HQ Redesign',
    client: 'Emirates Finance Corp',
    location: 'DIFC, Dubai',
    startDate: '2024-01-20',
    targetCompletionDate: '2024-05-15',
    boqMasterRef: 'BOQ-OF004-R05',
    boqVersion: '5.2',
    lastUpdateDate: '2024-01-30',
    projectManager: 'Ahmed Hassan',
    kpis: {
      boqCompleteness: 72,
      itemApprovalCoverage: 58,
      procurementReadiness: 42,
      deliveryRiskIndicator: 45,
      installationReadiness: 25,
    },
    boqCoverage: [
      { category: 'joinery', status: 'present', itemCount: 78, approvedCount: 52 },
      { category: 'loose-furniture', status: 'present', itemCount: 156, approvedCount: 89 },
      { category: 'lighting', status: 'to-confirm', itemCount: 45, approvedCount: 22 },
      { category: 'finishes', status: 'present', itemCount: 34, approvedCount: 28 },
      { category: 'ffe', status: 'to-confirm', itemCount: 89, approvedCount: 45 },
      { category: 'accessories', status: 'missing', itemCount: 0, approvedCount: 0 },
      { category: 'appliances', status: 'present', itemCount: 23, approvedCount: 18 },
    ],
    items: generateItems('proj-004', 95),
  },
  {
    id: 'proj-005',
    code: 'RS-2024-005',
    name: 'Royal Suite Renovation',
    client: 'Al Maktoum Investments',
    location: 'Emirates Hills',
    startDate: '2023-12-01',
    targetCompletionDate: '2024-03-31',
    boqMasterRef: 'BOQ-RS005-R18',
    boqVersion: '18.5',
    lastUpdateDate: '2024-02-03',
    projectManager: 'Sarah Mitchell',
    kpis: {
      boqCompleteness: 100,
      itemApprovalCoverage: 100,
      procurementReadiness: 95,
      deliveryRiskIndicator: 8,
      installationReadiness: 85,
    },
    boqCoverage: [
      { category: 'joinery', status: 'present', itemCount: 28, approvedCount: 28 },
      { category: 'loose-furniture', status: 'present', itemCount: 45, approvedCount: 45 },
      { category: 'lighting', status: 'present', itemCount: 32, approvedCount: 32 },
      { category: 'finishes', status: 'present', itemCount: 18, approvedCount: 18 },
      { category: 'ffe', status: 'present', itemCount: 67, approvedCount: 67 },
      { category: 'accessories', status: 'present', itemCount: 34, approvedCount: 34 },
      { category: 'appliances', status: 'present', itemCount: 12, approvedCount: 12 },
    ],
    items: generateItems('proj-005', 65),
  },
  {
    id: 'proj-006',
    code: 'YT-2024-006',
    name: 'Yacht Interior Fit-out',
    client: 'Maritime Luxury LLC',
    location: 'Dubai Marina',
    startDate: '2024-01-10',
    targetCompletionDate: '2024-07-20',
    boqMasterRef: 'BOQ-YT006-R03',
    boqVersion: '3.0',
    lastUpdateDate: '2024-01-25',
    projectManager: 'Marco Rossi',
    kpis: {
      boqCompleteness: 28,
      itemApprovalCoverage: 15,
      procurementReadiness: 5,
      deliveryRiskIndicator: 85,
      installationReadiness: 0,
    },
    boqCoverage: [
      { category: 'joinery', status: 'to-confirm', itemCount: 45, approvedCount: 8 },
      { category: 'loose-furniture', status: 'missing', itemCount: 0, approvedCount: 0 },
      { category: 'lighting', status: 'missing', itemCount: 0, approvedCount: 0 },
      { category: 'finishes', status: 'to-confirm', itemCount: 28, approvedCount: 5 },
      { category: 'ffe', status: 'missing', itemCount: 0, approvedCount: 0 },
      { category: 'accessories', status: 'missing', itemCount: 0, approvedCount: 0 },
      { category: 'appliances', status: 'missing', itemCount: 0, approvedCount: 0 },
    ],
    items: generateItems('proj-006', 25),
  },
];

// Helper to generate realistic items for each project
function generateItems(projectId: string, count: number): Project['items'] {
  const categories: BOQCategory[] = ['joinery', 'loose-furniture', 'lighting', 'finishes', 'ffe', 'accessories', 'appliances'];
  const areas = ['Living Room', 'Master Bedroom', 'Kitchen', 'Dining', 'Study', 'Guest Suite', 'Terrace', 'Entrance', 'Bathroom', 'Walk-in Closet'];
  
  const itemDescriptions: Record<BOQCategory, string[]> = {
    'joinery': ['Built-in Wardrobe', 'Kitchen Cabinets', 'TV Unit', 'Bookshelf', 'Vanity Unit', 'Bar Counter', 'Storage Cabinet'],
    'loose-furniture': ['Sofa 3-seater', 'Armchair', 'Dining Table', 'Dining Chairs', 'Bed Frame', 'Side Table', 'Console Table', 'Ottoman'],
    'lighting': ['Pendant Light', 'Chandelier', 'Wall Sconce', 'Floor Lamp', 'Table Lamp', 'Recessed Downlight', 'LED Strip'],
    'finishes': ['Wall Paint', 'Wallpaper', 'Floor Tiles', 'Wall Tiles', 'Carpet', 'Wood Flooring', 'Stone Cladding'],
    'ffe': ['Curtains', 'Blinds', 'Cushions', 'Throws', 'Rugs', 'Bedding Set', 'Towel Set', 'Artwork'],
    'accessories': ['Vase', 'Sculpture', 'Photo Frame', 'Candle Holder', 'Decorative Bowl', 'Books', 'Plants'],
    'appliances': ['Refrigerator', 'Oven', 'Dishwasher', 'Washing Machine', 'Air Conditioner', 'Wine Cooler', 'Coffee Machine'],
  };
  
  const suppliers = ['Poliform', 'B&B Italia', 'Minotti', 'Flos', 'Artemide', 'Miele', 'Sub-Zero', 'Roche Bobois', 'Cassina', 'Knoll'];
  
  const items: Project['items'] = [];
  
  for (let i = 0; i < count; i++) {
    const category = categories[i % categories.length];
    const descriptions = itemDescriptions[category];
    const description = descriptions[Math.floor(Math.random() * descriptions.length)];
    const area = areas[Math.floor(Math.random() * areas.length)];
    
    // Create varied states based on project progress
    const progressFactor = Math.random();
    const boqIncluded = progressFactor > 0.15;
    const approvalStatus = !boqIncluded ? 'pending' : 
      progressFactor > 0.85 ? 'approved' : 
      progressFactor > 0.7 ? 'approved' : 
      progressFactor > 0.4 ? 'pending' : 
      progressFactor > 0.25 ? 'revision' : 'rejected';
    const purchased = approvalStatus === 'approved' && progressFactor > 0.5;
    const received = purchased && progressFactor > 0.7;
    const installed = received && progressFactor > 0.85;
    
    items.push({
      id: `${projectId}-ITM-${String(i + 1).padStart(4, '0')}`,
      category,
      area,
      description: `${description} - ${area}`,
      boqIncluded,
      approvalStatus: approvalStatus as any,
      purchased,
      purchaseOrderRef: purchased ? `PO-${projectId.split('-')[1]}-${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}` : undefined,
      productionDueDate: purchased ? '2024-03-15' : undefined,
      deliveryDate: purchased ? '2024-04-01' : undefined,
      received,
      receivedDate: received ? '2024-03-28' : undefined,
      installed,
      installedDate: installed ? '2024-04-05' : undefined,
      supplier: suppliers[Math.floor(Math.random() * suppliers.length)],
      unitCost: Math.floor(Math.random() * 50000) + 500,
      quantity: Math.floor(Math.random() * 10) + 1,
    });
  }
  
  return items;
}

export function getProjectById(id: string): Project | undefined {
  return mockProjects.find(p => p.id === id);
}
