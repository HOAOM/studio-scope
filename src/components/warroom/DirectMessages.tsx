import { useState, useRef, useEffect, useMemo } from 'react';
import { useDirectConversations, useDirectMessages, useSendDirectMessage, DirectMessage } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Send, ArrowLeft, MessageSquare, Search, X, Users } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useProjects } from '@/hooks/useProjects';
import { Checkbox } from '@/components/ui/checkbox';

function useAllProfiles() {
  return useQuery({
    queryKey: ['all-profiles'],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('profiles')
        .select('id, display_name, email, avatar_url');
      if (error) throw error;
      return (data || []) as { id: string; display_name: string | null; email: string | null; avatar_url: string | null }[];
    },
  });
}

function useProjectItemsForSelect(projectId: string | undefined) {
  return useQuery({
    queryKey: ['project-items-select', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('project_items')
        .select('id, item_code, description, parent_item_id, is_selected_option')
        .eq('project_id', projectId)
        .order('item_code');
      if (error) throw error;
      return (data || []).filter((i: any) => !i.parent_item_id || i.is_selected_option) as {
        id: string; item_code: string | null; description: string; parent_item_id: string | null; is_selected_option: boolean | null;
      }[];
    },
    enabled: !!projectId,
  });
}

// Get members of a specific project (for recipient filtering)
function useProjectMembers(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['project-members-for-dm', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data, error } = await (supabase as any)
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId);
      if (error) throw error;
      // Also include project owner
      const { data: proj } = await (supabase as any)
        .from('projects')
        .select('owner_id')
        .eq('id', projectId)
        .single();
      const memberIds = new Set((data || []).map((m: any) => m.user_id));
      if (proj?.owner_id) memberIds.add(proj.owner_id);
      // Remove current user
      if (user?.id) memberIds.delete(user.id);
      return Array.from(memberIds) as string[];
    },
    enabled: !!projectId,
  });
}

