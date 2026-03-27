/**
 * Predefined task templates with completion conditions.
 * Each template maps to specific item fields that must be filled
 * for the task to auto-complete.
 */

export interface TaskTemplate {
  key: string;
  label: string;
  description: string;
  /** Item fields that must be non-null/non-empty for auto-completion */
  completionFields: string[];
  /** Human-readable description of what needs to be done */
  completionHint: string;
  /** Which macro phase this typically belongs to */
  suggestedPhase: string;
}

export const TASK_TEMPLATES: TaskTemplate[] = [
  // Planning & Prep
  {
    key: 'define_dimensions',
    label: 'Define Dimensions',
    description: 'Compile item dimensions and specifications',
    completionFields: ['dimensions'],
    completionHint: 'Fill in the "Dimensions" field on the item',
    suggestedPhase: 'planning',
  },
  {
    key: 'define_area',
    label: 'Define Area / Location',
    description: 'Set area, floor, room for the item',
    completionFields: ['floor_id', 'room_id'],
    completionHint: 'Set Floor and Room on the item',
    suggestedPhase: 'planning',
  },

  // Design Validation
  {
    key: 'finish_selection',
    label: 'Finish Selection',
    description: 'Select material, color, and finish details',
    completionFields: ['finish_material', 'finish_color'],
    completionHint: 'Fill in "Finish Material" and "Finish Color"',
    suggestedPhase: 'design_validation',
  },
  {
    key: 'upload_reference_image',
    label: 'Upload Reference Image',
    description: 'Provide reference image or product URL',
    completionFields: ['reference_image_url'],
    completionHint: 'Upload or link a reference image',
    suggestedPhase: 'design_validation',
  },
  {
    key: 'upload_3d_reference',
    label: 'Upload 3D Reference',
    description: 'Provide 3D model reference',
    completionFields: ['image_3d_ref'],
    completionHint: 'Upload or link a 3D reference',
    suggestedPhase: 'design_validation',
  },
  {
    key: 'company_product_link',
    label: 'Add Product Link',
    description: 'Add company/supplier product page URL',
    completionFields: ['company_product_url'],
    completionHint: 'Paste the product URL from the supplier',
    suggestedPhase: 'design_validation',
  },

  // Procurement
  {
    key: 'upload_technical_drawing',
    label: 'Upload Technical Drawing',
    description: 'Upload approved technical/shop drawing',
    completionFields: ['technical_drawing_url'],
    completionHint: 'Upload or link the technical drawing',
    suggestedPhase: 'procurement',
  },
  {
    key: 'upload_proforma',
    label: 'Upload Proforma',
    description: 'Upload proforma invoice from supplier',
    completionFields: ['proforma_url'],
    completionHint: 'Upload or link the proforma document',
    suggestedPhase: 'procurement',
  },
  {
    key: 'set_supplier',
    label: 'Set Supplier',
    description: 'Assign a supplier to this item',
    completionFields: ['supplier'],
    completionHint: 'Fill in the "Supplier" field',
    suggestedPhase: 'procurement',
  },
  {
    key: 'set_unit_cost',
    label: 'Set Unit Cost',
    description: 'Define the unit cost for the item',
    completionFields: ['unit_cost'],
    completionHint: 'Fill in the "Unit Cost" field',
    suggestedPhase: 'procurement',
  },
  {
    key: 'issue_po',
    label: 'Issue Purchase Order',
    description: 'Create and assign PO number',
    completionFields: ['po_number'],
    completionHint: 'Fill in the "PO Number" field',
    suggestedPhase: 'procurement',
  },

  // Production
  {
    key: 'set_production_dates',
    label: 'Set Production Schedule',
    description: 'Define production time and due date',
    completionFields: ['production_time', 'production_due_date'],
    completionHint: 'Fill in "Production Time" and "Production Due Date"',
    suggestedPhase: 'production',
  },

  // Delivery
  {
    key: 'set_delivery_date',
    label: 'Set Delivery Date',
    description: 'Confirm expected delivery date',
    completionFields: ['delivery_date'],
    completionHint: 'Fill in the "Delivery Date" field',
    suggestedPhase: 'delivery',
  },
  {
    key: 'confirm_received',
    label: 'Confirm Item Received',
    description: 'Mark item as received at warehouse/site',
    completionFields: ['received_date'],
    completionHint: 'Fill in "Received Date" (marks item as received)',
    suggestedPhase: 'delivery',
  },

  // Installation
  {
    key: 'set_installation_date',
    label: 'Set Installation Date',
    description: 'Schedule installation start',
    completionFields: ['installation_start_date'],
    completionHint: 'Fill in the "Installation Start Date" field',
    suggestedPhase: 'installation',
  },
  {
    key: 'confirm_installed',
    label: 'Confirm Installation',
    description: 'Confirm item has been installed',
    completionFields: ['installed_date'],
    completionHint: 'Fill in "Installed Date" (marks item as installed)',
    suggestedPhase: 'installation',
  },
];

/** Field labels for display */
export const ITEM_FIELD_LABELS: Record<string, string> = {
  dimensions: 'Dimensions',
  floor_id: 'Floor',
  room_id: 'Room',
  finish_material: 'Finish Material',
  finish_color: 'Finish Color',
  reference_image_url: 'Reference Image',
  image_3d_ref: '3D Reference',
  company_product_url: 'Product URL',
  technical_drawing_url: 'Technical Drawing',
  proforma_url: 'Proforma',
  supplier: 'Supplier',
  unit_cost: 'Unit Cost',
  po_number: 'PO Number',
  production_time: 'Production Time',
  production_due_date: 'Production Due Date',
  delivery_date: 'Delivery Date',
  received_date: 'Received Date',
  installation_start_date: 'Installation Start Date',
  installed_date: 'Installed Date',
  site_movement_date: 'Site Movement Date',
  selling_price: 'Selling Price',
  quantity: 'Quantity',
  notes: 'Notes',
};

/** Get human-readable list of fields for a task */
export function getCompletionFieldLabels(fields: string[]): string[] {
  return fields.map(f => ITEM_FIELD_LABELS[f] || f);
}

/** Check if completion fields are satisfied by an item */
export function areCompletionFieldsSatisfied(
  completionFields: string[],
  item: Record<string, any>
): boolean {
  if (!completionFields || completionFields.length === 0) return false;
  return completionFields.every(field => {
    const val = item[field];
    if (val === null || val === undefined) return false;
    if (typeof val === 'string' && val.trim() === '') return false;
    if (typeof val === 'number' && val === 0) return false;
    return true;
  });
}
