/**
 * DynamicFinishes — Manage dynamic finish label+value pairs
 * Procurement can add new finish specifications, which triggers retrocession to design.
 */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export interface DynamicFinish {
  label: string;
  value: string;
  added_by?: string;
  added_at?: string;
}

interface DynamicFinishesProps {
  finishes: DynamicFinish[];
  onChange: (finishes: DynamicFinish[]) => void;
  canAdd: boolean;
  canEdit: boolean;
  userId?: string;
  /** Called when a new field is added — triggers retrocession */
  onFieldAdded?: () => void;
}

export function DynamicFinishes({ finishes, onChange, canAdd, canEdit, userId, onFieldAdded }: DynamicFinishesProps) {
  const [newLabel, setNewLabel] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAdd = () => {
    if (!newLabel.trim()) return;

    const updated: DynamicFinish[] = [
      ...finishes,
      {
        label: newLabel.trim(),
        value: '',
        added_by: userId,
        added_at: new Date().toISOString(),
      },
    ];
    onChange(updated);
    setNewLabel('');
    setShowAddForm(false);
    toast.info(`New finish field "${newLabel.trim()}" added — item will return to Design for completion`);
    onFieldAdded?.();
  };

  const handleUpdateValue = (index: number, value: string) => {
    const updated = [...finishes];
    updated[index] = { ...updated[index], value };
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    const updated = finishes.filter((_, i) => i !== index);
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Additional Finishes
        </h4>
        {canAdd && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] px-2"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            <Plus className="w-3 h-3 mr-1" /> Add Finish Field
          </Button>
        )}
      </div>

      {showAddForm && canAdd && (
        <div className="flex items-center gap-2 p-2 rounded-lg border border-dashed border-primary/30 bg-primary/5">
          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          <div className="flex-1 space-y-1">
            <p className="text-[10px] text-amber-600">Adding a field will send this item back to Design for completion.</p>
            <div className="flex gap-2">
              <Input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                placeholder="Field name (e.g. Glass type)"
                className="h-7 text-xs flex-1"
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <Button size="sm" className="h-7 text-xs" onClick={handleAdd} disabled={!newLabel.trim()}>
                Add
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {finishes.length === 0 && !showAddForm && (
        <p className="text-xs text-muted-foreground text-center py-2">No additional finishes specified.</p>
      )}

      {finishes.map((finish, i) => (
        <div key={i} className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] h-5 shrink-0 min-w-[80px] justify-center">
            {finish.label}
          </Badge>
          {canEdit ? (
            <Input
              value={finish.value}
              onChange={e => handleUpdateValue(i, e.target.value)}
              placeholder={`Enter ${finish.label}...`}
              className={cn(
                'h-7 text-xs flex-1',
                !finish.value && 'border-amber-400/50 bg-amber-950/10'
              )}
            />
          ) : (
            <span className={cn(
              'text-xs flex-1',
              finish.value ? 'text-foreground' : 'text-amber-500 italic'
            )}>
              {finish.value || 'Pending — Design to fill'}
            </span>
          )}
          {canAdd && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemove(i)}>
              <Trash2 className="w-3 h-3" />
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
