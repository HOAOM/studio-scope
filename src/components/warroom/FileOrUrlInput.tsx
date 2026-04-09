/**
 * FileOrUrlInput — Unified component for uploading a file from local disk or entering a URL.
 * Clicking the field opens a popover with two options: upload file or paste URL.
 */
import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Upload, Link2, X, ExternalLink, Loader2, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileOrUrlInputProps {
  label?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  storagePath?: string; // e.g. "projectId/itemId/images"
  bucket?: string;
  accept?: string; // e.g. "image/*,.pdf"
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showPreview?: boolean;
}

export function FileOrUrlInput({
  label,
  value,
  onChange,
  storagePath = 'uploads',
  bucket = 'item-files',
  accept,
  placeholder = 'Upload file or paste URL...',
  disabled = false,
  className,
  showPreview = true,
}: FileOrUrlInputProps) {
  const [open, setOpen] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isImage = value && /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(value);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'bin';
      const path = `${storagePath}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from(bucket).upload(path, file);
      if (error) throw error;
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(urlData.publicUrl);
      toast.success('File uploaded');
      setOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleUrlSubmit = () => {
    if (!urlInput.trim()) return;
    onChange(urlInput.trim());
    setUrlInput('');
    setOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div className={cn('space-y-1', className)}>
      {label && <Label className="text-xs text-muted-foreground">{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              'w-full flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm',
              'hover:bg-accent hover:text-accent-foreground transition-colors text-left min-h-[36px]',
              disabled && 'opacity-50 cursor-not-allowed',
              !value && 'text-muted-foreground'
            )}
          >
            {value ? (
              <>
                {showPreview && isImage ? (
                  <img src={value} alt="" className="w-6 h-6 rounded object-cover shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <Link2 className="w-3.5 h-3.5 shrink-0 text-primary" />
                )}
                <span className="flex-1 truncate text-foreground text-xs">{value.split('/').pop()?.split('?')[0] || value}</span>
                <X className="w-3.5 h-3.5 shrink-0 text-muted-foreground hover:text-destructive" onClick={handleClear} />
              </>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate text-xs">{placeholder}</span>
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-3 space-y-3" align="start">
          {/* Upload from local */}
          <div>
            <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <Upload className="w-3 h-3" /> Upload File
            </Label>
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              onChange={handleFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Uploading...</>
              ) : (
                <>Choose File</>
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className="flex-1 h-px bg-border" />
            or
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Paste URL */}
          <div>
            <Label className="text-xs font-medium mb-1.5 flex items-center gap-1.5">
              <Link2 className="w-3 h-3" /> Paste URL
            </Label>
            <div className="flex gap-1.5">
              <Input
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://..."
                className="h-8 text-xs flex-1"
                onKeyDown={e => e.key === 'Enter' && handleUrlSubmit()}
              />
              <Button size="sm" className="h-8 px-3 text-xs" onClick={handleUrlSubmit} disabled={!urlInput.trim()}>
                OK
              </Button>
            </div>
          </div>

          {/* Current value preview */}
          {value && (
            <div className="pt-2 border-t border-border">
              <a href={value} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-primary hover:underline">
                <ExternalLink className="w-3 h-3" /> Open current file
              </a>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
