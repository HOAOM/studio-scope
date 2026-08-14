/**
 * ItemDocuments — Manage URL-based document fields on the item plus extra storage attachments.
 */
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  SECURE_BUCKET,
  uploadSecureFile,
  removeSecureFile,
  resolveFileUrl,
  toSecureRef,
} from '@/lib/secureFiles';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Image as ImageIcon,
  Box,
  ExternalLink,
  FileText,
  Receipt,
  Paperclip,
  Pencil,
  X,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';

type UrlFieldKey =
  | 'reference_image_url'
  | 'image_3d_ref'
  | 'company_product_url'
  | 'technical_drawing_url'
  | 'proforma_url';

const URL_FIELDS: { key: UrlFieldKey; label: string; Icon: any }[] = [
  { key: 'reference_image_url', label: 'Immagine di Riferimento', Icon: ImageIcon },
  { key: 'image_3d_ref', label: 'Riferimento 3D', Icon: Box },
  { key: 'company_product_url', label: 'Link Prodotto', Icon: ExternalLink },
  { key: 'technical_drawing_url', label: 'Disegno Tecnico', Icon: FileText },
  { key: 'proforma_url', label: 'Proforma', Icon: Receipt },
];

interface ItemDocumentsProps {
  item: any;
  onUpdate: (patch: Record<string, any>) => void | Promise<void>;
  canEdit?: boolean;
}

function truncate(s: string, n = 40) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

export function ItemDocuments({ item, onUpdate, canEdit = true }: ItemDocumentsProps) {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<UrlFieldKey | null>(null);
  const [draft, setDraft] = useState('');
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachName, setAttachName] = useState('');
  const [attachUrl, setAttachUrl] = useState('');

  const projectId = item?.project_id as string;
  const itemId = item?.id as string;
  const folderPath = `${projectId}/${itemId}/docs`;

  const startEdit = (key: UrlFieldKey) => {
    setEditingKey(key);
    setDraft(item?.[key] ?? '');
  };
  const cancelEdit = () => {
    setEditingKey(null);
    setDraft('');
  };
  const saveEdit = async () => {
    if (!editingKey) return;
    try {
      await onUpdate({ [editingKey]: draft.trim() || null });
      toast.success('Documento aggiornato');
      cancelEdit();
    } catch {
      toast.error('Errore nel salvataggio');
    }
  };
  const clearField = async (key: UrlFieldKey) => {
    try {
      await onUpdate({ [key]: null });
      toast.success('Campo svuotato');
    } catch {
      toast.error('Errore nello svuotamento');
    }
  };

  // Extra attachments stored in the private "secure-docs" bucket
  const { data: attachments = [], isLoading: loadingAttachments } = useQuery({
    queryKey: ['item-attachments', itemId],
    queryFn: async () => {
      if (!itemId || !projectId) return [];
      const { data, error } = await supabase.storage
        .from(SECURE_BUCKET)
        .list(folderPath, { sortBy: { column: 'created_at', order: 'desc' } });
      if (error) return [];
      return (data || [])
        .filter((f) => f.name !== '.emptyFolderPlaceholder')
        .map((f) => {
          const fullPath = `${folderPath}/${f.name}`;
          return {
            id: fullPath,
            path: fullPath,
            name: f.name.replace(/^\d+__/, '').replace(/^\d+_/, ''),
            created_at: f.created_at,
          };
        });
    },
    enabled: !!itemId && !!projectId,
  });

  const handleAddAttachment = async () => {
    if (!attachUrl.trim()) {
      toast.error('Inserisci un URL');
      return;
    }
    try {
      const safeName = `${Date.now()}__${(attachName || 'link').replace(/[^a-zA-Z0-9._-]/g, '_')}.url`;
      const path = `${folderPath}/${safeName}`;
      const blob = new Blob([attachUrl.trim()], { type: 'text/uri-list' });
      await uploadSecureFile(path, blob);
      queryClient.invalidateQueries({ queryKey: ['item-attachments', itemId] });
      toast.success('Allegato aggiunto');
      setAttachOpen(false);
      setAttachName('');
      setAttachUrl('');
    } catch {
      toast.error('Errore nell\'aggiunta');
    }
  };

  const handleOpenAttachment = async (path: string) => {
    const url = await resolveFileUrl(toSecureRef(path));
    if (!url) {
      toast.error('Impossibile aprire il file');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleDeleteAttachment = async (path: string) => {
    try {
      await removeSecureFile(path);
      queryClient.invalidateQueries({ queryKey: ['item-attachments', itemId] });
      toast.success('Allegato eliminato');
    } catch {
      toast.error('Errore nell\'eliminazione');
    }
  };


  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {URL_FIELDS.map(({ key, label, Icon }) => {
          const value: string | null = item?.[key] ?? null;
          const isEditing = editingKey === key;
          return (
            <div
              key={key}
              className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border bg-card"
            >
              <Icon className="w-4 h-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">{label}</div>
                {isEditing ? (
                  <div className="flex items-center gap-1 mt-1">
                    <Input
                      autoFocus
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="https://…"
                      className="h-7 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                    />
                    <Button size="sm" className="h-7 px-2" onClick={saveEdit}>
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEdit}>
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : value ? (
                  <a
                    href={value}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline break-all"
                  >
                    {truncate(value, 40)}
                  </a>
                ) : (
                  <span className="text-sm text-muted-foreground italic">Non caricato</span>
                )}
              </div>
              {!isEditing && canEdit && (
                <div className="flex items-center gap-1 shrink-0">
                  {value ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                        onClick={() => startEdit(key)}
                      >
                        <Pencil className="w-3 h-3" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => clearField(key)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7" onClick={() => startEdit(key)}>
                      <Plus className="w-3 h-3 mr-1" /> Aggiungi
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-border pt-3">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-semibold text-foreground">Allegati aggiuntivi</h4>
          {canEdit && (
            <Button size="sm" variant="outline" className="h-7" onClick={() => setAttachOpen(true)}>
              <Plus className="w-3 h-3 mr-1" /> Aggiungi allegato
            </Button>
          )}
        </div>

        {loadingAttachments && (
          <p className="text-xs text-muted-foreground">Caricamento allegati…</p>
        )}
        {!loadingAttachments && attachments.length === 0 && (
          <p className="text-xs text-muted-foreground italic py-2">Nessun allegato.</p>
        )}
        <div className="space-y-1.5">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-3 py-2 px-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors"
            >
              <Paperclip className="w-4 h-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <button
                  type="button"
                  onClick={() => handleOpenAttachment(att.path)}
                  className="text-sm text-primary hover:underline break-all text-left"
                >
                  {att.name}
                </button>

                {att.created_at && (
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(att.created_at).toLocaleDateString()}
                  </div>
                )}
              </div>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDeleteAttachment(att.path)}
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={attachOpen} onOpenChange={setAttachOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aggiungi allegato</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Descrizione</Label>
              <Input
                value={attachName}
                onChange={(e) => setAttachName(e.target.value)}
                placeholder="Es. Scheda tecnica"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs">URL</Label>
              <Input
                value={attachUrl}
                onChange={(e) => setAttachUrl(e.target.value)}
                placeholder="https://…"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAttachOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleAddAttachment}>Salva</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
