/**
 * ConfirmDeleteDialog — Two-step confirmation:
 * 1. User must tick a checkbox acknowledging the action
 * 2. The "Delete" button only enables after the checkbox is ticked
 *
 * Prevents accidental hard-deletes (e.g. dropping items + cascading children).
 */
import { useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Short label shown in title, e.g. item code or name */
  itemLabel?: string;
  /** Free-form description of what will be deleted */
  description?: string;
  /** Extra warning shown in red box (e.g. "Will also delete 3 child options") */
  cascadeWarning?: string;
  onConfirm: () => void;
  isPending?: boolean;
}

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  itemLabel,
  description,
  cascadeWarning,
  onConfirm,
  isPending,
}: ConfirmDeleteDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  // Reset acknowledgement whenever the dialog opens/closes
  useEffect(() => {
    if (!open) setAcknowledged(false);
  }, [open]);

  const handleConfirm = () => {
    if (!acknowledged || isPending) return;
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Confirm Permanent Deletion
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              You are about to permanently delete{' '}
              {itemLabel ? <strong className="text-foreground">{itemLabel}</strong> : 'this item'}.
            </span>
            {description && <span className="block text-muted-foreground">{description}</span>}
            <span className="block">
              This action <strong>cannot be undone</strong> and will be recorded in the audit log.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {cascadeWarning && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {cascadeWarning}
          </div>
        )}

        <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3">
          <Checkbox
            id="confirm-delete-ack"
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
            className="mt-0.5"
          />
          <Label
            htmlFor="confirm-delete-ack"
            className="cursor-pointer text-sm font-normal leading-snug"
          >
            I understand this deletion is permanent and I want to proceed.
          </Label>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={!acknowledged || isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isPending ? 'Deleting…' : 'Delete Permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
