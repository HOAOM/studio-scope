/**
 * ClientBoardsTab — Manage client boards for a project
 * Generate boards per room, track signature status, export PDF
 */
import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Database } from '@/integrations/supabase/types';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, FileText, CheckCircle2, Clock, Pen, Trash2, Download, Eye } from 'lucide-react';
import { getLifecycleIndex, LIFECYCLE_ORDER } from '@/lib/workflow';

type ProjectItem = Database['public']['Tables']['project_items']['Row'];

interface ClientBoard {
  id: string;
  project_id: string;
  name: string;
  room_filter: string[];
  items: any;
  pdf_url: string | null;
  status: string;
  signed_at: string | null;
  signed_by: string | null;
  created_at: string;
  updated_at: string;
  owner_id: string;
}

interface ClientBoardsTabProps {
  projectId: string;
  items: ProjectItem[];
  projectName: string;
}

const BOARD_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  draft:              { bg: 'bg-muted',             text: 'text-muted-foreground',  label: 'Draft' },
  ready:              { bg: 'bg-primary/10',        text: 'text-primary',           label: 'Ready' },
  waiting_signature:  { bg: 'bg-amber-500/10',      text: 'text-amber-700',         label: 'Awaiting Signature' },
  signed:             { bg: 'bg-status-safe-bg',    text: 'text-status-safe',       label: 'Signed' },
};

export function ClientBoardsTab({ projectId, items, projectName }: ClientBoardsTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [boardName, setBoardName] = useState('');
  const [selectedRooms, setSelectedRooms] = useState<string[]>([]);

  // Fetch boards
  const { data: boards = [], isLoading } = useQuery({
    queryKey: ['client_boards', projectId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('client_boards')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ClientBoard[];
    },
  });

  // Get unique rooms/areas from items
  const roomOptions = useMemo(() => {
    const unique = new Set(items.map(i => i.area));
    return Array.from(unique).sort();
  }, [items]);

  // Items eligible for client board (design + finishes approved)
  const eligibleItems = useMemo(() => {
    return items.filter(i => {
      const idx = getLifecycleIndex(i.lifecycle_status);
      // Must be at least finishes_approved_designer
      return idx >= LIFECYCLE_ORDER.indexOf('finishes_approved_designer');
    });
  }, [items]);

  // Create board mutation
  const createBoard = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Must be logged in');
      const boardItems = selectedRooms.length > 0
        ? eligibleItems.filter(i => selectedRooms.includes(i.area))
        : eligibleItems;

      const { data, error } = await (supabase as any)
        .from('client_boards')
        .insert({
          project_id: projectId,
          name: boardName || `Client Board — ${projectName}`,
          room_filter: selectedRooms,
          items: boardItems.map(i => ({
            id: i.id,
            item_code: i.item_code,
            description: i.description,
            area: i.area,
            category: i.category,
            dimensions: i.dimensions,
            finish_material: i.finish_material,
            finish_color: i.finish_color,
            reference_image_url: i.reference_image_url,
            selling_price: i.selling_price,
            quantity: i.quantity,
          })),
          status: 'draft',
          owner_id: user.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_boards', projectId] });
      setCreateDialogOpen(false);
      setBoardName('');
      setSelectedRooms([]);
      toast.success('Client board created');
    },
    onError: () => toast.error('Failed to create board'),
  });

  // Update board status
  const updateBoardStatus = useMutation({
    mutationFn: async ({ boardId, status }: { boardId: string; status: string }) => {
      const updates: any = { status };
      if (status === 'signed') {
        updates.signed_at = new Date().toISOString();
        updates.signed_by = user?.id;
      }
      const { error } = await (supabase as any)
        .from('client_boards')
        .update(updates)
        .eq('id', boardId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_boards', projectId] });
      toast.success('Board status updated');
    },
  });

  // Delete board
  const deleteBoard = useMutation({
    mutationFn: async (boardId: string) => {
      const { error } = await (supabase as any)
        .from('client_boards')
        .delete()
        .eq('id', boardId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client_boards', projectId] });
      toast.success('Board deleted');
    },
  });

  const toggleRoom = (room: string) => {
    setSelectedRooms(prev =>
      prev.includes(room) ? prev.filter(r => r !== room) : [...prev, room]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Client Boards</h2>
          <p className="text-sm text-muted-foreground">
            Generate boards for client signature • {eligibleItems.length} items eligible
          </p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} disabled={eligibleItems.length === 0}>
          <Plus className="w-4 h-4 mr-2" />
          New Board
        </Button>
      </div>

      {/* Boards Grid */}
      {boards.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-sm">No client boards yet.</p>
          <p className="text-xs mt-1">Create a board when items have approved finishes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boards.map((board) => {
            const statusInfo = BOARD_STATUS_COLORS[board.status] || BOARD_STATUS_COLORS.draft;
            const boardItems = Array.isArray(board.items) ? board.items : [];
            return (
              <Card key={board.id} className="bg-card border-border">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold truncate">{board.name}</CardTitle>
                    <Badge className={cn('text-xs', statusInfo.bg, statusInfo.text)}>
                      {statusInfo.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>{boardItems.length} items</p>
                    {board.room_filter?.length > 0 && (
                      <p>Rooms: {board.room_filter.join(', ')}</p>
                    )}
                    <p>Created: {new Date(board.created_at).toLocaleDateString()}</p>
                    {board.signed_at && (
                      <p className="text-status-safe">Signed: {new Date(board.signed_at).toLocaleDateString()}</p>
                    )}
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {board.status === 'draft' && (
                      <Button size="sm" variant="outline" onClick={() => updateBoardStatus.mutate({ boardId: board.id, status: 'ready' })}>
                        <Eye className="w-3 h-3 mr-1" /> Mark Ready
                      </Button>
                    )}
                    {board.status === 'ready' && (
                      <Button size="sm" variant="outline" onClick={() => updateBoardStatus.mutate({ boardId: board.id, status: 'waiting_signature' })}>
                        <Pen className="w-3 h-3 mr-1" /> Send for Signature
                      </Button>
                    )}
                    {board.status === 'waiting_signature' && (
                      <Button size="sm" onClick={() => updateBoardStatus.mutate({ boardId: board.id, status: 'signed' })}>
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Mark Signed
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteBoard.mutate(board.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Board Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Create Client Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Board Name</label>
              <Input
                placeholder={`Client Board — ${projectName}`}
                value={boardName}
                onChange={e => setBoardName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground mb-2 block">
                Filter by Room/Area (optional — leave empty for all)
              </label>
              <ScrollArea className="max-h-40 border border-border rounded-md p-3">
                <div className="space-y-2">
                  {roomOptions.map(room => (
                    <div key={room} className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedRooms.includes(room)}
                        onCheckedChange={() => toggleRoom(room)}
                      />
                      <span className="text-sm">{room}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {eligibleItems.filter(i => i.area === room).length} items
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedRooms.length > 0
                ? `${eligibleItems.filter(i => selectedRooms.includes(i.area)).length} eligible items`
                : `${eligibleItems.length} total eligible items`}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createBoard.mutate()} disabled={createBoard.isPending}>
              Create Board
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
