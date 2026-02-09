import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProject, useProjectItems, useDeleteProjectItem } from '@/hooks/useProjects';
import { StatusBadge } from '@/components/warroom/StatusBadge';
import { ItemFormDialog } from '@/components/warroom/ItemFormDialog';
import { CSVImportDialog } from '@/components/warroom/CSVImportDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  ArrowLeft, 
  Calendar, 
  User, 
  MapPin, 
  FileText,
  Activity,
  Plus,
  Upload,
  Loader2,
  Edit,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];
type StatusLevel = 'safe' | 'at-risk' | 'unsafe';
type BOQCategory = Database['public']['Enums']['boq_category'];

const CATEGORY_LABELS: Record<BOQCategory, string> = {
  'joinery': 'Joinery',
  'loose-furniture': 'Loose Furniture',
  'lighting': 'Lighting',
  'finishes': 'Finishes',
  'ffe': 'FF&E',
  'accessories': 'Accessories',
  'appliances': 'Appliances',
};

function calculateItemStatus(item: ProjectItem): StatusLevel {
  if (!item.boq_included || item.approval_status === 'rejected') return 'unsafe';
  if (item.approval_status === 'pending' || item.approval_status === 'revision') return 'at-risk';
  if (item.approval_status === 'approved' && !item.purchased) return 'at-risk';
  if (item.purchased && !item.received) return 'at-risk';
  if (item.received && !item.installed) return 'at-risk';
  if (item.received && item.installed) return 'safe';
  return 'at-risk';
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: items = [], isLoading: itemsLoading } = useProjectItems(projectId);
  const deleteItem = useDeleteProjectItem();
  
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ProjectItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           item.area.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || calculateItemStatus(item) === statusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [items, searchQuery, categoryFilter, statusFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    const byStatus = { safe: 0, 'at-risk': 0, unsafe: 0 };
    items.forEach(item => {
      const status = calculateItemStatus(item);
      byStatus[status]++;
    });
    return byStatus;
  }, [items]);

  const handleEditItem = (item: ProjectItem) => {
    setEditingItem(item);
    setItemDialogOpen(true);
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete || !projectId) return;
    try {
      await deleteItem.mutateAsync({ id: itemToDelete.id, projectId });
      toast.success('Item deleted');
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    } catch {
      toast.error('Failed to delete item');
    }
  };

  const openDeleteDialog = (item: ProjectItem) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };

  if (projectLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }
  
  if (!project) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Project Not Found</h1>
          <Link to="/" className="text-primary hover:underline">
            ← Back to War Room
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background war-room-grid">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="container py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link 
                to="/" 
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">War Room</span>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-muted-foreground">{project.code}</span>
                </div>
                <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => setCsvDialogOpen(true)}>
                <Upload className="w-4 h-4 mr-2" />
                Import CSV
              </Button>
              <Button onClick={() => { setEditingItem(null); setItemDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        {/* Project Summary */}
        <section className="animate-fade-in">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Project Summary</h2>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3 text-sm">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Client:</span>
                  <span className="text-foreground font-medium">{project.client}</span>
                </div>
                
                {project.location && (
                  <div className="flex items-center gap-3 text-sm">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Location:</span>
                    <span className="text-foreground">{project.location}</span>
                  </div>
                )}
                
                {project.project_manager && (
                  <div className="flex items-center gap-3 text-sm">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="text-muted-foreground">PM:</span>
                    <span className="text-foreground">{project.project_manager}</span>
                  </div>
                )}
                
                <div className="flex items-center gap-3 text-sm">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Timeline:</span>
                  <span className="font-mono text-foreground">
                    {project.start_date} → {project.target_completion_date}
                  </span>
                </div>
                
                {project.boq_master_ref && (
                  <div className="pt-4 border-t border-border">
                    <div className="flex items-center gap-3 text-sm">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-muted-foreground">BOQ Master Ref:</span>
                      <span className="font-mono text-primary">{project.boq_master_ref}</span>
                    </div>
                    {project.boq_version && (
                      <div className="flex items-center gap-3 text-sm mt-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">BOQ Version:</span>
                        <span className="font-mono text-foreground">{project.boq_version}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Item Stats */}
            <div className="bg-card rounded-lg border border-border p-6">
              <h2 className="text-lg font-semibold text-foreground mb-4">Item Status Overview</h2>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-status-safe-bg border border-status-safe/20">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-status-safe" />
                    <span className="text-2xl font-bold text-status-safe">{stats.safe}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Safe</p>
                </div>
                <div className="p-4 rounded-lg bg-status-at-risk-bg border border-status-at-risk/20">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-status-at-risk" />
                    <span className="text-2xl font-bold text-status-at-risk">{stats['at-risk']}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">At Risk</p>
                </div>
                <div className="p-4 rounded-lg bg-status-unsafe-bg border border-status-unsafe/20">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-status-unsafe" />
                    <span className="text-2xl font-bold text-status-unsafe">{stats.unsafe}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">Unsafe</p>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  Total Items: <span className="font-semibold text-foreground">{items.length}</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Item Tracker */}
        <section className="animate-fade-in" style={{ animationDelay: '100ms' }}>
          <div className="bg-card rounded-lg border border-border">
            <div className="p-6 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">Item Tracker</h2>
                <span className="text-sm text-muted-foreground">{filteredItems.length} items</span>
              </div>

              {/* Filters */}
              <div className="flex gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search items..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="safe">Safe</SelectItem>
                    <SelectItem value="at-risk">At Risk</SelectItem>
                    <SelectItem value="unsafe">Unsafe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {itemsLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto text-primary" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                {items.length === 0 ? (
                  <div>
                    <Activity className="w-10 h-10 mx-auto mb-4 opacity-50" />
                    <p>No items yet. Add your first item or import from CSV.</p>
                  </div>
                ) : (
                  <p>No items match your filters.</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead className="min-w-[200px]">Description</TableHead>
                      <TableHead className="text-center">BOQ</TableHead>
                      <TableHead>Approval</TableHead>
                      <TableHead className="text-center">Purchased</TableHead>
                      <TableHead className="text-center">Received</TableHead>
                      <TableHead className="text-center">Installed</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.map((item) => {
                      const status = calculateItemStatus(item);
                      return (
                        <TableRow key={item.id} className="tracker-row">
                          <TableCell>
                            <StatusBadge 
                              status={status} 
                              label={status === 'at-risk' ? 'At Risk' : status.charAt(0).toUpperCase() + status.slice(1)} 
                              size="sm" 
                            />
                          </TableCell>
                          <TableCell className="text-sm">{CATEGORY_LABELS[item.category]}</TableCell>
                          <TableCell className="text-sm">{item.area}</TableCell>
                          <TableCell className="text-sm font-medium">{item.description}</TableCell>
                          <TableCell className="text-center">
                            {item.boq_included ? (
                              <CheckCircle2 className="w-4 h-4 text-status-safe mx-auto" />
                            ) : (
                              <XCircle className="w-4 h-4 text-status-unsafe mx-auto" />
                            )}
                          </TableCell>
                          <TableCell>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              item.approval_status === 'approved' ? 'bg-status-safe-bg text-status-safe' :
                              item.approval_status === 'rejected' ? 'bg-status-unsafe-bg text-status-unsafe' :
                              'bg-status-at-risk-bg text-status-at-risk'
                            }`}>
                              {item.approval_status}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {item.purchased ? (
                              <CheckCircle2 className="w-4 h-4 text-status-safe mx-auto" />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.received ? (
                              <CheckCircle2 className="w-4 h-4 text-status-safe mx-auto" />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {item.installed ? (
                              <CheckCircle2 className="w-4 h-4 text-status-safe mx-auto" />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditItem(item)}>
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => openDeleteDialog(item)}>
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Item Form Dialog */}
      {projectId && (
        <ItemFormDialog 
          open={itemDialogOpen}
          onOpenChange={setItemDialogOpen}
          projectId={projectId}
          item={editingItem}
        />
      )}

      {/* CSV Import Dialog */}
      {projectId && (
        <CSVImportDialog
          open={csvDialogOpen}
          onOpenChange={setCsvDialogOpen}
          projectId={projectId}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{itemToDelete?.description}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteItem} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
