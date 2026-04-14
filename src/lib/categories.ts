// Centralized BOQ category labels and mappings
// Update this file when adding/removing categories

// We define our own type to stay ahead of the auto-generated DB types
export type BOQCategoryExtended =
  | 'joinery' | 'loose-furniture' | 'lighting' | 'finishes' | 'ffe'
  | 'accessories' | 'appliances'
  | 'hvac' | 'electrical' | 'plumbing' | 'fire-protection' | 'low-voltage' | 'sanitary';

/** Human-readable labels for every BOQ category */
export const CATEGORY_LABELS: Record<BOQCategoryExtended, string> = {
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
export const CATEGORY_OPTIONS: { value: string; label: string }[] = Object.entries(CATEGORY_LABELS).map(
  ([value, label]) => ({ value, label })
);

/** All valid category enum values */
export const ALL_CATEGORIES = Object.keys(CATEGORY_LABELS) as BOQCategoryExtended[];

/** Group label for a category (Interior Design vs MEP/RCP) */
export function getCategoryGroup(cat: string): 'Interior Design' | 'MEP / RCP' {
  const mep = ['hvac', 'electrical', 'plumbing', 'fire-protection', 'low-voltage', 'sanitary'];
  return mep.includes(cat) ? 'MEP / RCP' : 'Interior Design';
}

/** Get label for any category string */
export function getCategoryLabel(cat: string): string {
  return (CATEGORY_LABELS as Record<string, string>)[cat] || cat;
}

/** Item type code → BOQ category mapping */
export function itemTypeToCategory(typeCode: string): string {
  const map: Record<string, string> = {
    'LF': 'loose-furniture', 'CF': 'joinery', 'LT': 'lighting', 'FL': 'finishes',
    'DR': 'joinery', 'CL': 'finishes', 'CT': 'ffe', 'FX': 'accessories',
    'AC': 'hvac', 'HT': 'hvac', 'VN': 'hvac', 'TH': 'hvac',
    'SO': 'electrical', 'SM': 'electrical', 'EP': 'electrical', 'LB': 'electrical',
    'WD': 'plumbing', 'DG': 'plumbing', 'PF': 'plumbing',
    'SN': 'sanitary', 'BT': 'sanitary',
    'FP': 'fire-protection', 'FS': 'fire-protection',
    'LV': 'low-voltage', 'SC': 'low-voltage', 'AV': 'low-voltage', 'BM': 'low-voltage',
  };
  return map[typeCode] || 'ffe';
}
