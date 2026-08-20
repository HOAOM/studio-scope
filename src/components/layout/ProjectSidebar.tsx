/**
 * ProjectSidebar — vertical, collapsible nav for ProjectDetail.
 * Replaces the horizontal TabsList. Drives Tabs via controlled value/onChange.
 * - Desktop: full sidebar (240px)
 * - Tablet: icon-only (collapsible="icon" → 64px)
 * - Mobile: offcanvas sheet
 */
import { NavLink, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ListTree,
  GanttChart,
  ShieldCheck,
  Package,
  ClipboardSignature,
  Truck,
  Presentation,
  MessageSquare,
  ArrowLeft,
  Layers,
  DoorOpen,
  AppWindow,
  Container,
  Grid2x2,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';

export type ProjectSection =
  | 'overview'
  | 'boq'
  | 'gantt'
  | 'approval'
  | 'items'
  | 'client-boards'
  | 'supplier-docs'
  | 'presentation'
  | 'chat'
  | 'marble-slab'
  | 'door'
  | 'windows'
  | 'panels'
  | 'loading';

const ITEMS: { value: ProjectSection; label: string; icon: typeof LayoutDashboard }[] = [
  { value: 'overview', label: 'Overview', icon: LayoutDashboard },
  { value: 'boq', label: 'BOQ Analyst', icon: ListTree },
  { value: 'gantt', label: 'Gantt & Tasks', icon: GanttChart },
  { value: 'approval', label: 'Approval Gates', icon: ShieldCheck },
  { value: 'items', label: 'Item Tracker', icon: Package },
  { value: 'supplier-docs', label: 'Supplier Docs', icon: Truck },
  { value: 'chat', label: 'Chat', icon: MessageSquare },
];

// Addon modules (label "Addon" is provisional — users will see the addons they pay for).
const ADDON_ITEMS: { value: ProjectSection; label: string; icon: typeof LayoutDashboard }[] = [
  { value: 'client-boards', label: 'Client Boards', icon: ClipboardSignature },
  { value: 'presentation', label: 'Presentation', icon: Presentation },
  { value: 'marble-slab', label: 'Marble Slab', icon: Layers },
  { value: 'door', label: 'Door', icon: DoorOpen },
  { value: 'windows', label: 'Windows', icon: AppWindow },
  { value: 'panels', label: 'Pannelli & Tagli', icon: Grid2x2 },
  { value: 'loading', label: 'Loading / Carichi', icon: Container },
];


interface Props {
  value: ProjectSection;
  onChange: (v: ProjectSection) => void;
  badges?: Partial<Record<ProjectSection, number>>;
}

export function ProjectSidebar({ value, onChange, badges = {} }: Props) {
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const { canSeeSection, isLoading: permsLoading } = usePermissions();

  const visibleItems = permsLoading ? [] : ITEMS.filter((i) => canSeeSection(i.value as any));
  const visibleAddons = permsLoading ? [] : ADDON_ITEMS.filter((i) => canSeeSection(i.value as any));

  return (
    <Sidebar collapsible="icon" className="border-r border-border">
      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Project</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => {
                const isActive = value === item.value;
                const badge = badges[item.value];
                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={{ children: item.label, className: 'z-[60]', sideOffset: 8 }}
                    >
                      <button
                        type="button"
                        onClick={() => onChange(item.value)}
                        className={cn(
                          'flex w-full items-center gap-2',
                          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                        {!collapsed && badge ? (
                          <span className="ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-destructive-foreground">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        ) : null}
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {visibleAddons.length > 0 && (
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Addon</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleAddons.map((item) => {
                const isActive = value === item.value;
                return (
                  <SidebarMenuItem key={item.value}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={{ children: item.label, className: 'z-[60]', sideOffset: 8 }}
                    >
                      <button
                        type="button"
                        onClick={() => onChange(item.value)}
                        className={cn(
                          'flex w-full items-center gap-2',
                          isActive && 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                      </button>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip={{ children: 'Back to projects', className: 'z-[60]', sideOffset: 8 }}>
              <Link to="/" className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Back to projects</span>}
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
