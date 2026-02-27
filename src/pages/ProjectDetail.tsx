import { useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useProject, useProjectItems, useDeleteProjectItem } from '@/hooks/useProjects';
import { StatusBadge } from '@/components/warroom/StatusBadge';
import { ProjectKPIs, computeKPIs } from '@/components/warroom/ProjectKPIs';
import { ExportCSVButton, ExportJSONButton } from '@/components/warroom/ExportButtons';
import { ItemFormDialog } from '@/components/warroom/ItemFormDialog';
import { CSVImportDialog } from '@/components/warroom/CSVImportDialog';
import { PresentationBuilder } from '@/components/warroom/PresentationBuilder';
import { GanttChart } from '@/components/warroom/GanttChart';
import { TeamManagement } from '@/components/warroom/TeamManagement';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  XCircle,
  Eye,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';
import { cn } from '@/lib/utils';
import { useUserRole } from '@/hooks/useUserRole';
import { BOQCategoryModal } from '@/components/warroom/BOQCategoryModal';
import { Image as ImageIcon } from 'lucide-react';

type ItemLifecycleStatus = Database['public']['Enums']['item_lifecycle_status'];

const LIFECYCLE_COLORS: Record<ItemLifecycleStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  estimated: 'bg-status-at-risk-bg text-status-at-risk',
  approved: 'bg-status-safe-bg text-status-safe',
  ordered: 'bg-primary/10 text-primary',
  delivered: 'bg-status-safe-bg text-status-safe',
  installed: 'bg-status-safe-bg text-status-safe',
  on_hold: 'bg-status-unsafe-bg text-status-unsafe',
};

function LifecycleBadge({ status }: { status: ItemLifecycleStatus | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">-</span>;
  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', LIFECYCLE_COLORS[status])}>
      {status.replace('_', ' ')}
    </span>
  );
}

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

const ALL_CATEGORIES: BOQCategory[] = ['joinery', 'loose-furniture', 'lighting', 'finishes', 'ffe', 'accessories', 'appliances'];

function calculateItemStatus(item: ProjectItem): StatusLevel {
  if (item.approval_status === 'rejected') return 'unsafe';
  if (item.approval_status === 'pending' || item.approval_status === 'revision') return 'at-risk';
  if (item.approval_status === 'approved' && !item.purchased) return 'at-risk';
  if (item.purchased && !item.received) return 'at-risk';
  if (item.received && !item.installed) return 'at-risk';
  if (item.received && item.installed) return 'safe';
  return 'at-risk';
}

