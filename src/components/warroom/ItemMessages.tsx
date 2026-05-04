import { useState, useRef, useEffect, useMemo } from 'react';
import { useItemMessages, useSendItemMessage } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { useProjectMembers } from '@/hooks/useProjectMembers';
import { createNotification } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ItemMessagesProps {
  itemId: string;
  projectId?: string;
  itemDescription?: string;
  profiles?: Map<string, { display_name: string | null; email: string | null }>;
}

export function ItemMessages({ itemId, projectId, itemDescription, profiles }: ItemMessagesProps) {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useItemMessages(itemId);
  const sendMessage = useSendItemMessage();
  const { data: members = [] } = useProjectMembers(projectId);
  const [body, setBody] = useState('');
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  const filteredMembers = useMemo(() => {
    const q = mentionQuery.toLowerCase();
    return members.filter(m => (m.display_name || m.email || '').toLowerCase().includes(q)).slice(0, 6);
  }, [members, mentionQuery]);

  const handleChange = (val: string) => {
    setBody(val);
    const cursor = inputRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const match = before.match(/@([\w\s]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionOpen(true);
    } else {
      setMentionOpen(false);
    }
  };

  const insertMention = (name: string) => {
    if (!inputRef.current) return;
    const cursor = inputRef.current.selectionStart ?? body.length;
    const before = body.slice(0, cursor).replace(/@[\w\s]*$/, `@${name} `);
    const after = body.slice(cursor);
    setBody(before + after);
    setMentionOpen(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSend = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    sendMessage.mutate({ itemId, body: trimmed });

    // Detect @mentions and create notifications
    if (projectId && members.length) {
      const mentioned = new Set<string>();
      for (const m of members) {
        const name = m.display_name || m.email?.split('@')[0];
        if (name && new RegExp(`@${name}\\b`, 'i').test(trimmed) && m.user_id !== user?.id) {
          mentioned.add(m.user_id);
        }
      }
      const truncated = trimmed.length > 100 ? trimmed.slice(0, 100) + '…' : trimmed;
      const itemLabel = itemDescription || 'item';
      await Promise.all(Array.from(mentioned).map(uid =>
        createNotification({
          user_id: uid,
          type: 'mention',
          title: `Hai una menzione in ${itemLabel}`,
          body: truncated,
          item_id: itemId,
          project_id: projectId,
        })
      ));
    }
    setBody('');
    setMentionOpen(false);
  };

  const getSenderName = (senderId: string) => {
    if (senderId === user?.id) return 'You';
    const p = profiles?.get(senderId);
    return p?.display_name || p?.email?.split('@')[0] || 'User';
  };
  const getInitials = (senderId: string) => getSenderName(senderId).slice(0, 2).toUpperCase();

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 p-3 min-h-0 max-h-[300px]">
        {isLoading && <p className="text-xs text-muted-foreground text-center">Loading...</p>}
        {!isLoading && messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">No messages yet. Start the conversation.</p>
        )}
        {messages.map(msg => {
          const isOwn = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={cn('flex gap-2', isOwn && 'flex-row-reverse')}>
              <Avatar className="h-6 w-6 shrink-0">
                <AvatarFallback className="text-[9px] bg-muted">{getInitials(msg.sender_id)}</AvatarFallback>
              </Avatar>
              <div className={cn('max-w-[75%]', isOwn ? 'text-right' : 'text-left')}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-medium text-muted-foreground">{getSenderName(msg.sender_id)}</span>
                  <span className="text-[9px] text-muted-foreground/60">{format(new Date(msg.created_at), 'HH:mm')}</span>
                </div>
                <div className={cn(
                  'px-3 py-1.5 rounded-lg text-xs leading-relaxed whitespace-pre-wrap',
                  isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                )}>
                  {msg.body}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-border p-2 relative">
        {mentionOpen && filteredMembers.length > 0 && (
          <div className="absolute bottom-full left-2 right-2 mb-1 z-10 bg-popover border border-border rounded-md shadow-lg overflow-hidden">
            {filteredMembers.map(m => (
              <button
                key={m.user_id}
                type="button"
                onClick={() => insertMention(m.display_name || m.email?.split('@')[0] || 'user')}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted flex items-center gap-2"
              >
                <Avatar className="h-5 w-5"><AvatarFallback className="text-[8px]">{(m.display_name || m.email || '??').slice(0,2).toUpperCase()}</AvatarFallback></Avatar>
                <span>{m.display_name || m.email}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{m.role}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={body}
            onChange={e => handleChange(e.target.value)}
            placeholder="Scrivi un messaggio... usa @ per menzionare"
            className="text-xs min-h-[36px] max-h-32"
            rows={1}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey && !mentionOpen) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button size="icon" className="h-9 w-9 shrink-0 self-end" onClick={handleSend} disabled={!body.trim() || sendMessage.isPending}>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
