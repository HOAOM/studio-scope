import { useState, useRef, useEffect, useMemo } from 'react';
import { useDirectConversations, useDirectMessages, useSendDirectMessage } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Send, ArrowLeft, MessageSquare, Search } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface DirectMessagesProps {
  className?: string;
}

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

export function DirectMessagesPanel({ className }: DirectMessagesProps) {
  const { user } = useAuth();
  const { data: conversations = [] } = useDirectConversations();
  const { data: profiles = [] } = useAllProfiles();
  const [selectedPartnerId, setSelectedPartnerId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);

  const profileMap = useMemo(() => new Map(profiles.map(p => [p.id, p])), [profiles]);

  const getProfile = (id: string) => profileMap.get(id);
  const getName = (id: string) => {
    const p = getProfile(id);
    return p?.display_name || p?.email?.split('@')[0] || 'User';
  };
  const getInitials = (id: string) => getName(id).slice(0, 2).toUpperCase();

  const formatDate = (d: string) => {
    const date = new Date(d);
    if (isToday(date)) return format(date, 'HH:mm');
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'dd/MM');
  };

  // New chat user list
  const availableUsers = useMemo(() => {
    if (!user) return [];
    return profiles
      .filter(p => p.id !== user.id)
      .filter(p => {
        if (!search) return true;
        const s = search.toLowerCase();
        return (p.display_name?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s));
      });
  }, [profiles, user, search]);

  if (selectedPartnerId) {
    return (
      <ChatView
        partnerId={selectedPartnerId}
        partnerName={getName(selectedPartnerId)}
        partnerInitials={getInitials(selectedPartnerId)}
        onBack={() => setSelectedPartnerId(null)}
        className={className}
      />
    );
  }

  if (showNewChat) {
    return (
      <div className={cn('flex flex-col h-full', className)}>
        <div className="flex items-center gap-2 p-3 border-b border-border">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setShowNewChat(false); setSearch(''); }}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium">New Message</span>
        </div>
        <div className="p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search users..." className="h-8 text-xs pl-8" />
          </div>
        </div>
        <ScrollArea className="flex-1">
          {availableUsers.map(u => (
            <button
              key={u.id}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
              onClick={() => { setSelectedPartnerId(u.id); setShowNewChat(false); setSearch(''); }}
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-[10px] bg-muted">{getName(u.id).slice(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{getName(u.id)}</p>
                <p className="text-[10px] text-muted-foreground truncate">{u.email}</p>
              </div>
            </button>
          ))}
          {availableUsers.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No users found</p>}
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-sm font-medium flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4" /> Messages
        </span>
        <Button variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setShowNewChat(true)}>
          New
        </Button>
      </div>
      <ScrollArea className="flex-1">
        {conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageSquare className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">No conversations yet</p>
          </div>
        )}
        {conversations.map(conv => (
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
              <p className="text-[10px] text-muted-foreground truncate">{conv.lastMessage.body}</p>
            </div>
            {conv.unreadCount > 0 && (
              <Badge className="h-4 min-w-[16px] text-[9px] px-1 shrink-0">{conv.unreadCount}</Badge>
            )}
          </button>
        ))}
      </ScrollArea>
    </div>
  );
}

function ChatView({ partnerId, partnerName, partnerInitials, onBack, className }: {
  partnerId: string; partnerName: string; partnerInitials: string; onBack: () => void; className?: string;
}) {
  const { user } = useAuth();
  const { data: messages = [] } = useDirectMessages(partnerId);
  const sendMessage = useSendDirectMessage();
  const [body, setBody] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    sendMessage.mutate({ recipientId: partnerId, body: trimmed });
    setBody('');
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 p-3 border-b border-border">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-[10px] bg-muted">{partnerInitials}</AvatarFallback>
        </Avatar>
        <span className="text-sm font-medium">{partnerName}</span>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">Start a conversation</p>
        )}
        {messages.map(msg => {
          const isOwn = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}>
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

      {/* Input */}
      <div className="border-t border-border p-2 flex gap-2">
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
  );
}
