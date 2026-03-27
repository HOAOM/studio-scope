import { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Wand2, Info } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCreateTask, useUpdateTask, ProjectTask } from '@/hooks/useTasks';
import { TASK_TEMPLATES, ITEM_FIELD_LABELS } from '@/lib/taskTemplates';
import { getMacroPhase } from '@/lib/workflow';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const STATUSES = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
];

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  task?: ProjectTask | null;
  members?: { id: string; display_name: string | null; email: string | null }[];
  tasks?: ProjectTask[];
  items?: { id: string; item_code: string | null; description: string; lifecycle_status?: string | null }[];
}

export function TaskFormDialog({ open, onOpenChange, projectId, task, members = [], tasks = [], items = [] }: TaskFormDialogProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('todo');
  const [assigneeId, setAssigneeId] = useState<string>('none');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [dependsOn, setDependsOn] = useState<string>('none');
  const [linkedItemId, setLinkedItemId] = useState<string>('none');
  const [completionFields, setCompletionFields] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('none');

  // Derive macro_area from linked item
  const derivedMacroArea = useMemo(() => {
    if (linkedItemId === 'none') return 'planning';
    const item = items.find(i => i.id === linkedItemId);
    if (!item?.lifecycle_status) return 'planning';
    return getMacroPhase(item.lifecycle_status as any) || 'planning';
  }, [linkedItemId, items]);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setStatus(task.status);
      setAssigneeId(task.assignee_id || 'none');
      setStartDate(task.start_date ? parseISO(task.start_date) : undefined);
      setEndDate(task.end_date ? parseISO(task.end_date) : undefined);
      setDependsOn((task as any).depends_on || 'none');
      setLinkedItemId(task.linked_item_id || 'none');
      setCompletionFields((task as any).completion_fields || []);
      setSelectedTemplate('none');
    } else {
      setTitle('');
      setDescription('');
      setStatus('todo');
      setAssigneeId('none');
      setStartDate(undefined);
      setEndDate(undefined);
      setDependsOn('none');
      setLinkedItemId('none');
      setCompletionFields([]);
      setSelectedTemplate('none');
    }
  }, [task, open]);

  const handleTemplateSelect = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    if (templateKey === 'none') return;
    const tpl = TASK_TEMPLATES.find(t => t.key === templateKey);
    if (tpl) {
      setTitle(tpl.label);
      setDescription(tpl.description);
      setCompletionFields(tpl.completionFields);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    if (linkedItemId === 'none') { toast.error('Please link this task to an item'); return; }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      macro_area: derivedMacroArea,
      status,
      assignee_id: assigneeId === 'none' ? null : assigneeId,
      start_date: startDate ? format(startDate, 'yyyy-MM-dd') : null,
      end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
      depends_on: dependsOn === 'none' ? null : dependsOn,
      linked_item_id: linkedItemId === 'none' ? null : linkedItemId,
      completion_fields: completionFields.length > 0 ? completionFields : null,
    };
    try {
      if (task) {
        await updateTask.mutateAsync({ id: task.id, projectId, ...payload });
        toast.success('Task updated');
      } else {
        await createTask.mutateAsync({ project_id: projectId, ...payload });
        toast.success('Task created');
      }
      onOpenChange(false);
    } catch {
      toast.error('Failed to save task');
    }
  };

  // Has completion fields = auto-completing task, disable manual status change to 'done'
  const isAutoComplete = completionFields.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Linked Item (required) */}
          <div>
            <Label>Linked Item <span className="text-destructive">*</span></Label>
            <Select value={linkedItemId} onValueChange={setLinkedItemId}>
              <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select an item...</SelectItem>
                {items.map(item => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.item_code ? `${item.item_code} — ` : ''}{item.description.slice(0, 50)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Template quick-select */}
          {!task && (
            <div>
              <Label className="flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5 text-primary" />
                Task Template
              </Label>
              <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                <SelectTrigger><SelectValue placeholder="Choose a template..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Custom task (manual)</SelectItem>
                  {TASK_TEMPLATES.map(tpl => (
                    <SelectItem key={tpl.key} value={tpl.key}>
                      {tpl.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground mt-1">Templates auto-complete when the required fields are filled on the item</p>
            </div>
          )}

          <div>
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description..." rows={2} />
          </div>

          {/* Auto-completion fields display */}
          {isAutoComplete && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-primary" />
                <span className="text-[11px] font-medium text-primary">Auto-completing task</span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                This task will automatically mark as "Done" when the following fields are filled on the item:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {completionFields.map(f => (
                  <Badge key={f} variant="secondary" className="text-[10px] h-5">
                    {ITEM_FIELD_LABELS[f] || f}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div>
                      <Select 
                        value={status} 
                        onValueChange={setStatus}
                        disabled={isAutoComplete}
                      >
                        <SelectTrigger className={cn(isAutoComplete && 'opacity-50')}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.filter(s => !isAutoComplete || s.value !== 'done').map(s => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </TooltipTrigger>
                  {isAutoComplete && (
                    <TooltipContent>
                      <p className="text-xs">Status is controlled automatically by field completion</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            </div>
            <div>
              <Label>Macro Phase</Label>
              <Input value={derivedMacroArea.replace('_', ' ')} disabled className="capitalize text-muted-foreground opacity-60" />
            </div>
          </div>

          {members.length > 0 && (
            <div>
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {members.map(m => (
                    <SelectItem key={m.id} value={m.id}>{m.display_name || m.email || m.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {startDate ? format(startDate, 'dd MMM yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !endDate && 'text-muted-foreground')}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {endDate ? format(endDate, 'dd MMM yyyy') : 'Pick date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Dependency */}
          {tasks.filter(t => t.id !== task?.id).length > 0 && (
            <div>
              <Label>Depends On</Label>
              <Select value={dependsOn} onValueChange={setDependsOn}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No dependency</SelectItem>
                  {tasks.filter(t => t.id !== task?.id).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={createTask.isPending || updateTask.isPending}>
            {task ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
