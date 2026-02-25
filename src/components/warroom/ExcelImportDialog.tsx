import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useCreateProject, useBulkCreateProjectItems } from '@/hooks/useProjects';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { Database } from '@/integrations/supabase/types';

type BOQCategory = Database['public']['Enums']['boq_category'];

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ParsedRow {
  item_code: string;
  floor_code: string;
  room_code: string;
  room_number: string;
  zone: string;
  area: string;
  supplier: string;
  description: string;
  finish_material: string;
  dimensions: string;
  reference_image_url: string;
  technical_drawing_url: string;
  company_product_url: string;
  quantity: number;
  unit_cost: number | null;
  selling_price: number | null;
  production_time: string;
  notes: string;
  item_type_code: string;
  subcategory_code: string;
}

interface ImportResult {
  rows: ParsedRow[];
  errors: string[];
  projectName: string;
  projectDate: string;
  totalAmount: string;
}

// Map item type codes to boq_category enum
function itemTypeToCategory(typeCode: string): BOQCategory {
  const map: Record<string, BOQCategory> = {
    'LF': 'loose-furniture',
    'CF': 'joinery',      // Custom Furniture → joinery
    'CL': 'finishes',     // Ceiling → finishes
    'CT': 'accessories',  // Curtains → accessories
    'DR': 'joinery',      // Doors → joinery
    'FL': 'finishes',     // Flooring → finishes
    'FX': 'appliances',   // Fixtures → appliances
    'LT': 'lighting',     // Lighting → lighting
  };
  return map[typeCode] || 'ffe';
}

function cleanValue(val: any): string {
  if (val === undefined || val === null) return '';
  const s = String(val).trim();
  return s === 'N/A' || s === 'n/a' ? '' : s;
}

