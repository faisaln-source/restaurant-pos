import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, UtensilsCrossed, TableProperties,
  Monitor, Users, BarChart3, Settings, LogOut, ChefHat, User, Sparkles, MoreVertical,
  Sun, Moon,
} from 'lucide-react';
import { logout } from '@/services/auth.service';
import { useAuthStore } from '@/store/authStore';
import { disconnectSocket } from '@/lib/socket';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from '@/lib/theme';
import toast from 'react-hot-toast';
import type { UserProfile } from '@/lib/types';

type Role = UserProfile['role'];

const navItems: { to: string; icon: typeof LayoutDashboard; label: string; roles: Role[]; badge?: string }[] = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER'] },
  { to: '/orders',    icon: ShoppingCart,    label: 'Orders',    roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER'] },
  { to: '/kiosk',     icon: Sparkles,        label: 'Customer Kiosk', roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER'], badge: 'Kiosk' },
  { to: '/tables',    icon: TableProperties, label: 'Tables',    roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER'] },
  { to: '/menu',      icon: UtensilsCrossed, label: 'Menu',      roles: ['ADMIN', 'MANAGER'] },
  { to: '/kds',       icon: Monitor,         label: 'Kitchen',   roles: ['ADMIN', 'MANAGER', 'KITCHEN'], badge: 'Live' },
  { to: '/staff',     icon: Users,           label: 'Staff',     roles: ['ADMIN', 'MANAGER'] },
  { to: '/reports',   icon: BarChart3,       label: 'Reports',   roles: ['ADMIN', 'MANAGER'] },
  { to: '/settings',  icon: Settings,        label: 'Settings',  roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] },
];

export default function Sidebar() {
  const navigate = useNavigate();
  const { profile, reset } = useAuthStore();
  const userRole = profile?.role ?? 'WAITER';

  const handleLogout = async () => {
    try {
      await logout();
      disconnectSocket();
      reset();
      navigate('/login');
    } catch {
      toast.error('Failed to logout');
    }
  };

  const visibleItems = navItems.filter((item) => item.roles.includes(userRole));

  return (
    <aside className="w-[240px] flex-shrink-0 hidden md:flex flex-col h-full border-r border-border bg-card/60 backdrop-blur-md select-none transition-all duration-300">
      <SidebarContent visibleItems={visibleItems} profile={profile} handleLogout={handleLogout} />
    </aside>
  );
}

export function SidebarContent({
  visibleItems,
  profile,
  handleLogout,
  onItemClick,
}: {
  visibleItems: typeof navItems;
  profile: UserProfile | null;
  handleLogout: () => void;
  onItemClick?: () => void;
}) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col h-full w-full">
      {/* Brand Logo Header */}
      <div className="flex h-[60px] items-center gap-3 px-4 border-b border-border/80 flex-shrink-0">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-400 text-white shadow-md shadow-orange-500/25">
          <ChefHat size={20} className="stroke-[2.5]" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold tracking-tight text-foreground">RestoPOS</span>
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500" />
          </div>
          <span className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Point of Sale</span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1">
        {visibleItems.map(({ to, icon: Icon, label, badge }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onItemClick}
            className={({ isActive }) =>
              `group relative flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-primary/15 text-primary font-semibold shadow-xs'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    size={18}
                    className={`shrink-0 transition-transform duration-150 group-hover:scale-110 ${
                      isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                    }`}
                  />
                  <span className="truncate">{label}</span>
                </div>
                {badge && (
                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 bg-emerald-500/15 text-emerald-400 border-none font-medium">
                    {badge}
                  </Badge>
                )}
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary" />
                )}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User Profile & Actions Footer with Dropdown */}
      <div className="p-2 border-t border-border/80 flex-shrink-0 bg-card/40">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-between h-auto py-2 px-2 hover:bg-muted/60 rounded-lg group"
            >
              <div className="flex items-center gap-2.5 min-w-0 text-left">
                <Avatar className="h-8 w-8 rounded-lg border border-border/80 bg-gradient-to-tr from-orange-600 to-amber-600 text-white shadow-xs">
                  <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs font-bold">
                    {profile?.name?.charAt(0).toUpperCase() ?? 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                    {profile?.name ?? 'User'}
                  </span>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      {profile?.role ?? 'Staff'}
                    </span>
                  </div>
                </div>
              </div>
              <MoreVertical size={14} className="text-muted-foreground shrink-0 opacity-70 group-hover:opacity-100" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56 mb-2">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold leading-none">{profile?.name ?? 'User'}</p>
                <p className="text-xs leading-none text-muted-foreground truncate">{profile?.email ?? ''}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate('/settings')} className="cursor-pointer">
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={toggleTheme}
              className="cursor-pointer"
              id="sidebar-theme-toggle"
            >
              {theme === 'dark'
                ? <Sun className="mr-2 h-4 w-4" />
                : <Moon className="mr-2 h-4 w-4" />}
              <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10">
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