export function DirectMessagesPanel({ className }: { className?: string }) {
  const { user } = useAuth();
  const { data: conversations = [] } = useDirectConversations();
  const { data: profiles = [] } = useAllProfiles();
  const { data: projects = [] } = useProjects();
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [projectFilter, setProjectFilter] = useState<string>('all');

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const getName = (id: string) => {
    const p = profileMap.get(id);
    return p?.display_name || p?.email?.split('@')[0] || 'User';
  };
  const getInitials = (id: string) => getName(id).slice(0, 2).toUpperCase();

  const formatDate = (d: string) => {
    const date = new Date(d);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'dd/MM');
  };

  // Filter conversations by project membership
  const filteredConversations = useMemo(() => {
    const projectIds = new Set(projects.map(p => p.id));
    return conversations.filter(conv => {
      // If message has a project_id, user must be member of that project
      if (conv.lastMessage.project_id && !projectIds.has(conv.lastMessage.project_id)) {
        return false;
      }
      // Apply project filter
      if (projectFilter !== 'all') {
        if (!conv.lastMessage.project_id || conv.lastMessage.project_id !== projectFilter) {
          return false;
        }
      }
      return true;
    });
  }, [conversations, projects, projectFilter]);

  if (selectedPartnerId) {
    return (
      <ChatView
        partnerId={selectedPartnerId}
        partnerName={getName(selectedPartnerId)}
        partnerInitials={getInitials(selectedPartnerId)}
        projects={projects}
        projectMap={projectMap}
        profileMap={profileMap}
        onBack={() => setSelectedPartnerId(null)}
        className={className}
      />
    );
  }

  if (showNewChat) {
    return (
      <NewMessageView
        profiles={profiles}
        profileMap={profileMap}
        projects={projects}
        projectMap={projectMap}
        onSelectPartner={(id) => { setSelectedPartnerId(id); setShowNewChat(false); }}
        onBack={() => setShowNewChat(false)}
        className={className}
      />
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4" /> Conversations
        </span>
        <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setShowNewChat(true)}>
          New
        </Button>
      </div>

      {/* Project filter */}
      {projects.length > 1 && (
        <div className="px-3 pt-2">
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-7 text-[10px]">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-[10px]">All projects</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-[10px]">{p.code} - {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <ScrollArea className="flex-1">
        {filteredConversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">No conversations yet</p>
          </div>
        )}
        {filteredConversations.map(conv => {
          const projectName = conv.lastMessage.project_id ? projectMap.get(conv.lastMessage.project_id)?.name : null;
          return (
            <button
              key={conv.partnerId}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/30"
              onClick={() => setSelectedPartnerId(conv.partnerId)}
            >
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="text-[10px] bg-muted">{getInitials(conv.partnerId)}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium truncate">{getName(conv.partnerId)}</span>
                  <span className="text-[9px] text-muted-foreground shrink-0">{formatDate(conv.lastMessage.created_at)}</span>
                </div>
                {(conv.lastMessage.subject || projectName) && (
                  <div className="flex items-center gap-1 mt-0.5">
                    {projectName && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium truncate max-w-[120px]">
                        {projectName}
                      </span>
                    )}
                    {conv.lastMessage.subject && (
                      <span className="text-[10px] text-muted-foreground font-medium truncate">
                        {conv.lastMessage.subject}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">{conv.lastMessage.body}</p>
              </div>
              {conv.unreadCount > 0 && (
                <Badge className="h-4 min-w-[16px] text-[9px] px-1 shrink-0">{conv.unreadCount}</Badge>
              )}
            </button>
          );
        })}
      </ScrollArea>
    </div>
  );
}

// New Message composition view with multi-recipient support
function NewMessageView({ profiles, profileMap, projects, projectMap, onSelectPartner, onBack, className }: {
  profiles: { id: string; display_name: string | null; email: string | null; avatar_url: string | null }[];
  profileMap: Map<string, any>;
  projects: any[];
  projectMap: Map<string, any>;
  onSelectPartner: (id: string) => void;
  onBack: () => void;
  className?: string;
}) {
  const { user } = useAuth();
  const sendMessage = useSendDirectMessage();
  const [search, setSearch] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const { data: projectItems = [] } = useProjectItemsForSelect(selectedProjectId || undefined);
  const { data: projectMemberIds = [] } = useProjectMembers(selectedProjectId || undefined);

  useEffect(() => { setSelectedItemId(''); }, [selectedProjectId]);

  const getName = (id: string) => {
    const p = profileMap.get(id);
    return p?.display_name || p?.email?.split('@')[0] || 'User';
  };

  // When a project is selected, only show members of that project
  const availableUsers = useMemo(() => {
    if (!user) return [];
    let filtered = profiles.filter(p => p.id !== user.id);

    // If project selected, only show project members
    if (selectedProjectId && projectMemberIds.length > 0) {
      const memberSet = new Set(projectMemberIds);
      filtered = filtered.filter(p => memberSet.has(p.id));
    }

    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.display_name?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s)
      );
    }
    return filtered;
  }, [profiles, user, search, selectedProjectId, projectMemberIds]);

  const toggleRecipient = (id: string) => {
    setSelectedRecipients(prev =>
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    );
  };

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed || selectedRecipients.length === 0) return;
    sendMessage.mutate({
      recipientIds: selectedRecipients,
      body: trimmed,
      subject: subject.trim() || undefined,
      projectId: selectedProjectId || undefined,
      itemId: selectedItemId || undefined,
    });
    onBack();
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-medium">New Message</span>
      </div>

      <div className="p-2 space-y-2 border-b border-border">
        {/* Project selector (required for context) */}
        <Select value={selectedProjectId} onValueChange={v => setSelectedProjectId(v === 'none' ? '' : v)}>
          <SelectTrigger className="h-7 text-[10px]">
            <SelectValue placeholder="Select project..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none" className="text-[10px]">General (no project)</SelectItem>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id} className="text-[10px]">{p.code} - {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedProjectId && selectedProjectId !== 'none' && (
          <Select value={selectedItemId} onValueChange={v => setSelectedItemId(v === 'none' ? '' : v)}>
            <SelectTrigger className="h-7 text-[10px]">
              <SelectValue placeholder="Item (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-[10px]">No item</SelectItem>
              {projectItems.map(i => (
                <SelectItem key={i.id} value={i.id} className="text-[10px]">
                  {i.item_code || 'No code'} - {i.description.substring(0, 30)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject (optional)"
          className="h-7 text-[10px]"
        />
      </div>

      {/* Selected recipients chips */}
      {selectedRecipients.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-2">
          <Users className="w-3 h-3 text-muted-foreground mt-0.5" />
          {selectedRecipients.map(id => (
            <span key={id} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {getName(id)}
              <button onClick={() => toggleRecipient(id)} className="hover:text-destructive">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Search and user list */}
      <div className="px-2 pt-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team members..." className="h-8 text-xs pl-8" />
        </div>
      </div>
      <ScrollArea className="flex-1">
        {availableUsers.map(u => (
          <button
            key={u.id}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
            onClick={() => toggleRecipient(u.id)}
          >
            <Checkbox checked={selectedRecipients.includes(u.id)} className="h-3.5 w-3.5" />
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[10px] bg-muted">{getName(u.id).slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{getName(u.id)}</p>
              <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
            </div>
          </button>
        ))}
        {availableUsers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No team members found</p>}
      </ScrollArea>

      {/* Compose & Send */}
      <div className="border-t border-border p-2 space-y-1.5">
        <div className="flex gap-2">
          <Input
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write a message..."
            className="h-8 text-xs"
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          />
          <Button
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleSend}
            disabled={!body.trim() || selectedRecipients.length === 0 || sendMessage.isPending}
          >
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
        {selectedRecipients.length > 0 && (
          <p className="text-[9px] text-muted-foreground">
            Sending to {selectedRecipients.length} recipient{selectedRecipients.length > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}

function ChatView({ partnerId, partnerName, partnerInitials, projects, projectMap, profileMap, onBack, className }: {
  partnerId: string;
  partnerName: string;
  partnerInitials: string;
  projects: any[];
  projectMap: Map<string, any>;
  profileMap: Map<string, any>;
  onBack: () => void;
  className?: string;
}) {
  const { user } = useAuth();
  const { data: messages = [] } = useDirectMessages(partnerId);
  const sendMessage = useSendDirectMessage();
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: projectItems = [] } = useProjectItemsForSelect(selectedProjectId || undefined);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  useEffect(() => { setSelectedItemId(''); }, [selectedProjectId]);

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    sendMessage.mutate({
      recipientIds: [partnerId],
      body: trimmed,
      subject: subject.trim() || undefined,
      projectId: selectedProjectId || undefined,
      itemId: selectedItemId || undefined,
    });
    setBody('');
  };

  const renderContextBadge = (msg: DirectMessage) => {
    const projName = msg.project_id ? projectMap.get(msg.project_id)?.name : null;
    if (!projName && !msg.subject) return null;
    return (
      <div className="flex items-center gap-1 mb-1">
        {projName && (
          <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">
            {projName}
          </span>
        )}
        {msg.subject && (
          <span className="text-[9px] text-muted-foreground font-medium">
            {msg.subject}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-[10px] bg-muted">{partnerInitials}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{partnerName}</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Start a conversation</p>
        )}
        {messages.map(msg => {
          const isOwn = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={cn('flex flex-col', isOwn ? 'items-end' : 'items-start')}>
              {renderContextBadge(msg)}
              <div className={cn(
                'max-w-[75%] px-3 py-1.5 rounded-lg text-xs leading-relaxed',
                isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
              )}>
                {msg.body}
                <span className={cn(
                  'block text-[9px] mt-0.5',
                  isOwn ? 'text-primary-foreground/60' : 'text-muted-foreground/60'
                )}>
                  {format(new Date(msg.created_at), 'HH:mm')}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-2 space-y-1.5">
        <div className="flex gap-1.5">
          <Select value={selectedProjectId} onValueChange={v => setSelectedProjectId(v === 'none' ? '' : v)}>
            <SelectTrigger className="h-7 text-[10px] flex-1">
              <SelectValue placeholder="Project (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-[10px]">No project</SelectItem>
              {projects.map(p => (
                <SelectItem key={p.id} value={p.id} className="text-[10px]">{p.code} - {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedProjectId && selectedProjectId !== 'none' && (
            <Select value={selectedItemId} onValueChange={v => setSelectedItemId(v === 'none' ? '' : v)}>
              <SelectTrigger className="h-7 text-[10px] flex-1">
                <SelectValue placeholder="Item (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none" className="text-[10px]">No item</SelectItem>
                {projectItems.map(i => (
                  <SelectItem key={i.id} value={i.id} className="text-[10px]">
                    {i.item_code || 'No code'} - {i.description.substring(0, 30)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Subject (optional)"
          className="h-7 text-[10px]"
        />
        <div className="flex gap-2">
          <Input
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write a message..."
            className="h-8 text-xs"
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSend} disabled={!body.trim() || sendMessage.isPending}>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
