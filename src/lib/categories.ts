// Centralized BOQ category labels and mappings
// Update this file when adding/removing categories

import type { Database } from '@/integrations/supabase/types';

export type BOQCategory = Database['public']['Enums']['boq_category'];

/** Human-readable labels for every BOQ category */
export const CATEGORY_LABELS: Record<BOQCategory, string> = {
  'joinery': 'Joinery',
  'loose-furniture': 'Loose Furniture',
  'lighting': 'Lighting',
  'finishes': 'Finishes',
  'ffe': 'FF&E',
  'accessories': 'Accessories',
  'appliances': 'Appliances',
  'hvac': 'HVAC',
  'electrical': 'Electrical',
  'plumbing': 'Plumbing',
  'fire-protection': 'Fire Protection',
  'low-voltage': 'Low Voltage / ICT',
  'sanitary': 'Sanitary',
};

/** Category options for select dropdowns */
export const CATEGORY_OPTIONS: { value: BOQCategory; label: string }[] = Object.entries(CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as BOQCategory, label })
);

/** All valid category enum values */
export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as BOQCategory[];

/** Group label for a category (Interior Design vs MEP/RCP) */
export function getCategoryGroup(cat: BOQCategory): 'Interior Design' | 'MEP / RCP' {
  const mep: BOQCategory[] = ['hvac', 'electrical', 'plumbing', 'fire-protection', 'low-voltage', 'sanitary'];
  return mep.includes(cat) ? 'MEP / RCP' : 'Interior Design';
}

/** Item type code → BOQ category mapping */
export function itemTypeToCategory(typeCode: string): BOQCategory {
  const map: Record<string, BOQCategory> = {
    // Interior Design
    'LF': 'loose-furniture',
    'CF': 'joinery',
    'LT': 'lighting',
    'FL': 'finishes',
    'DR': 'joinery',
    'CL': 'finishes',
    'CT': 'ffe',
    'FX': 'accessories',
    // HVAC
    'AC': 'hvac',
    'HT': 'hvac',
    'VN': 'hvac',
    'TH': 'hvac',
    // Electrical
    'SO': 'electrical',
    'SM': 'electrical',
    'EP': 'electrical',
    'LB': 'electrical',
    // Plumbing
    'WD': 'plumbing',
    'DG': 'plumbing',
    'PF': 'plumbing',
    // Sanitary
    'SN': 'sanitary',
    'BT': 'sanitary',
    // Fire Protection
    'FP': 'fire-protection',
    'FS': 'fire-protection',
    // Low Voltage
    'LV': 'low-voltage',
    'SC': 'low-voltage',
    'AV': 'low-voltage',
    'BM': 'low-voltage',
  };
  return map[typeCode] || 'ffe';
}