export function ExcelImportDialog({ open, onOpenChange }: ExcelImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectCode, setProjectCode] = useState('');
  const [clientName, setClientName] = useState('');

  const createProject = useCreateProject();
  const bulkCreate = useBulkCreateProjectItems();
  const navigate = useNavigate();

  const parseExcel = useCallback((data: ArrayBuffer): ImportResult => {
    const workbook = XLSX.read(data, { type: 'array' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

    const rows: ParsedRow[] = [];
    const errors: string[] = [];
    let projectName = '';
    let projectDate = '';
    let totalAmount = '';

    // Parse header info (rows 1-3)
    if (jsonData.length > 0) {
      // Row 1: "HOUSE OF AIDA - Bill of Quantities"
      // Row 2: "Project: VILLA 9" | "Date: 21/01/2026" | "Total: €155603.00"
      const infoRow = jsonData[1] || [];
      const infoStr = infoRow.join('|');
      
      // Try to extract project name from "Project: XXX"
      for (const cell of infoRow) {
        const cellStr = String(cell);
        if (cellStr.startsWith('Project:')) {
          projectName = cellStr.replace('Project:', '').trim();
        }
        if (cellStr.startsWith('Date:')) {
          projectDate = cellStr.replace('Date:', '').trim();
        }
        if (cellStr.startsWith('Total:')) {
          totalAmount = cellStr.replace('Total:', '').trim();
        }
      }
    }

    // Find header row (row 4, index 3)
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      const rowStr = row.map((c: any) => String(c).toLowerCase()).join('|');
      if (rowStr.includes('code') && rowStr.includes('description') && rowStr.includes('qty')) {
        headerRowIdx = i;
        break;
      }
    }

    if (headerRowIdx === -1) {
      return { rows: [], errors: ['Could not find header row with Code/Description/QTY columns'], projectName, projectDate, totalAmount };
    }

    const headers = jsonData[headerRowIdx].map((h: any) => String(h).trim().toLowerCase());

    // Map column indices
    const colMap: Record<string, number> = {};
    const colNames = ['code', 'floor', 'room', 'zone', 'area', 'brand', 'description', 
                      'finishing', 'size', 'ref image', 'tech drawings', 'company links',
                      'qty', 'unit', 'unit rate', 'amount', 'production time', 'notes',
                      'item type', 'subcategory'];
    
    for (const name of colNames) {
      const idx = headers.findIndex((h: string) => h === name || h.includes(name));
      if (idx !== -1) colMap[name] = idx;
    }

    // Parse data rows
    for (let i = headerRowIdx + 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row || row.every((c: any) => !c || String(c).trim() === '')) continue;

      const code = cleanValue(row[colMap['code']]);
      const description = cleanValue(row[colMap['description']]);
      
      if (!description && !code) continue;

      const floorCode = cleanValue(row[colMap['floor']]);
      const roomRaw = cleanValue(row[colMap['room']]);
      // Extract room code (letters) and room number (digits)
      const roomMatch = roomRaw.match(/^([A-Za-z]+)(\d+)?$/);
      const roomCode = roomMatch ? roomMatch[1].toUpperCase() : roomRaw;
      const roomNumber = roomMatch ? (roomMatch[2] || '') : '';

      const qtyRaw = row[colMap['qty']];
      const quantity = qtyRaw ? parseInt(String(qtyRaw)) || 1 : 1;
      
      const unitRateRaw = row[colMap['unit rate']];
      const unitCost = unitRateRaw ? parseFloat(String(unitRateRaw)) || null : null;
      
      const amountRaw = row[colMap['amount']];
      const sellingPrice = amountRaw ? parseFloat(String(amountRaw)) || null : null;

      rows.push({
        item_code: code,
        floor_code: floorCode,
        room_code: roomCode,
        room_number: roomNumber,
        zone: cleanValue(row[colMap['zone']]),
        area: cleanValue(row[colMap['area']]) || roomCode || 'General',
        supplier: cleanValue(row[colMap['brand']]),
        description: description || 'No description',
        finish_material: cleanValue(row[colMap['finishing']]),
        dimensions: cleanValue(row[colMap['size']]),
        reference_image_url: cleanValue(row[colMap['ref image']]),
        technical_drawing_url: cleanValue(row[colMap['tech drawings']]),
        company_product_url: cleanValue(row[colMap['company links']]),
        quantity,
        unit_cost: unitCost,
        selling_price: sellingPrice,
        production_time: cleanValue(row[colMap['production time']]),
        notes: cleanValue(row[colMap['notes']]),
        item_type_code: cleanValue(row[colMap['item type']]).toUpperCase(),
        subcategory_code: cleanValue(row[colMap['subcategory']]).toUpperCase(),
      });
    }

    return { rows, errors, projectName, projectDate, totalAmount };
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setIsProcessing(true);
    setResult(null);

    try {
      const buffer = await selectedFile.arrayBuffer();
      const parsed = parseExcel(buffer);
      setResult(parsed);
      
      if (parsed.projectName && !projectName) {
        setProjectName(parsed.projectName);
        setProjectCode(parsed.projectName.replace(/\s+/g, '-').toUpperCase());
      }
      if (!clientName) {
        setClientName('House of Aida');
      }
    } catch (error) {
      setResult({ rows: [], errors: ['Failed to parse Excel file: ' + String(error)], projectName: '', projectDate: '', totalAmount: '' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImport = async () => {
    if (!result || result.rows.length === 0) return;
    setIsImporting(true);

    try {
      // 1. Fetch master data for ID lookups
      const [floorsRes, roomsRes, typesRes, subcatsRes] = await Promise.all([
        supabase.from('master_floors').select('id, code'),
        supabase.from('master_rooms').select('id, code'),
        supabase.from('master_item_types').select('id, code'),
        supabase.from('master_subcategories').select('id, code, item_type_id'),
      ]);

      const floorMap = new Map((floorsRes.data || []).map(f => [f.code, f.id]));
      const roomMap = new Map((roomsRes.data || []).map(r => [r.code, r.id]));
      const typeMap = new Map((typesRes.data || []).map(t => [t.code, t.id]));
      const subcatsByType = new Map<string, Map<string, string>>();
      for (const sc of (subcatsRes.data || [])) {
        if (!subcatsByType.has(sc.item_type_id)) subcatsByType.set(sc.item_type_id, new Map());
        subcatsByType.get(sc.item_type_id)!.set(sc.code, sc.id);
      }

      // 2. Create the project
      const today = new Date().toISOString().split('T')[0];
      const project = await createProject.mutateAsync({
        code: projectCode || 'IMPORT-001',
        name: projectName || 'Imported Project',
        client: clientName || 'Client',
        start_date: today,
        target_completion_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });

      // 3. Map rows to project_items
      const items = result.rows.map(row => {
        const typeId = typeMap.get(row.item_type_code) || null;
        const subcatMap = typeId ? subcatsByType.get(typeId) : null;
        const subcatId = subcatMap?.get(row.subcategory_code) || null;

        return {
          project_id: project.id,
          item_code: row.item_code || null,
          category: itemTypeToCategory(row.item_type_code),
          area: row.area || row.room_code || 'General',
          description: row.description,
          supplier: row.supplier || null,
          finish_material: row.finish_material || null,
          dimensions: row.dimensions || null,
          reference_image_url: row.reference_image_url || null,
          technical_drawing_url: row.technical_drawing_url || null,
          company_product_url: row.company_product_url || null,
          quantity: row.quantity,
          unit_cost: row.unit_cost,
          selling_price: row.selling_price,
          production_time: row.production_time || null,
          notes: row.notes || null,
          floor_id: floorMap.get(row.floor_code) || null,
          room_id: roomMap.get(row.room_code) || null,
          room_number: row.room_number || null,
          item_type_id: typeId,
          subcategory_id: subcatId,
          boq_included: true,
          approval_status: 'pending' as const,
          purchased: false,
          received: false,
          installed: false,
        };
      });

      // 4. Bulk insert items (batch by 50)
      for (let i = 0; i < items.length; i += 50) {
        const batch = items.slice(i, i + 50);
        await bulkCreate.mutateAsync(batch);
      }

      toast.success(`Imported ${items.length} items into project "${projectName}"`);
      onOpenChange(false);
      navigate(`/project/${project.id}`);
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error('Import failed: ' + (error.message || 'Unknown error'));
    } finally {
      setIsImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setProjectName('');
    setProjectCode('');
    setClientName('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-[700px] bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Project from Excel</DialogTitle>
          <DialogDescription>
            Upload a BOQ Excel file to create a new project with all items
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* File Upload */}
          <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
            <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" id="excel-upload" />
            <label htmlFor="excel-upload" className="cursor-pointer">
              {file ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-6 h-6 text-primary" />
                  <span className="text-foreground">{file.name}</span>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                  <p className="text-muted-foreground">Click to upload Excel file (.xlsx)</p>
                </div>
              )}
            </label>
          </div>

          {isProcessing && (
            <div className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Processing file...
            </div>
          )}

          {/* Errors */}
          {result?.errors && result.errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
              <div className="flex items-center gap-2 text-destructive mb-2">
                <AlertCircle className="w-4 h-4" />
                <span className="font-semibold">Issues</span>
              </div>
              <ul className="text-sm text-destructive/80 space-y-1">
                {result.errors.map((err, i) => <li key={i}>• {err}</li>)}
              </ul>
            </div>
          )}

          {/* Preview */}
          {result && result.rows.length > 0 && (
            <>
              <div className="bg-secondary/30 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-foreground">
                  <CheckCircle2 className="w-4 h-4 text-status-safe" />
                  <span className="font-medium">
                    Found {result.rows.length} items
                  </span>
                </div>
                {result.projectName && (
                  <p className="text-sm text-muted-foreground">Project: {result.projectName}</p>
                )}
                {result.totalAmount && (
                  <p className="text-sm text-muted-foreground">Total: {result.totalAmount}</p>
                )}
                <div className="text-xs text-muted-foreground mt-2 max-h-32 overflow-y-auto">
                  {result.rows.slice(0, 8).map((row, i) => (
                    <div key={i}>• [{row.item_code}] {row.description} — {row.supplier || 'N/A'} × {row.quantity}</div>
                  ))}
                  {result.rows.length > 8 && <div>...and {result.rows.length - 8} more</div>}
                </div>
              </div>

              {/* Project details */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium text-foreground">Project Details</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="proj-code">Project Code</Label>
                    <Input id="proj-code" value={projectCode} onChange={e => setProjectCode(e.target.value)} placeholder="VILLA-9" />
                  </div>
                  <div>
                    <Label htmlFor="proj-name">Project Name</Label>
                    <Input id="proj-name" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Villa 9" />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="proj-client">Client</Label>
                    <Input id="proj-client" value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name" />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button 
              onClick={handleImport} 
              disabled={!result || result.rows.length === 0 || isImporting || !projectName || !projectCode}
            >
              {isImporting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Import {result?.rows.length || 0} Items
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
