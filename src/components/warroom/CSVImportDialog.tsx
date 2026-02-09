import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Upload, FileText, Download, AlertCircle } from 'lucide-react';
import { useBulkCreateProjectItems } from '@/hooks/useProjects';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type BOQCategory = Database['public']['Enums']['boq_category'];
type ApprovalStatus = Database['public']['Enums']['approval_status'];

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

interface ParsedItem {
  category: BOQCategory;
  area: string;
  description: string;
  boq_included: boolean;
  approval_status: ApprovalStatus;
  purchased: boolean;
  supplier?: string;
  unit_cost?: number;
  quantity?: number;
}

const VALID_CATEGORIES: BOQCategory[] = ['joinery', 'loose-furniture', 'lighting', 'finishes', 'ffe', 'accessories', 'appliances'];
const VALID_STATUSES: ApprovalStatus[] = ['pending', 'approved', 'rejected', 'revision'];

export function CSVImportDialog({ open, onOpenChange, projectId }: CSVImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const bulkCreate = useBulkCreateProjectItems();

  const parseCSV = useCallback((text: string): { items: ParsedItem[]; errors: string[] } => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      return { items: [], errors: ['CSV file must have at least a header row and one data row'] };
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const items: ParsedItem[] = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: Record<string, string> = {};
      
      headers.forEach((header, idx) => {
        row[header] = values[idx] || '';
      });

      // Validate category
      const category = row.category?.toLowerCase() as BOQCategory;
      if (!VALID_CATEGORIES.includes(category)) {
        errors.push(`Row ${i + 1}: Invalid category "${row.category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`);
        continue;
      }

      // Validate required fields
      if (!row.area) {
        errors.push(`Row ${i + 1}: Area is required`);
        continue;
      }
      if (!row.description) {
        errors.push(`Row ${i + 1}: Description is required`);
        continue;
      }

      // Parse approval status
      let approvalStatus: ApprovalStatus = 'pending';
      if (row.approval_status) {
        const status = row.approval_status.toLowerCase() as ApprovalStatus;
        if (VALID_STATUSES.includes(status)) {
          approvalStatus = status;
        }
      }

      items.push({
        category,
        area: row.area,
        description: row.description,
        boq_included: row.boq_included?.toLowerCase() === 'yes' || row.boq_included === 'true',
        approval_status: approvalStatus,
        purchased: row.purchased?.toLowerCase() === 'yes' || row.purchased === 'true',
        supplier: row.supplier || undefined,
        unit_cost: row.unit_cost ? parseFloat(row.unit_cost) : undefined,
        quantity: row.quantity ? parseInt(row.quantity) : undefined,
      });
    }

    return { items, errors };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);
    setErrors([]);
    setParsedItems([]);

    try {
      const text = await selectedFile.text();
      const { items, errors } = parseCSV(text);
      setParsedItems(items);
      setErrors(errors);
    } catch (error) {
      setErrors(['Failed to read file']);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    if (parsedItems.length === 0) return;

    try {
      const itemsToInsert = parsedItems.map(item => ({
        project_id: projectId,
        category: item.category,
        area: item.area,
        description: item.description,
        boq_included: item.boq_included,
        approval_status: item.approval_status,
        purchased: item.purchased,
        supplier: item.supplier || null,
        unit_cost: item.unit_cost || null,
        quantity: item.quantity || 1,
        received: false,
        installed: false,
      }));

      await bulkCreate.mutateAsync(itemsToInsert);
      toast.success(`Successfully imported ${itemsToInsert.length} items`);
      onOpenChange(false);
      setFile(null);
      setParsedItems([]);
      setErrors([]);
    } catch (error) {
      toast.error('Failed to import items');
    }
  };

  const downloadTemplate = () => {
    const headers = 'category,area,description,boq_included,approval_status,purchased,supplier,unit_cost,quantity';
    const example = 'joinery,Living Room,Built-in Wardrobe,yes,pending,no,Poliform,5000,1';
    const content = `${headers}\n${example}`;
    
    const blob = new Blob([content], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'items_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Import Items from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk import items into this project
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Download Template */}
          <Button variant="outline" onClick={downloadTemplate} className="w-full">
            <Download className="w-4 h-4 mr-2" />
            Download CSV Template
          </Button>

          {/* File Upload */}
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload" className="cursor-pointer">
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-6 h-6 text-primary" />
                  <span className="text-foreground">{file.name}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">Click to upload CSV file</p>
                </div>
              )}
            </label>
          </div>

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing file...
            </div>
          )}

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="font-semibold">Validation Errors</span>
              </div>
              <ul className="text-sm text-destructive/80 space-y-1 max-h-32 overflow-y-auto">
                {errors.map((error, i) => (
                  <li key={i}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview */}
          {parsedItems.length > 0 && (
            <div className="bg-secondary/30 rounded-lg p-4">
              <p className="text-sm text-foreground font-medium mb-2">
                Ready to import {parsedItems.length} items
              </p>
              <ul className="text-sm text-muted-foreground space-y-1 max-h-32 overflow-y-auto">
                {parsedItems.slice(0, 5).map((item, i) => (
                  <li key={i}>• {item.description} ({item.category})</li>
                ))}
                {parsedItems.length > 5 && (
                  <li className="text-muted-foreground">...and {parsedItems.length - 5} more</li>
                )}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleImport} 
              disabled={parsedItems.length === 0 || bulkCreate.isPending}
            >
              {bulkCreate.isPending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Import {parsedItems.length} Items
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
