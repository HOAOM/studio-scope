import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useProjects } from '@/hooks/useProjects';
import { useSendDirectMessage } from '@/hooks/useMessages';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserMenu } from '@/components/warroom/UserMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Send, MessageSquare, FolderOpen, Paperclip, Search, X, Users, FileText
} from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface DM {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  subject: string | null;
  project_id: string | null;
  item_id: string | null;
  read_at: string | null;
  created_at: string;
  attachment_url: string | null;
  attachment_name: string | null;
}

// ─── Hooks ───────────────────────────────────────────────

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

function useAllDMs() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['all-dms', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase as any)
        .from('direct_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DM[];
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`all-dms-${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => {
        qc.invalidateQueries({ queryKey: ['all-dms', user.id] });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages' }, () => {
        qc.invalidateQueries({ queryKey: ['all-dms', user.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, qc]);

  return query;
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
        id: string; item_code: string | null; description: string;
      }[];
    },
    enabled: !!projectId,
  });
}

function useProjectMemberIds(projectId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['project-members-for-dm', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      const { data } = await (supabase as any).from('project_members').select('user_id').eq('project_id', projectId);
      const { data: proj } = await (supabase as any).from('projects').select('owner_id').eq('id', projectId).single();
      const ids = new Set((data || []).map((m: any) => m.user_id));
      if (proj?.owner_id) ids.add(proj.owner_id);
      if (user?.id) ids.delete(user.id);
      return Array.from(ids) as string[];
    },
    enabled: !!projectId,
  });
}

// ─── Helpers ─────────────────────────────────────────────

const fmtDate = (d: string) => {
  const date = new Date(d);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'dd/MM/yy');
};

interface ThreadKey {
  projectId: string;
  subject: string;
  itemId: string;
}

const mkKey = (t: ThreadKey) => `${t.projectId}||${t.subject}||${t.itemId}`;

interface Thread {
  key: ThreadKey;
  messages: DM[];
  lastMessage: DM;
  participants: Set<string>;
  unreadCount: number;
}

// ─── Page Component ──────────────────────────────────────

export default function MessagesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: allDMs = [] } = useAllDMs();
  const { data: projects = [] } = useProjects();
  const { data: profiles = [] } = useAllProfiles();
  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);
  const projectMap = useMemo(() => new Map(projects.map(p => [p.id, p])), [projects]);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedThread, setSelectedThread] = useState<ThreadKey | null>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);

  const getName = useCallback((id: string) => {
    const p = profileMap.get(id);
    return p?.display_name || p?.email?.split('@')[0] || 'User';
  }, [profileMap]);

  // Build project-level grouping with unread counts
  const projectGroups = useMemo(() => {
    if (!user) return [];
    const projectIds = new Set(projects.map(p => p.id));
    const groups = new Map<string, { projectId: string; unreadCount: number; lastDate: string }>();

    for (const dm of allDMs) {
      if (!dm.project_id || !projectIds.has(dm.project_id)) continue;
      const existing = groups.get(dm.project_id);
      const isUnread = dm.recipient_id === user.id && !dm.read_at;
      if (!existing) {
        groups.set(dm.project_id, {
          projectId: dm.project_id,
          unreadCount: isUnread ? 1 : 0,
          lastDate: dm.created_at,
        });
      } else {
        if (isUnread) existing.unreadCount++;
        if (dm.created_at > existing.lastDate) existing.lastDate = dm.created_at;
      }
    }
    return Array.from(groups.values()).sort((a, b) => b.lastDate.localeCompare(a.lastDate));
  }, [allDMs, projects, user]);

  // Build threads for selected project
  const threads = useMemo(() => {
    if (!user || !selectedProjectId) return [];
    const threadMap = new Map<string, Thread>();

    for (const dm of allDMs) {
      if (dm.project_id !== selectedProjectId) continue;
      const key: ThreadKey = {
        projectId: dm.project_id || '',
        subject: dm.subject || '(no subject)',
        itemId: dm.item_id || '',
      };
      const k = mkKey(key);
      const isUnread = dm.recipient_id === user.id && !dm.read_at;
      if (!threadMap.has(k)) {
        threadMap.set(k, {
          key,
          messages: [dm],
          lastMessage: dm,
          participants: new Set([dm.sender_id, dm.recipient_id]),
          unreadCount: isUnread ? 1 : 0,
        });
      } else {
        const t = threadMap.get(k)!;
        t.messages.push(dm);
        t.participants.add(dm.sender_id);
        t.participants.add(dm.recipient_id);
        if (isUnread) t.unreadCount++;
        if (dm.created_at > t.lastMessage.created_at) t.lastMessage = dm;
      }
    }

    return Array.from(threadMap.values()).sort(
      (a, b) => b.lastMessage.created_at.localeCompare(a.lastMessage.created_at)
    );
  }, [allDMs, selectedProjectId, user]);

  // Get messages for selected thread
  const threadMessages = useMemo(() => {
    if (!selectedThread) return [];
    const k = mkKey(selectedThread);
    const thread = threads.find(t => mkKey(t.key) === k);
    return thread ? [...thread.messages].sort((a, b) => a.created_at.localeCompare(b.created_at)) : [];
  }, [threads, selectedThread]);

  // Mark thread messages as read
  const qc = useQueryClient();
  useEffect(() => {
    if (!user || !selectedThread || threadMessages.length === 0) return;
    const unread = threadMessages.filter(m => m.recipient_id === user.id && !m.read_at);
    if (unread.length > 0) {
      (supabase as any)
        .from('direct_messages')
        .update({ read_at: new Date().toISOString() })
        .in('id', unread.map(m => m.id))
        .then(() => {
          qc.invalidateQueries({ queryKey: ['all-dms', user.id] });
          qc.invalidateQueries({ queryKey: ['dm-conversations', user.id] });
        });
    }
  }, [threadMessages, user, selectedThread, qc]);

  // Get item info for thread
  const selectedItemId = selectedThread?.itemId;
  const { data: itemsForThread = [] } = useProjectItemsForSelect(selectedThread?.projectId);
  const itemInfo = useMemo(() => {
    if (!selectedItemId) return null;
    return itemsForThread.find(i => i.id === selectedItemId) || null;
  }, [itemsForThread, selectedItemId]);

  // Navigate to project detail with item
  const openItem = (projectId: string, itemId: string) => {
    navigate(`/project/${projectId}?openItem=${itemId}`);
  };

  // ─── Render ──────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="h-12 border-b border-border flex items-center justify-between px-4 bg-card shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <MessageSquare className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">Messages</span>
        </div>
        <UserMenu />
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Col 1: Projects */}
        <div className="w-64 border-r border-border flex flex-col bg-card shrink-0">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Projects</span>
            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => setShowNewMessage(true)}>
              New
            </Button>
          </div>
          <ScrollArea className="flex-1">
            {projectGroups.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No messages yet</p>
            )}
            {projectGroups.map(pg => {
              const proj = projectMap.get(pg.projectId);
              if (!proj) return null;
              const isActive = selectedProjectId === pg.projectId;
              return (
                <button
                  key={pg.projectId}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors border-b border-border/30',
                    isActive ? 'bg-primary/5' : 'hover:bg-muted/50'
                  )}
                  onClick={() => { setSelectedProjectId(pg.projectId); setSelectedThread(null); setShowNewMessage(false); }}
                >
                  <FolderOpen className={cn('w-4 h-4 shrink-0', isActive ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-xs font-medium truncate', isActive && 'text-primary')}>{proj.code}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{proj.name}</p>
                  </div>
                  {pg.unreadCount > 0 && (
                    <Badge className="h-4 min-w-[16px] text-[9px] px-1 shrink-0">{pg.unreadCount}</Badge>
                  )}
                </button>
              );
            })}
          </ScrollArea>
        </div>

        {/* Col 2: Threads or New Message */}
        {showNewMessage ? (
          <NewMessagePanel
            projects={projects}
            profiles={profiles}
            profileMap={profileMap}
            getName={getName}
            onSent={(projectId) => {
              setShowNewMessage(false);
              setSelectedProjectId(projectId);
            }}
            onBack={() => setShowNewMessage(false)}
          />
        ) : selectedProjectId && !selectedThread ? (
          <div className="w-80 border-r border-border flex flex-col bg-background shrink-0">
            <div className="p-3 border-b border-border">
              <p className="text-xs font-semibold">
                {projectMap.get(selectedProjectId)?.code} — {projectMap.get(selectedProjectId)?.name}
              </p>
            </div>
            <ScrollArea className="flex-1">
              {threads.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No threads in this project</p>
              )}
              {threads.map(thread => {
                const item = thread.key.itemId
                  ? itemsForThread.find(i => i.id === thread.key.itemId)
                  : null;
                const otherParticipants = Array.from(thread.participants).filter(id => id !== user?.id);
                const hasUnread = thread.unreadCount > 0;

                return (
                  <button
                    key={mkKey(thread.key)}
                    className="w-full flex items-start gap-2.5 px-3 py-3 hover:bg-muted/50 transition-colors text-left border-b border-border/30"
                    onClick={() => setSelectedThread(thread.key)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className={cn('text-xs truncate', hasUnread ? 'font-bold' : 'font-medium')}>
                          {thread.key.subject}
                        </span>
                        <span className="text-[9px] text-muted-foreground shrink-0">
                          {fmtDate(thread.lastMessage.created_at)}
                        </span>
                      </div>
                      {item && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium inline-block mt-0.5">
                          {item.item_code || 'Item'}
                        </span>
                      )}
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px] text-muted-foreground truncate">
                          {otherParticipants.map(id => getName(id)).join(', ')}
                        </span>
                      </div>
                      <p className={cn('text-[10px] truncate mt-0.5', hasUnread ? 'text-foreground font-medium' : 'text-muted-foreground')}>
                        {thread.lastMessage.body}
                      </p>
                    </div>
                    {thread.unreadCount > 0 && (
                      <Badge className="h-4 min-w-[16px] text-[9px] px-1 shrink-0 mt-1">{thread.unreadCount}</Badge>
                    )}
                  </button>
                );
              })}
            </ScrollArea>
          </div>
        ) : !selectedProjectId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a project to view messages</p>
            </div>
          </div>
        ) : null}

        {/* Col 3: Conversation */}
        {selectedThread ? (
          <ConversationPanel
            thread={selectedThread}
            messages={threadMessages}
            profileMap={profileMap}
            projectMap={projectMap}
            itemInfo={itemInfo}
            getName={getName}
            userId={user?.id || ''}
            onBack={() => setSelectedThread(null)}
            onOpenItem={(pid, iid) => openItem(pid, iid)}
          />
        ) : selectedProjectId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Select a thread to view the conversation</p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── New Message Panel ───────────────────────────────────

function NewMessagePanel({ projects, profiles, profileMap, getName, onSent, onBack }: {
  projects: any[];
  profiles: any[];
  profileMap: Map<string, any>;
  getName: (id: string) => string;
  onSent: (projectId: string) => void;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const sendMessage = useSendDirectMessage();
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: projectItems = [] } = useProjectItemsForSelect(selectedProjectId || undefined);
  const { data: memberIds = [] } = useProjectMemberIds(selectedProjectId || undefined);

  useEffect(() => { setSelectedItemId(''); setSelectedRecipients([]); }, [selectedProjectId]);

  const availableUsers = useMemo(() => {
    if (!user) return [];
    let filtered = profiles.filter((p: any) => p.id !== user.id);
    if (selectedProjectId && memberIds.length > 0) {
      const s = new Set(memberIds);
      filtered = filtered.filter((p: any) => s.has(p.id));
    }
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter((p: any) =>
        p.display_name?.toLowerCase().includes(q) || p.email?.toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [profiles, user, search, selectedProjectId, memberIds]);

  const toggleRecipient = (id: string) => {
    setSelectedRecipients(prev => prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]);
  };

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed || selectedRecipients.length === 0 || !selectedProjectId) {
      toast.error('Please select a project and at least one recipient');
      return;
    }
    if (!subject.trim()) {
      toast.error('Subject is required');
      return;
    }

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;

    if (attachFile) {
      const path = `dm-attachments/${Date.now()}-${attachFile.name}`;
      const { error } = await supabase.storage.from('item-files').upload(path, attachFile);
      if (error) { toast.error('Failed to upload file'); return; }
      const { data: urlData } = supabase.storage.from('item-files').getPublicUrl(path);
      attachmentUrl = urlData.publicUrl;
      attachmentName = attachFile.name;
    }

    sendMessage.mutate({
      recipientIds: selectedRecipients,
      body: trimmed,
      subject: subject.trim(),
      projectId: selectedProjectId,
      itemId: selectedItemId || undefined,
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentName || undefined,
    });
    onSent(selectedProjectId);
  };

  return (
    <div className="flex-1 flex flex-col bg-background">
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold">New Message</span>
      </div>

      <div className="p-3 space-y-2 border-b border-border">
        <Select value={selectedProjectId} onValueChange={v => setSelectedProjectId(v)}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select project *" />
          </SelectTrigger>
          <SelectContent>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id} className="text-xs">{p.code} - {p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedProjectId && (
          <Select value={selectedItemId} onValueChange={v => setSelectedItemId(v === 'none' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Select item *" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">General (no item)</SelectItem>
              {projectItems.map(i => (
                <SelectItem key={i.id} value={i.id} className="text-xs">
                  {i.item_code || 'No code'} — {i.description.substring(0, 40)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject *" className="h-8 text-xs" />
      </div>

      {/* Recipients */}
      {selectedRecipients.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pt-2">
          <Users className="w-3.5 h-3.5 text-muted-foreground mt-0.5" />
          {selectedRecipients.map(id => (
            <span key={id} className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">
              {getName(id)}
              <button onClick={() => toggleRecipient(id)} className="hover:text-destructive"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
      )}

      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team members..." className="h-8 text-xs pl-8" />
        </div>
      </div>
      <ScrollArea className="flex-1 max-h-[200px]">
        {availableUsers.map((u: any) => (
          <button
            key={u.id}
            className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
            onClick={() => toggleRecipient(u.id)}
          >
            <Checkbox checked={selectedRecipients.includes(u.id)} className="h-3.5 w-3.5" />
            <Avatar className="h-7 w-7"><AvatarFallback className="text-[10px] bg-muted">{getName(u.id).slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{getName(u.id)}</p>
              <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
            </div>
          </button>
        ))}
      </ScrollArea>

      {/* Compose */}
      <div className="border-t border-border p-3 space-y-2">
        {attachFile && (
          <div className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1">
            <Paperclip className="w-3 h-3" />
            <span className="truncate flex-1">{attachFile.name}</span>
            <button onClick={() => setAttachFile(null)}><X className="w-3 h-3" /></button>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileRef.current?.click()}>
            <Paperclip className="w-4 h-4" />
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={e => setAttachFile(e.target.files?.[0] || null)} />
          <Input
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write a message..."
            className="h-8 text-xs"
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          />
          <Button size="icon" className="h-8 w-8 shrink-0" onClick={handleSend}
            disabled={!body.trim() || selectedRecipients.length === 0 || !selectedProjectId || !subject.trim() || sendMessage.isPending}>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Conversation Panel ──────────────────────────────────

function ConversationPanel({ thread, messages, profileMap, projectMap, itemInfo, getName, userId, onBack, onOpenItem }: {
  thread: ThreadKey;
  messages: DM[];
  profileMap: Map<string, any>;
  projectMap: Map<string, any>;
  itemInfo: { id: string; item_code: string | null; description: string } | null;
  getName: (id: string) => string;
  userId: string;
  onBack: () => void;
  onOpenItem: (projectId: string, itemId: string) => void;
}) {
  const sendMessage = useSendDirectMessage();
  const [body, setBody] = useState('');
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const projectName = projectMap.get(thread.projectId)?.name || '';
  const projectCode = projectMap.get(thread.projectId)?.code || '';

  // Get all unique participants except current user for reply
  const recipientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of messages) {
      ids.add(m.sender_id);
      ids.add(m.recipient_id);
    }
    ids.delete(userId);
    return Array.from(ids);
  }, [messages, userId]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed || recipientIds.length === 0) return;

    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;

    if (attachFile) {
      const path = `dm-attachments/${Date.now()}-${attachFile.name}`;
      const { error } = await supabase.storage.from('item-files').upload(path, attachFile);
      if (error) { toast.error('Failed to upload file'); return; }
      const { data: urlData } = supabase.storage.from('item-files').getPublicUrl(path);
      attachmentUrl = urlData.publicUrl;
      attachmentName = attachFile.name;
    }

    sendMessage.mutate({
      recipientIds,
      body: trimmed,
      subject: thread.subject,
      projectId: thread.projectId,
      itemId: thread.itemId || undefined,
      attachmentUrl: attachmentUrl || undefined,
      attachmentName: attachmentName || undefined,
    });
    setBody('');
    setAttachFile(null);
  };

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Thread header */}
      <div className="p-3 border-b border-border space-y-1">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-7 w-7 lg:hidden" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{thread.subject}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{projectCode}</span>
              {itemInfo && (
                <button
                  className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium hover:underline cursor-pointer"
                  onDoubleClick={() => onOpenItem(thread.projectId, thread.itemId)}
                  title="Double-click to open item"
                >
                  {itemInfo.item_code || 'Item'} — {itemInfo.description.substring(0, 30)}
                </button>
              )}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground">
          {recipientIds.map(id => getName(id)).join(', ')}
        </p>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map(msg => {
          const isOwn = msg.sender_id === userId;
          const senderName = isOwn ? 'You' : getName(msg.sender_id);
          return (
            <div key={msg.id} className={cn('flex gap-2', isOwn && 'flex-row-reverse')}>
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-[9px] bg-muted">{senderName.slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className={cn('max-w-[70%]', isOwn ? 'text-right' : 'text-left')}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground">{senderName}</span>
                  <span className="text-[9px] text-muted-foreground/60">{format(new Date(msg.created_at), 'dd/MM HH:mm')}</span>
                </div>
                <div className={cn(
                  'px-3 py-2 rounded-lg text-xs leading-relaxed',
                  isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                )}>
                  {msg.body}
                </div>
                {msg.attachment_url && (
                  <a
                    href={msg.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-[10px] text-primary hover:underline"
                  >
                    <Paperclip className="w-3 h-3" />
                    {msg.attachment_name || 'Attachment'}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Compose */}
      <div className="border-t border-border p-2 space-y-1.5">
        {attachFile && (
          <div className="flex items-center gap-2 text-xs bg-muted rounded px-2 py-1">
            <Paperclip className="w-3 h-3" />
            <span className="truncate flex-1">{attachFile.name}</span>
            <button onClick={() => setAttachFile(null)}><X className="w-3 h-3" /></button>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => fileRef.current?.click()}>
            <Paperclip className="w-4 h-4" />
          </Button>
          <input ref={fileRef} type="file" className="hidden" onChange={e => setAttachFile(e.target.files?.[0] || null)} />
          <Input
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Reply..."
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
