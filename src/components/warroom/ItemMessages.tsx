import { useState, useRef, useEffect } from 'react';
import { useItemMessages, useSendItemMessage } from '@/hooks/useMessages';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface ItemMessagesProps {
  itemId: string;
  profiles?: Map<string, { display_name: string | null; email: string | null }>;
}

export function ItemMessages({ itemId, profiles }: ItemMessagesProps) {
  const { user } = useAuth();
  const { data: messages = [], isLoading } = useItemMessages(itemId);
  const sendMessage = useSendItemMessage();
  const [body, setBody] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    sendMessage.mutate({ itemId, body: trimmed });
    setBody('');
  };

  const getSenderName = (senderId: string) => {
    if (senderId === user?.id) return 'You';
    const p = profiles?.get(senderId);
    return p?.display_name || p?.email?.split('@')[0] || 'User';
  };

  const getInitials = (senderId: string) => {
    const name = getSenderName(senderId);
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
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
                  'px-3 py-1.5 rounded-lg text-xs leading-relaxed',
                  isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                )}>
                  {msg.body}
                </div>
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
