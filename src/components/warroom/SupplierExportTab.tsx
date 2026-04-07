/**
 * SupplierExportTab — Generate RFQ, PO, Proforma documents per supplier
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
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { FileDown, FileSpreadsheet, Loader2, Package } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
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
}

const DOC_TYPE_LABELS: Record<SupplierDocType, string> = {
  rfq: 'Request for Quotation (RFQ)',
  purchase_order: 'Purchase Order (PO)',
  proforma_request: 'Proforma Invoice Request',
};

export function SupplierExportTab({ projectId, projectName, projectCode, items }: SupplierExportTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
        .limit(20);
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
      const docNumber = `${docType === 'rfq' ? 'RFQ' : docType === 'purchase_order' ? 'PO' : 'PR'}-${projectCode}-${Date.now().toString(36).toUpperCase()}`;
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
      const docNumber = `${docType === 'rfq' ? 'RFQ' : docType === 'purchase_order' ? 'PO' : 'PR'}-${projectCode}-${Date.now().toString(36).toUpperCase()}`;
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Configuration */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Document Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              </div>

              {docType === 'rfq' && (
                <div>
                  <Label className="text-sm">Response Deadline</Label>
                  <Input
                    type="date"
                    value={responseDeadline}
                    onChange={e => setResponseDeadline(e.target.value)}
                    className="mt-1 w-48"
                  />
                </div>
              )}

              <div>
                <Label className="text-sm">Delivery Address</Label>
                <Input
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder="Site address..."
                  className="mt-1"
                />
              </div>

              {(docType === 'purchase_order' || docType === 'proforma_request') && (
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

              <div>
                <Label className="text-sm">Notes</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Additional notes for the supplier..."
                  className="mt-1"
                  rows={3}
                />
              </div>

              {/* Items preview */}
              {selectedSupplier && (
                <div>
                  <Label className="text-sm mb-2 block">
                    Items ({supplierItems.length})
                  </Label>
                  <ScrollArea className="max-h-48 border border-border rounded-md">
                    <div className="p-2 space-y-1">
                      {supplierItems.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-muted-foreground">{item.item_code}</span>
                            <span className="text-foreground truncate max-w-[200px]">{item.description}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">x{item.quantity || 1}</span>
                            {item.unit_cost && (
                              <span className="font-mono">AED {Number(item.unit_cost).toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                      ))}
                      {supplierItems.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No items for this supplier</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              )}

              {/* Generate buttons */}
              <div className="flex gap-3 pt-2">
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
            </CardContent>
          </Card>
        </div>

        {/* History */}
        <div>
          <Card className="bg-card border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Recent Documents</CardTitle>
            </CardHeader>
            <CardContent>
              {history.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No documents generated yet</p>
              ) : (
                <div className="space-y-2">
                  {history.map((doc: any) => (
                    <div key={doc.id} className="border border-border rounded-md p-2 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-[10px]">
                          {doc.document_type === 'rfq' ? 'RFQ' : doc.document_type === 'purchase_order' ? 'PO' : 'Proforma'}
                        </Badge>
                        <span className="text-muted-foreground">
                          {new Date(doc.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="font-medium text-foreground">{doc.supplier}</p>
                      <p className="text-muted-foreground">
                        {Array.isArray(doc.items) ? doc.items.length : 0} items
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
