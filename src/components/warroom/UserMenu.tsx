import { useFileUrl } from '@/lib/fileUrls';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useDirectConversations } from '@/hooks/useMessages';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, MessageSquare, LogOut, Shield, Crown, CalendarDays, Network, AlertTriangle, CreditCard } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import { useStuckItems } from '@/hooks/useStuckItems';
import { NotificationBell } from '@/components/warroom/NotificationBell';
import { OrgSwitcher } from '@/components/layout/OrgSwitcher';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';

function useMyProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .single();
      return data;
    },
    enabled: !!user,
  });
}

export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { data: profile } = useMyProfile();
  const { data: conversations = [] } = useDirectConversations();
  const { isPlatformAdmin } = usePlatformAdmin();
  const { isOrgAdmin } = usePermissions();
  const { resolvedTheme, setTheme } = useTheme();
  const { roles } = useUserRole();
  const canSeeStuck =
    isOrgAdmin || roles.includes('admin') || roles.includes('coo') || roles.includes('project_manager');
  const { total: stuckTotal } = useStuckItems(7);

  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + c.unreadCount, 0),
    [conversations]
  );

  const avatarSrc = useFileUrl(profile?.avatar_url);
  const displayName = profile?.display_name || user?.email?.split('@')[0] || 'User';
  const initials = displayName.slice(0, 2).toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
  };

  return (
    <div className="flex items-center gap-2">
      <OrgSwitcher />
      <NotificationBell />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="relative focus:outline-none">
            <Avatar className="h-8 w-8 cursor-pointer ring-2 ring-border hover:ring-primary transition-all">
              {profile?.avatar_url ? (
                <AvatarImage src={avatarSrc} alt={displayName} />
              ) : null}
              <AvatarFallback className="text-[10px] bg-muted font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            {totalUnread > 0 && (
              <span className="absolute -top-1 -right-1 flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="px-2 py-1.5">
            <p className="text-sm font-medium">{displayName}</p>
            <p className="text-[11px] text-muted-foreground">{user?.email}</p>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate('/messages')} className="cursor-pointer">
            <MessageSquare className="w-4 h-4 mr-2" />
            Messages
            {totalUnread > 0 && (
              <Badge className="ml-auto h-4 min-w-[16px] text-[9px] px-1">
                {totalUnread}
              </Badge>
            )}
          </DropdownMenuItem>
          {canSeeStuck && (
            <DropdownMenuItem onClick={() => navigate('/stuck-items')} className="cursor-pointer">
              <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
              Item fermi
              {stuckTotal > 0 && (
                <Badge className="ml-auto h-4 min-w-[16px] text-[9px] px-1">
                  {stuckTotal > 99 ? '99+' : stuckTotal}
                </Badge>
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => navigate('/calendar')} className="cursor-pointer">
            <CalendarDays className="w-4 h-4 mr-2" />
            Calendario
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/org-chart')} className="cursor-pointer">
            <Network className="w-4 h-4 mr-2" />
            Organigramma
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/billing')} className="cursor-pointer">
            <CreditCard className="w-4 h-4 mr-2" />
            Piano e fatturazione
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => navigate('/profile')} className="cursor-pointer">
            <User className="w-4 h-4 mr-2" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setTheme(resolvedTheme === 'light' ? 'dark' : 'light')}
            className="cursor-pointer"
          >
            {resolvedTheme === 'light' ? (
              <Moon className="w-4 h-4 mr-2" />
            ) : (
              <Sun className="w-4 h-4 mr-2" />
            )}
            {resolvedTheme === 'light' ? 'Tema scuro' : 'Tema chiaro'}
          </DropdownMenuItem>
          {isOrgAdmin && (
            <DropdownMenuItem onClick={() => navigate('/admin')} className="cursor-pointer">
              <Shield className="w-4 h-4 mr-2" />
              Admin
            </DropdownMenuItem>
          )}
          {isPlatformAdmin && (
            <DropdownMenuItem onClick={() => navigate('/super-admin')} className="cursor-pointer">
              <Crown className="w-4 h-4 mr-2 text-yellow-500" />
              Super-Admin
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="cursor-pointer text-destructive">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

    </div>
  );
}
