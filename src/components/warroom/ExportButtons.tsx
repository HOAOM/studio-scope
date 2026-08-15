import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';
import { exportBOQToExcel } from '@/lib/exportBOQExcel';
import { useCompanySettings } from '@/hooks/useCompanySettings';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

export function ExportExcelButton({ project, items }: { project: any; items: ProjectItem[] }) {
  const { data: companySettings } = useCompanySettings(project?.organization_id);
  const handleExport = async () => {
    try {
      await exportBOQToExcel(project, items, companySettings);
      toast.success('BOQ esportato in Excel');
    } catch (e: any) {
      toast.error('Errore export Excel: ' + (e?.message || 'unknown'));
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950"
    >
      <FileSpreadsheet className="w-4 h-4 mr-2" />
      Export Excel
    </Button>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  'joinery': 'Joinery',
  'loose-furniture': 'Loose Furniture',
  'lighting': 'Lighting',
  'finishes': 'Finishes',
  'ffe': 'FF&E',
  'accessories': 'Accessories',
  'appliances': 'Appliances',
};

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportCSVButton({ items, projectName }: { items: ProjectItem[]; projectName: string }) {
  const handleExport = () => {
    const headers = [
      'Category', 'Area', 'Description', 'BOQ Included', 'Approval Status',
      'Supplier', 'PO Ref', 'Unit Cost', 'Quantity', 'Total Cost',
      'Purchased', 'Production Due', 'Delivery Date', 'Received', 'Installed', 'Notes'
    ].join(',');

    const rows = items.map(item => [
      CATEGORY_LABELS[item.category] || item.category,
      `"${item.area}"`,
      `"${item.description}"`,
      item.boq_included ? 'Yes' : 'No',
      item.approval_status,
      `"${item.supplier || ''}"`,
      `"${item.purchase_order_ref || ''}"`,
      item.unit_cost ?? '',
      item.quantity ?? 1,
      (item.unit_cost && item.quantity) ? (item.unit_cost * item.quantity).toFixed(2) : '',
      item.purchased ? 'Yes' : 'No',
      item.production_due_date || '',
      item.delivery_date || '',
      item.received ? 'Yes' : 'No',
      item.installed ? 'Yes' : 'No',
      `"${item.notes || ''}"`,
    ].join(','));

    downloadFile([headers, ...rows].join('\n'), `${projectName}_items.csv`, 'text/csv');
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="w-4 h-4 mr-2" />
      CSV
    </Button>
  );
}

export function ExportJSONButton({ items, projectName }: { items: ProjectItem[]; projectName: string }) {
  const handleExport = () => {
    downloadFile(JSON.stringify(items, null, 2), `${projectName}_items.json`, 'application/json');
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport}>
      <Download className="w-4 h-4 mr-2" />
      JSON
    </Button>
  );
}
