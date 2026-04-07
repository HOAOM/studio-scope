/**
 * ItemDocuments — Upload and manage documents for a project item
 * Supports proforma, mail, quotes, and any file type.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Upload, FileText, Trash2, ExternalLink, Download } from 'lucide-react';

interface ItemDocumentsProps {
  itemId: string;
  projectId: string;
  canEdit?: boolean;
}

interface DocFile {
  name: string;
  path: string;
  url: string;
  created_at?: string;
  size?: number;
}

export function ItemDocuments({ itemId, projectId, canEdit = true }: ItemDocumentsProps) {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const folderPath = `${projectId}/${itemId}/docs`;

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['item-documents', itemId],
    queryFn: async () => {
      const { data, error } = await supabase.storage
        .from('item-files')
        .list(folderPath, { sortBy: { column: 'created_at', order: 'desc' } });
      if (error) return [];
      return (data || [])
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => {
          const fullPath = `${folderPath}/${f.name}`;
          const { data: urlData } = supabase.storage.from('item-files').getPublicUrl(fullPath);
          return {
            name: f.name,
            path: fullPath,
            url: urlData.publicUrl,
            created_at: f.created_at,
            size: (f.metadata as any)?.size,
          } as DocFile;
        });
    },
    enabled: !!itemId,
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        const path = `${folderPath}/${safeName}`;
        const { error } = await supabase.storage.from('item-files').upload(path, file);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['item-documents', itemId] });
      toast.success(`${files.length} file(s) uploaded`);
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (doc: DocFile) => {
    try {
      const { error } = await supabase.storage.from('item-files').remove([doc.path]);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['item-documents', itemId] });
      toast.success('File deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const getFileIcon = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase();
    if (['pdf'].includes(ext || '')) return '📄';
    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) return '🖼️';
    if (['xls', 'xlsx', 'csv'].includes(ext || '')) return '📊';
    if (['doc', 'docx'].includes(ext || '')) return '📝';
    if (['eml', 'msg'].includes(ext || '')) return '✉️';
    return '📎';
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <label className="cursor-pointer">
          <input
            type="file"
            multiple
            className="hidden"
            onChange={handleUpload}
            disabled={uploading}
          />
          <div className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary/40 hover:bg-muted/20 transition-colors">
            <Upload className="w-5 h-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">
              {uploading ? 'Uploading...' : 'Click to upload documents (proforma, quotes, emails, etc.)'}
            </p>
          </div>
        </label>
      )}

      {isLoading && <p className="text-xs text-muted-foreground">Loading documents...</p>}

      {documents.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground text-center py-3">No documents uploaded yet.</p>
      )}

      {documents.length > 0 && (
        <div className="space-y-1.5">
          {documents.map(doc => (
            <div key={doc.path} className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
              <span className="text-base shrink-0">{getFileIcon(doc.name)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{doc.name.replace(/^\d+_/, '')}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  {doc.size && <span>{formatSize(doc.size)}</span>}
                  {doc.created_at && <span>{new Date(doc.created_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={doc.url} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                    <Download className="w-3 h-3" />
                  </Button>
                </a>
                {canEdit && (
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(doc)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
