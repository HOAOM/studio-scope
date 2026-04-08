/**
 * SupplierExportTab — Generate RFQ, PO, Proforma documents per supplier
 * Full-width layout with clickable items and document history
 */
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { FileDown, FileSpreadsheet, Loader2, ExternalLink } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  generateSupplierPDF,
  generateSupplierExcel,
  type SupplierDocType,
  type SupplierItem,
} from '@/lib/exportSupplierDocs';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface SupplierExportTabProps {
  projectId: string;
  projectName: string;
  projectCode: string;
  items: ProjectItem[];
  onOpenItem?: (item: ProjectItem) => void;
}

const DOC_TYPE_LABELS: Record<SupplierDocType, string> = {
  rfq: 'Request for Quotation (RFQ)',
  purchase_order: 'Purchase Order (PO)',
  proforma_request: 'Proforma Invoice Request',
};

export function SupplierExportTab({ projectId, projectName, projectCode, items, onOpenItem }: SupplierExportTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: company } = useCompanySettings();

  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [docType, setDocType] = useState<SupplierDocType>('rfq');
  const [notes, setNotes] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [responseDeadline, setResponseDeadline] = useState('');
  const [generating, setGenerating] = useState(false);

  // Unique suppliers from items
  const suppliers = useMemo(() => {
    const set = new Set(items.map(i => i.supplier).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [items]);

  // Items for the selected supplier
  const supplierItems = useMemo(() => {
    if (!selectedSupplier) return [];
    return items.filter(i => i.supplier === selectedSupplier);
  }, [items, selectedSupplier]);

  // Fetch history
  const { data: history = [] } = useQuery({
    queryKey: ['supplier_documents', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('supplier_documents')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const mapToSupplierItems = (itemsList: ProjectItem[]): SupplierItem[] =>
    itemsList.map(i => ({
      item_code: i.item_code || '',
      description: i.description,
      dimensions: i.dimensions,
      finish_material: i.finish_material,
      finish_color: i.finish_color,
      quantity: i.quantity || 1,
      unit_cost: i.unit_cost ? Number(i.unit_cost) : null,
      selling_price: i.selling_price ? Number(i.selling_price) : null,
      reference_image_url: i.reference_image_url,
      quotation_ref: i.quotation_ref,
      po_number: i.po_number,
      delivery_date: i.delivery_date,
    }));

  const saveToHistory = useMutation({
    mutationFn: async (docNumber: string) => {
      const { error } = await (supabase as any)
        .from('supplier_documents')
        .insert({
          project_id: projectId,
          supplier: selectedSupplier,
          document_type: docType,
          items: mapToSupplierItems(supplierItems),
          generated_by: user?.id,
          notes: notes || null,
          status: 'draft',
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['supplier_documents', projectId] });
    },
  });

  const handleGeneratePDF = async () => {
    if (!selectedSupplier || supplierItems.length === 0) return;
    setGenerating(true);
    try {
      const docNumber = `${DOC_PREFIXES_MAP[docType]}-${projectCode}-${Date.now().toString(36).toUpperCase()}`;
      generateSupplierPDF({
        projectName,
        projectCode,
        supplier: selectedSupplier,
        documentType: docType,
        items: mapToSupplierItems(supplierItems),
        notes,
        deliveryAddress,
        paymentTerms,
        responseDeadline,
        docNumber,
        company: company || undefined,
      });
      await saveToHistory.mutateAsync(docNumber);
      toast.success('PDF generated');
    } catch {
      toast.error('Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateExcel = async () => {
    if (!selectedSupplier || supplierItems.length === 0) return;
    setGenerating(true);
    try {
      const docNumber = `${DOC_PREFIXES_MAP[docType]}-${projectCode}-${Date.now().toString(36).toUpperCase()}`;
      await generateSupplierExcel({
        projectName,
        projectCode,
        supplier: selectedSupplier,
        documentType: docType,
        items: mapToSupplierItems(supplierItems),
        notes,
        deliveryAddress,
        paymentTerms,
        docNumber,
        company: company || undefined,
      });
      await saveToHistory.mutateAsync(docNumber);
      toast.success('Excel generated');
    } catch {
      toast.error('Failed to generate Excel');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">Supplier Documents</h2>
        <p className="text-sm text-muted-foreground">Generate RFQ, Purchase Orders, and Proforma Requests per supplier</p>
      </div>

      {/* Config row — full width */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Document Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <Label className="text-sm">Supplier</Label>
              <Select value={selectedSupplier} onValueChange={setSelectedSupplier}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select supplier..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Document Type</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as SupplierDocType)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(DOC_TYPE_LABELS) as [SupplierDocType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">Delivery Address</Label>
              <Input
                value={deliveryAddress}
                onChange={e => setDeliveryAddress(e.target.value)}
                placeholder="Site address..."
                className="mt-1"
              />
            </div>
            {docType === 'rfq' ? (
              <div>
                <Label className="text-sm">Response Deadline</Label>
                <Input
                  type="date"
                  value={responseDeadline}
                  onChange={e => setResponseDeadline(e.target.value)}
                  className="mt-1"
                />
              </div>
            ) : (
              <div>
                <Label className="text-sm">Payment Terms</Label>
                <Input
                  value={paymentTerms}
                  onChange={e => setPaymentTerms(e.target.value)}
                  placeholder="e.g. 50% advance, 50% on delivery"
                  className="mt-1"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Notes</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Additional notes for the supplier..."
                className="mt-1"
                rows={2}
              />
            </div>
            <div className="flex items-end gap-3">
              <Button
                onClick={handleGeneratePDF}
                disabled={!selectedSupplier || supplierItems.length === 0 || generating}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileDown className="w-4 h-4 mr-2" />}
                Download PDF
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerateExcel}
                disabled={!selectedSupplier || supplierItems.length === 0 || generating}
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileSpreadsheet className="w-4 h-4 mr-2" />}
                Download Excel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items table — full width, clickable */}
      {selectedSupplier && supplierItems.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Items for {selectedSupplier} ({supplierItems.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">#</TableHead>
                    <TableHead className="w-24">Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="w-28">Dimensions</TableHead>
                    <TableHead className="w-28">Finishes</TableHead>
                    <TableHead className="w-12 text-center">Qty</TableHead>
                    <TableHead className="w-24 text-right">Unit Cost</TableHead>
                    <TableHead className="w-24 text-right">Total</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierItems.map((item, idx) => {
                    const unitCost = Number(item.unit_cost) || 0;
                    const total = unitCost * (item.quantity || 1);
                    return (
                      <TableRow
                        key={item.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => onOpenItem?.(item)}
                      >
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{item.item_code || '—'}</TableCell>
                        <TableCell className="text-sm max-w-[300px]">{item.description}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.dimensions || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {[item.finish_material, item.finish_color].filter(Boolean).join(' / ') || '—'}
                        </TableCell>
                        <TableCell className="text-center text-xs">{item.quantity || 1}</TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {unitCost ? `AED ${unitCost.toLocaleString()}` : '—'}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono">
                          {total ? `AED ${total.toLocaleString()}` : '—'}
                        </TableCell>
                        <TableCell>
                          <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document History — full width table */}
      {history.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Document History</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead className="w-24">Type</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="w-16 text-center">Items</TableHead>
                    <TableHead className="w-20">Status</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((doc: any) => (
                    <TableRow key={doc.id}>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(doc.created_at).toLocaleDateString('en-GB')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {doc.document_type === 'rfq' ? 'RFQ' : doc.document_type === 'purchase_order' ? 'PO' : 'Proforma'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm font-medium">{doc.supplier}</TableCell>
                      <TableCell className="text-center text-xs">
                        {Array.isArray(doc.items) ? doc.items.length : 0}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px]">{doc.status}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {doc.notes || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const DOC_PREFIXES_MAP: Record<SupplierDocType, string> = {
  rfq: 'RFQ',
  purchase_order: 'PO',
  proforma_request: 'PR',
};
