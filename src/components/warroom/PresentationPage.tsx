import { useState } from 'react';
import { PresentationCell } from '@/hooks/usePresentations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Image, Type, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PresentationPageProps {
  cells: PresentationCell[];
  projectName: string;
  projectCode: string;
  pageNumber: number;
  totalPages: number;
  onCellUpdate: (index: number, cell: PresentationCell) => void;
  readOnly?: boolean;
}

export function PresentationPageView({
  cells,
  projectName,
  projectCode,
  pageNumber,
  totalPages,
  onCellUpdate,
  readOnly = false,
}: PresentationPageProps) {
  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden" style={{ aspectRatio: '420/297' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface-elevated">
        <div>
          <span className="font-mono text-xs text-muted-foreground">{projectCode}</span>
          <h3 className="text-sm font-semibold text-foreground">{projectName}</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          Page {pageNumber} / {totalPages}
        </div>
      </div>

      {/* 2x3 Grid */}
      <div className="grid grid-cols-3 grid-rows-2 gap-px bg-border flex-1" style={{ height: 'calc(100% - 52px)' }}>
        {cells.slice(0, 6).map((cell, index) => (
          <CellEditor
            key={index}
            cell={cell}
            onChange={(newCell) => onCellUpdate(index, newCell)}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

function CellEditor({
  cell,
  onChange,
  readOnly,
}: {
  cell: PresentationCell;
  onChange: (cell: PresentationCell) => void;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [tempContent, setTempContent] = useState(cell.content);

  const handleSetType = (type: 'image' | 'text') => {
    setEditing(true);
    setTempContent(cell.content);
    onChange({ type, content: cell.content });
  };

  const handleSave = () => {
    onChange({ ...cell, content: tempContent });
    setEditing(false);
  };

  const handleClear = () => {
    onChange({ type: 'empty', content: '' });
    setEditing(false);
  };

  if (cell.type === 'empty' && !readOnly) {
    return (
      <div className="bg-background flex items-center justify-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => handleSetType('image')}>
          <Image className="w-4 h-4 mr-1" /> Image
        </Button>
        <Button variant="ghost" size="sm" onClick={() => handleSetType('text')}>
          <Type className="w-4 h-4 mr-1" /> Text
        </Button>
      </div>
    );
  }

  if (cell.type === 'image') {
    return (
      <div className="bg-background relative group">
        {editing || !cell.content ? (
          <div className="p-3 flex flex-col gap-2 h-full justify-center">
            <Input
              placeholder="Paste image URL..."
              value={tempContent}
              onChange={(e) => setTempContent(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
            <div className="flex gap-1">
              <Button size="sm" onClick={handleSave}>Set</Button>
              <Button size="sm" variant="ghost" onClick={handleClear}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <img
              src={cell.content}
              alt="Slide content"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder.svg'; }}
            />
            {!readOnly && (
              <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setTempContent(cell.content); setEditing(true); }}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={handleClear}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  if (cell.type === 'text') {
    return (
      <div className="bg-background relative group">
        {editing || !cell.content ? (
          <div className="p-3 flex flex-col gap-2 h-full">
            <Textarea
              placeholder="Enter text..."
              value={tempContent}
              onChange={(e) => setTempContent(e.target.value)}
              className="flex-1 resize-none text-xs"
            />
            <div className="flex gap-1">
              <Button size="sm" onClick={handleSave}>Set</Button>
              <Button size="sm" variant="ghost" onClick={handleClear}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="p-3 text-xs text-foreground whitespace-pre-wrap overflow-auto h-full">
              {cell.content}
            </div>
            {!readOnly && (
              <div className="absolute inset-0 bg-background/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => { setTempContent(cell.content); setEditing(true); }}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={handleClear}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return <div className="bg-background" />;
}
