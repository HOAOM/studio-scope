import { useState, useCallback } from 'react';
import {
  usePresentations,
  useCreatePresentation,
  useUpdatePresentation,
  useDeletePresentation,
  PresentationPage,
  PresentationCell,
  Presentation,
} from '@/hooks/usePresentations';
import { PresentationPageView } from './PresentationPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Save,
  Loader2,
  FileDown,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

interface PresentationBuilderProps {
  projectId: string;
  projectName: string;
  projectCode: string;
}

export function PresentationBuilder({ projectId, projectName, projectCode }: PresentationBuilderProps) {
  const { data: presentations = [], isLoading } = usePresentations(projectId);
  const createPresentation = useCreatePresentation();
  const updatePresentation = useUpdatePresentation();
  const deletePresentation = useDeletePresentation();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const selected = presentations.find(p => p.id === selectedId) || null;
  const pages = selected?.pages_data || [];
  const currentPage = pages[currentPageIndex];

  const handleCreate = async () => {
    try {
      const result = await createPresentation.mutateAsync({ projectId, name: 'New Presentation' });
      setSelectedId(result.id);
      setCurrentPageIndex(0);
      toast.success('Presentation created');
    } catch {
      toast.error('Failed to create presentation');
    }
  };

  const handleSavePages = useCallback(async (newPages: PresentationPage[]) => {
    if (!selected) return;
    try {
      await updatePresentation.mutateAsync({
        id: selected.id,
        projectId,
        pages_data: newPages,
      });
    } catch {
      toast.error('Failed to save');
    }
  }, [selected, projectId, updatePresentation]);

  const handleCellUpdate = (cellIndex: number, cell: PresentationCell) => {
    if (!selected || !currentPage) return;
    const newCells = [...currentPage.cells];
    newCells[cellIndex] = cell;
    const newPages = pages.map((p, i) =>
      i === currentPageIndex ? { ...p, cells: newCells } : p
    );
    handleSavePages(newPages);
  };

  const addPage = () => {
    if (!selected) return;
    const newPage: PresentationPage = {
      id: crypto.randomUUID(),
      cells: Array(6).fill({ type: 'empty', content: '' }),
    };
    const newPages = [...pages, newPage];
    handleSavePages(newPages);
    setCurrentPageIndex(newPages.length - 1);
  };

  const deletePage = () => {
    if (!selected || pages.length <= 1) return;
    const newPages = pages.filter((_, i) => i !== currentPageIndex);
    handleSavePages(newPages);
    setCurrentPageIndex(Math.min(currentPageIndex, newPages.length - 1));
  };

  const handleDeletePresentation = async () => {
    if (!selected) return;
    try {
      await deletePresentation.mutateAsync({ id: selected.id, projectId });
      setSelectedId(null);
      setCurrentPageIndex(0);
      toast.success('Presentation deleted');
      setDeleteDialogOpen(false);
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleRenameSave = async (name: string) => {
    if (!selected) return;
    try {
      await updatePresentation.mutateAsync({ id: selected.id, projectId, name });
      toast.success('Renamed');
    } catch {
      toast.error('Failed to rename');
    }
  };

  const exportPDF = async () => {
    if (!selected || pages.length === 0) return;
    setExporting(true);
    try {
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
      const container = document.getElementById('presentation-export-area');
      if (!container) return;

      for (let i = 0; i < pages.length; i++) {
        setCurrentPageIndex(i);
        await new Promise(r => setTimeout(r, 200));
        const canvas = await html2canvas(container, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, 0, 420, 297);
      }

      pdf.save(`${selected.name || projectName}_presentation.pdf`);
      toast.success('PDF exported');
    } catch {
      toast.error('PDF export failed');
    } finally {
      setExporting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // List view when no presentation is selected
  if (!selected) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Presentations</h2>
          <Button onClick={handleCreate} disabled={createPresentation.isPending}>
            {createPresentation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
            New Presentation
          </Button>
        </div>

        {presentations.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <FileText className="w-10 h-10 mx-auto mb-4 opacity-50" />
            <p>No presentations yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {presentations.map(pres => (
              <div
                key={pres.id}
                onClick={() => { setSelectedId(pres.id); setCurrentPageIndex(0); }}
                className="bg-card border border-border rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
              >
                <h3 className="font-semibold text-foreground">{pres.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {(pres.pages_data || []).length} page{(pres.pages_data || []).length !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-mono">
                  {new Date(pres.updated_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Editor view
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Input
            value={selected.name}
            onChange={(e) => handleRenameSave(e.target.value)}
            className="w-60 h-8 text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportPDF} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileDown className="w-4 h-4 mr-1" />}
            Export PDF
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* Page navigation */}
      <div className="flex items-center justify-center gap-4">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={currentPageIndex === 0}
          onClick={() => setCurrentPageIndex(i => i - 1)}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {currentPageIndex + 1} of {pages.length}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={currentPageIndex >= pages.length - 1}
          onClick={() => setCurrentPageIndex(i => i + 1)}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={addPage}>
          <Plus className="w-4 h-4 mr-1" /> Add Page
        </Button>
        {pages.length > 1 && (
          <Button variant="ghost" size="sm" onClick={deletePage} className="text-destructive">
            <Trash2 className="w-4 h-4 mr-1" /> Remove Page
          </Button>
        )}
      </div>

      {/* Page editor */}
      {currentPage && (
        <div id="presentation-export-area" className="max-w-5xl mx-auto">
          <PresentationPageView
            cells={currentPage.cells}
            projectName={projectName}
            projectCode={projectCode}
            pageNumber={currentPageIndex + 1}
            totalPages={pages.length}
            onCellUpdate={handleCellUpdate}
          />
        </div>
      )}

      {/* Delete dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Presentation</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selected.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeletePresentation} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
