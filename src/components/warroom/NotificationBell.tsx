import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, type AppNotification } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, Check, AtSign, Activity, ShieldCheck, Info } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { it } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const ICONS: Record<string, any> = {
  mention: AtSign,
  status_change: Activity,
  approval_needed: ShieldCheck,
  info: Info,
};

export function NotificationBell() {
  const navigate = useNavigate();
  const { data: notifications = [], unreadCount } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const list = notifications.slice(0, 10);

  const handleClick = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if ((n.type === 'status_change' || n.type === 'approval_needed' || n.type === 'mention') && n.project_id) {
      navigate(`/project/${n.project_id}${n.item_id ? `?item=${n.item_id}` : ''}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative p-1.5 rounded-md hover:bg-muted transition-colors focus:outline-none">
          <Bell className="h-5 w-5 text-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 p-0">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold">Notifiche</h3>
          {unreadCount > 0 && <span className="text-[10px] text-muted-foreground">{unreadCount} non lette</span>}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {list.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Nessuna notifica</p>
          ) : list.map(n => {
            const Icon = ICONS[n.type] || Info;
            return (
              <div key={n.id} className={cn(
                'flex gap-2 px-3 py-2 border-b border-border/50 hover:bg-muted/50 transition-colors',
                !n.read && 'bg-primary/5'
              )}>
                <button onClick={() => handleClick(n)} className="flex-1 text-left flex gap-2 min-w-0">
                  <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', !n.read ? 'text-primary' : 'text-muted-foreground')} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-xs leading-tight truncate', !n.read && 'font-semibold')}>{n.title}</p>
                    {n.body && <p className="text-[11px] text-muted-foreground truncate">{n.body}</p>}
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: it })}
                    </p>
                  </div>
                </button>
                {!n.read && (
                  <button
                    onClick={(e) => { e.stopPropagation(); markRead.mutate(n.id); }}
                    className="shrink-0 self-start p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title="Segna come letta"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {unreadCount > 0 && (
          <div className="border-t border-border p-2">
            <Button variant="ghost" size="sm" className="w-full text-xs h-8" onClick={() => markAll.mutate()}>
              Segna tutte come lette
            </Button>
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
