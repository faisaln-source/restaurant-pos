import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell, Clock, Plus, Menu, LayoutDashboard, ShoppingCart,
  TableProperties, UtensilsCrossed, Monitor, Users, BarChart3, Settings,
  Sun, Moon,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { SidebarContent } from './Sidebar';
import { useAuthStore } from '@/store/authStore';
import { logout } from '@/services/auth.service';
import { disconnectSocket } from '@/lib/socket';
import { useTheme } from '@/lib/theme';
import toast from 'react-hot-toast';

const PAGE_TITLES: Record<string, { title: string; subtitle?: string }> = {
  '/dashboard': { title: 'Dashboard', subtitle: 'Live overview and performance stats' },
  '/orders':    { title: 'Orders & POS', subtitle: 'Point of sale order entry & checkout' },
  '/tables':    { title: 'Floor & Tables', subtitle: 'Table seating and section management' },
  '/menu':      { title: 'Menu Management', subtitle: 'Items, categories, pricing & recipes' },
  '/kds':       { title: 'Kitchen Display (KDS)', subtitle: 'Real-time kitchen order tickets' },
  '/staff':     { title: 'Staff & Shifts', subtitle: 'Team roles, attendance, and activity' },
  '/reports':   { title: 'Reports & Analytics', subtitle: 'Sales reports, revenue, and trends' },
  '/settings':  { title: 'Store Settings', subtitle: 'Restaurant preferences & account' },
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, reset } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const pageInfo = PAGE_TITLES[location.pathname] ?? { title: 'RestoPOS' };
  const [time, setTime] = useState(new Date());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

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

  return (
    <header className="flex h-[60px] shrink-0 items-center justify-between border-b border-border/80 bg-card/40 px-4 sm:px-6 backdrop-blur-md z-10">
      <div className="flex items-center gap-3">
        {/* Mobile Navigation Drawer */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 text-muted-foreground hover:text-foreground"
              aria-label="Open Navigation"
            >
              <Menu size={20} />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="p-0 w-72 bg-card border-r border-border">
            <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
            <SheetDescription className="sr-only">Access POS pages and settings</SheetDescription>
            <SidebarContent
              visibleItems={[
                { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER'] },
                { to: '/orders', icon: ShoppingCart, label: 'Orders', roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER'] },
                { to: '/tables', icon: TableProperties, label: 'Tables', roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER'] },
                { to: '/menu', icon: UtensilsCrossed, label: 'Menu', roles: ['ADMIN', 'MANAGER'] },
                { to: '/kds', icon: Monitor, label: 'Kitchen', roles: ['ADMIN', 'MANAGER', 'KITCHEN'], badge: 'Live' },
                { to: '/staff', icon: Users, label: 'Staff', roles: ['ADMIN', 'MANAGER'] },
                { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['ADMIN', 'MANAGER'] },
                { to: '/settings', icon: Settings, label: 'Settings', roles: ['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN'] },
              ].filter(item => item.roles.includes(profile?.role ?? 'WAITER')) as any}
              profile={profile}
              handleLogout={handleLogout}
              onItemClick={() => setMobileMenuOpen(false)}
            />
          </SheetContent>
        </Sheet>

        <div className="flex items-baseline gap-2 sm:gap-3">
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground">{pageInfo.title}</h1>
          {pageInfo.subtitle && (
            <span className="hidden md:inline text-xs text-muted-foreground/80 font-normal">
              — {pageInfo.subtitle}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Quick New Order Shortcut */}
        {location.pathname !== '/orders' && (
          <Button
            size="sm"
            onClick={() => navigate('/orders')}
            className="h-8 gap-1.5 font-medium shadow-xs bg-primary hover:bg-primary/90 text-primary-foreground hidden sm:inline-flex"
          >
            <Plus size={15} />
            <span>New Order</span>
          </Button>
        )}

        {/* Dark / Light Mode Toggle */}
        <Button
          variant="ghost"
          size="icon"
          id="theme-toggle-btn"
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground relative overflow-hidden"
        >
          <span
            className="absolute inset-0 flex items-center justify-center transition-all duration-300"
            style={{
              opacity: theme === 'dark' ? 1 : 0,
              transform: theme === 'dark' ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0)',
            }}
          >
            <Moon size={16} />
          </span>
          <span
            className="absolute inset-0 flex items-center justify-center transition-all duration-300"
            style={{
              opacity: theme === 'light' ? 1 : 0,
              transform: theme === 'light' ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0)',
            }}
          >
            <Sun size={16} />
          </span>
        </Button>

        {/* Live Clock Pill */}
        <div className="flex items-center gap-2 rounded-full border border-border/80 bg-muted/40 px-3 py-1 text-xs text-muted-foreground shadow-2xs">
          <Clock size={13} className="text-primary" />
          <span className="font-semibold text-foreground">
            {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="hidden lg:inline text-muted-foreground/60 border-l border-border/60 pl-2">
            {time.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>

        {/* Notifications Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-8 w-8 text-muted-foreground hover:text-foreground rounded-full">
              <Bell size={16} />
              <span className="absolute right-1 top-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <Badge variant="secondary" className="text-[10px] font-medium">Live</Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="py-2 px-3 text-xs text-muted-foreground space-y-2">
              <div className="flex items-start gap-2.5 p-2 rounded-md bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer">
                <div className="h-2 w-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground text-xs">Socket.IO Connected</p>
                  <p className="text-[11px] text-muted-foreground">Real-time updates active for orders and tables.</p>
                </div>
              </div>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