function computeBOQCoverage(items: ProjectItem[]) {
  return ALL_CATEGORIES.map(cat => {
    const catItems = items.filter(i => i.category === cat);
    const approvedCount = catItems.filter(i => i.approval_status === 'approved').length;
    const status: 'present' | 'missing' | 'to-confirm' =
      catItems.length === 0 ? 'missing' :
      approvedCount === catItems.length ? 'present' : 'to-confirm';
    return { category: cat, status, itemCount: catItems.length, approvedCount };
  });
}

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: items = [], isLoading: itemsLoading } = useProjectItems(projectId);
  const deleteItem = useDeleteProjectItem();
  const { canSeeCosts, roles } = useUserRole();
  const isAdmin = roles.includes('admin');
  const [clientViewMode, setClientViewMode] = useState(false);
  const effectiveCanSeeCosts = canSeeCosts && !clientViewMode;
  
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProjectItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ProjectItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');

  const areas = useMemo(() => {
    const unique = new Set(items.map(i => i.area));
    return Array.from(unique).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      const matchesSearch = item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           item.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (item.supplier || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;
      const matchesStatus = statusFilter === 'all' || calculateItemStatus(item) === statusFilter;
      const matchesArea = areaFilter === 'all' || item.area === areaFilter;
      return matchesSearch && matchesCategory && matchesStatus && matchesArea;
    });
  }, [items, searchQuery, categoryFilter, statusFilter, areaFilter]);

  const stats = useMemo(() => {
    const byStatus = { safe: 0, 'at-risk': 0, unsafe: 0 };
    items.forEach(item => {
      byStatus[calculateItemStatus(item)]++;
    });
    return byStatus;
  }, [items]);

  const boqCoverage = useMemo(() => computeBOQCoverage(items), [items]);

  const totalCost = useMemo(() => {
    return items.reduce((sum, item) => {
      return sum + ((item.unit_cost || 0) * (item.quantity || 1));
    }, 0);
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
          <Link to="/" className="text-primary hover:underline">← Back to War Room</Link>
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
              <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm">War Room</span>
              </Link>
              <div className="h-6 w-px bg-border" />
              <div>
                <span className="font-mono text-sm text-muted-foreground">{project.code}</span>
                <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Client View</span>
                  <Switch checked={clientViewMode} onCheckedChange={setClientViewMode} className="scale-75" />
                </div>
              )}
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

      <main className="container py-8">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="items">Item Tracker</TabsTrigger>
            <TabsTrigger value="presentation">Presentation</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            {/* Project Summary + Stats */}
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
                    <span className="font-mono text-foreground">{project.start_date} → {project.target_completion_date}</span>
                  </div>
                  {project.boq_master_ref && (
                    <div className="pt-4 border-t border-border">
                      <div className="flex items-center gap-3 text-sm">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-muted-foreground">BOQ Ref:</span>
                        <span className="font-mono text-primary">{project.boq_master_ref}</span>
                      </div>
                      {project.boq_version && (
                        <div className="flex items-center gap-3 text-sm mt-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Version:</span>
                          <span className="font-mono text-foreground">{project.boq_version}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

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
                <div className="mt-4 pt-4 border-t border-border flex justify-between">
                  <p className="text-sm text-muted-foreground">
                    Total: <span className="font-semibold text-foreground">{items.length}</span>
                  </p>
                  {effectiveCanSeeCosts && (
                    <p className="text-sm text-muted-foreground">
                      Cost: <span className="font-semibold text-foreground font-mono">
                        {totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Gantt Timeline */}
            <GanttChart
              items={items}
              projectStartDate={project.start_date}
              projectEndDate={project.target_completion_date}
            />

            {/* KPIs */}
            <ProjectKPIs items={items} />

            {/* BOQ Coverage Matrix */}
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              <div className="px-4 py-3 border-b border-border bg-surface-elevated">
                <h3 className="font-semibold text-foreground">BOQ Coverage Matrix</h3>
                <p className="text-xs text-muted-foreground mt-1">Category status and approval coverage</p>
              </div>
              <div className="divide-y divide-border">
                {boqCoverage.map((cat) => {
                  const approvalRate = cat.itemCount > 0 ? Math.round((cat.approvedCount / cat.itemCount) * 100) : 0;
                  return (
                    <div key={cat.category} className="flex items-center justify-between px-4 py-3 hover:bg-surface-hover transition-colors">
                      <div className="flex items-center gap-4 flex-1">
                        <span className="font-medium text-foreground min-w-[140px]">{CATEGORY_LABELS[cat.category]}</span>
                        <div className="flex items-center gap-2">
                          <span className={cn('w-3 h-3 rounded-full',
                            cat.status === 'present' ? 'bg-status-safe' :
                            cat.status === 'to-confirm' ? 'bg-status-at-risk' : 'bg-status-unsafe'
                          )} />
                          <span className="text-sm text-muted-foreground">
                            {cat.status === 'present' ? 'Present' : cat.status === 'to-confirm' ? 'To Confirm' : 'Missing'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <span className="text-muted-foreground">Items: </span>
                          <span className="font-mono text-foreground">{cat.itemCount}</span>
                        </div>
                        <div className="text-right min-w-[100px]">
                          <span className="text-muted-foreground">Approved: </span>
                          <span className={cn('font-mono',
                            approvalRate >= 80 ? 'text-status-safe' :
                            approvalRate >= 50 ? 'text-status-at-risk' : 'text-status-unsafe'
                          )}>
                            {cat.approvedCount}/{cat.itemCount}
                          </span>
                        </div>
                        <div className="w-24">
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all',
                                approvalRate >= 80 ? 'bg-status-safe' :
                                approvalRate >= 50 ? 'bg-status-at-risk' : 'bg-status-unsafe'
                              )}
                              style={{ width: `${approvalRate}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-3 bg-surface-elevated border-t border-border">
                <div className="flex items-center gap-6 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-safe" />
                    <span className="text-muted-foreground">Present</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-at-risk" />
                    <span className="text-muted-foreground">To Confirm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-status-unsafe" />
                    <span className="text-muted-foreground">Missing</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Team Management - only for admin/owner */}
            {isAdmin && projectId && (
              <TeamManagement projectId={projectId} />
            )}
          </TabsContent>

          {/* ITEMS TAB */}
          <TabsContent value="items" className="space-y-4">
            <div className="bg-card rounded-lg border border-border">
              <div className="p-6 border-b border-border">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Item Tracker</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {filteredItems.length} items •
                      <span className="text-status-safe ml-1">{stats.safe} safe</span> •
                      <span className="text-status-at-risk ml-1">{stats['at-risk']} at risk</span> •
                      <span className="text-status-unsafe ml-1">{stats.unsafe} unsafe</span>
                      {effectiveCanSeeCosts && totalCost > 0 && (
                        <span className="ml-2">• Total cost: <span className="font-mono text-foreground">{totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span></span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <ExportCSVButton items={filteredItems} projectName={project.name} />
                    <ExportJSONButton items={filteredItems} projectName={project.name} />
                  </div>
                </div>

                {/* Filters */}
                <div className="flex gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px] relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search items, supplier..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="w-[170px]">
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
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="safe">Safe</SelectItem>
                      <SelectItem value="at-risk">At Risk</SelectItem>
                      <SelectItem value="unsafe">Unsafe</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={areaFilter} onValueChange={setAreaFilter}>
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Area" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Areas</SelectItem>
                      {areas.map(area => (
                        <SelectItem key={area} value={area}>{area}</SelectItem>
                      ))}
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
                        <TableHead className="w-[90px]">Code</TableHead>
                        <TableHead className="w-[80px]">Status</TableHead>
                        <TableHead className="w-[80px]">Lifecycle</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Supplier</TableHead>
                        <TableHead>Approval</TableHead>
                        {effectiveCanSeeCosts && <TableHead className="text-right">Unit Cost</TableHead>}
                        {effectiveCanSeeCosts && <TableHead className="text-center">Qty</TableHead>}
                        {effectiveCanSeeCosts && <TableHead className="text-right">Total</TableHead>}
                        <TableHead className="text-center">Purchased</TableHead>
                        <TableHead className="text-center">Delivery</TableHead>
                        <TableHead className="text-center">Received</TableHead>
                        <TableHead className="text-center">Installed</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredItems.map((item) => {
                        const status = calculateItemStatus(item);
                        const total = (item.unit_cost || 0) * (item.quantity || 1);
                        return (
                          <TableRow key={item.id} className={cn('tracker-row', status === 'unsafe' && 'bg-status-unsafe-bg')}>
                            <TableCell className="font-mono text-xs font-semibold text-primary">{item.item_code || '-'}</TableCell>
                            <TableCell>
                              <StatusBadge status={status} label={status === 'at-risk' ? 'At Risk' : status.charAt(0).toUpperCase() + status.slice(1)} size="sm" />
                            </TableCell>
                            <TableCell>
                              <LifecycleBadge status={item.lifecycle_status} />
                            </TableCell>
                            <TableCell className="text-xs">{CATEGORY_LABELS[item.category]}</TableCell>
                            <TableCell className="text-sm font-medium max-w-[200px] truncate" title={item.description}>{item.description}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{item.supplier || '-'}</TableCell>
                            <TableCell>
                              <span className={cn('text-xs px-2 py-1 rounded-full',
                                item.approval_status === 'approved' ? 'bg-status-safe-bg text-status-safe' :
                                item.approval_status === 'rejected' ? 'bg-status-unsafe-bg text-status-unsafe' :
                                'bg-status-at-risk-bg text-status-at-risk'
                              )}>
                                {item.approval_status}
                              </span>
                            </TableCell>
                            {effectiveCanSeeCosts && <TableCell className="text-right font-mono text-xs">{item.unit_cost != null ? item.unit_cost.toFixed(2) : '-'}</TableCell>}
                            {effectiveCanSeeCosts && <TableCell className="text-center font-mono text-xs">{item.quantity ?? 1}</TableCell>}
                            {effectiveCanSeeCosts && <TableCell className="text-right font-mono text-xs">{total > 0 ? total.toFixed(2) : '-'}</TableCell>}
                            <TableCell className="text-center">
                              {item.purchased ? <CheckCircle2 className="w-4 h-4 text-status-safe mx-auto" /> : <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell className="text-center text-xs font-mono">{item.delivery_date || '-'}</TableCell>
                            <TableCell className="text-center">
                              {item.received ? <CheckCircle2 className="w-4 h-4 text-status-safe mx-auto" /> : <span className="text-muted-foreground">-</span>}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.installed ? <CheckCircle2 className="w-4 h-4 text-status-safe mx-auto" /> : <span className="text-muted-foreground">-</span>}
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
          </TabsContent>

          {/* PRESENTATION TAB */}
          <TabsContent value="presentation">
            {projectId && (
              <PresentationBuilder
                projectId={projectId}
                projectName={project.name}
                projectCode={project.code}
              />
            )}
          </TabsContent>
        </Tabs>
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
