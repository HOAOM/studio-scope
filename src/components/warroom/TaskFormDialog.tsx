import { useState, useEffect } from 'react';
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
import { CalendarIcon } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCreateTask, useUpdateTask, ProjectTask } from '@/hooks/useTasks';
import { toast } from 'sonner';

const MACRO_AREAS = [
  { value: 'planning', label: 'Planning & Prep' },
  { value: 'design_validation', label: 'Design Validation' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'production', label: 'Production' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'installation', label: 'Installation' },
  { value: 'closing', label: 'Closing' },
  { value: 'custom', label: 'Custom' },
];

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
  items?: { id: string; item_code: string | null; description: string }[];
}

export function TaskFormDialog({ open, onOpenChange, projectId, task, members = [], tasks = [], items = [] }: TaskFormDialogProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [macroArea, setMacroArea] = useState('custom');
  const [status, setStatus] = useState('todo');
  const [assigneeId, setAssigneeId] = useState<string>('none');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [dependsOn, setDependsOn] = useState<string>('none');
  const [linkedItemId, setLinkedItemId] = useState<string>('none');

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description || '');
      setMacroArea(task.macro_area);
      setStatus(task.status);
      setAssigneeId(task.assignee_id || 'none');
      setStartDate(task.start_date ? parseISO(task.start_date) : undefined);
      setEndDate(task.end_date ? parseISO(task.end_date) : undefined);
      setDependsOn((task as any).depends_on || 'none');
      setLinkedItemId(task.linked_item_id || 'none');
      setTitle('');
      setDescription('');
      setMacroArea('custom');
      setStatus('todo');
      setAssigneeId('none');
      setStartDate(undefined);
      setEndDate(undefined);
      setDependsOn('none');
    }
  }, [task, open]);

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('Title is required'); return; }
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      macro_area: macroArea,
      status,
      assignee_id: assigneeId === 'none' ? null : assigneeId,
      start_date: startDate ? format(startDate, 'yyyy-MM-dd') : null,
      end_date: endDate ? format(endDate, 'yyyy-MM-dd') : null,
      depends_on: dependsOn === 'none' ? null : dependsOn,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Task title..." />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description..." rows={2} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Macro Area</Label>
              <Select value={macroArea} onValueChange={setMacroArea}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MACRO_AREAS.map(a => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
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
