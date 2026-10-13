import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ShoppingCart, DollarSign, Clock, UtensilsCrossed,
  TrendingUp, CheckCircle, ArrowRight, ChefHat, BarChart3, Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { fetchTodayOrders } from '@/services/order.service';
import { fetchTables } from '@/services/table.service';
import { useSocketEvent } from '@/lib/socket';
import type { Order, Table as TableType } from '@/lib/types';

interface Stats {
  todayOrders: number;
  todayRevenue: number;
  activeOrders: number;
  availableTables: number;
  occupiedTables: number;
}

const STATUS_CONFIG: Record<string, { label: string; style: string }> = {
  PENDING:   { label: 'Pending',   style: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  CONFIRMED: { label: 'Confirmed', style: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30' },
  PREPARING: { label: 'Preparing', style: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  READY:     { label: 'Ready',     style: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  COMPLETED: { label: 'Completed', style: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  CANCELLED: { label: 'Cancelled', style: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    todayOrders: 0, todayRevenue: 0, activeOrders: 0,
    availableTables: 0, occupiedTables: 0,
  });
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      const [orders, tables] = await Promise.all([
        fetchTodayOrders(),
        fetchTables(),
      ]);

      let revenue = 0;
      let active = 0;
      for (const o of orders) {
        revenue += o.totalAmount ?? 0;
        if (!['COMPLETED', 'CANCELLED'].includes(o.status)) active++;
      }

      const available = tables.filter((t: TableType) => t.status === 'AVAILABLE').length;
      const occupied = tables.filter((t: TableType) => t.status === 'OCCUPIED').length;

      setStats({
        todayOrders: orders.length,
        todayRevenue: revenue,
        activeOrders: active,
        availableTables: available,
        occupiedTables: occupied,
      });
      setRecentOrders(orders);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Live updates via Socket.IO
  useSocketEvent('order:new', () => loadData());
  useSocketEvent('order:statusChanged', () => loadData());
  useSocketEvent('payment:completed', () => loadData());

  const statCards = [
    {
      label: "Today's Orders",
      value: stats.todayOrders,
      icon: ShoppingCart,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/15 ring-1 ring-indigo-500/20',
      subtitle: `${stats.activeOrders} active now`,
    },
    {
      label: "Today's Revenue",
      value: `₹${stats.todayRevenue.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/15 ring-1 ring-emerald-500/20',
      subtitle: 'Gross sales today',
    },
    {
      label: 'Kitchen Tickets',
      value: stats.activeOrders,
      icon: Clock,
      color: 'text-amber-400',
      bg: 'bg-amber-500/15 ring-1 ring-amber-500/20',
      subtitle: 'In preparation',
    },
    {
      label: 'Tables Available',
      value: `${stats.availableTables} / ${stats.availableTables + stats.occupiedTables}`,
      icon: UtensilsCrossed,
      color: 'text-orange-400',
      bg: 'bg-orange-500/15 ring-1 ring-orange-500/20',
      subtitle: `${stats.occupiedTables} occupied tables`,
    },
  ];

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-8">
      {/* Greeting & POS Status Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/60 border border-border/70 p-5 sm:p-6 rounded-2xl shadow-xs">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            Good {getTimeOfDay()} 👋
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Restaurant performance overview &amp; live service statistics.
          </p>
        </div>
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="flex items-center gap-2 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-1.5 text-xs font-bold text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            POS Live Sync
          </div>
          <span className="text-xs text-muted-foreground hidden md:inline font-mono">
            Terminal #01
          </span>
        </div>
      </div>

      {/* Large Touch-friendly Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label} className="relative overflow-hidden border-border/80 bg-card/90 shadow-sm hover:border-border transition-all">
            <CardContent className="flex items-center gap-4 p-5 sm:p-6">
              <div className={`flex h-14 w-14 items-center justify-center rounded-2xl ${s.bg} ${s.color} shrink-0`}>
                <s.icon className="h-7 w-7" />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{s.label}</span>
                {loading ? (
                  <div className="mt-1 h-8 w-24 animate-pulse rounded bg-muted" />
                ) : (
                  <span className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-0.5">{s.value}</span>
                )}
                <span className="text-[11px] text-muted-foreground mt-0.5 truncate">{s.subtitle}</span>
              </div>
              <TrendingUp className="h-4 w-4 absolute right-4 top-4 text-muted-foreground/30 pointer-events-none" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Orders - Scrollable Table Container */}
      <Card className="border-border/80 bg-card/90 shadow-sm overflow-hidden flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between p-5 sm:p-6 border-b border-border/60 shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <CardTitle className="text-lg font-bold">Recent Orders</CardTitle>
              {recentOrders.length > 0 && (
                <Badge variant="secondary" className="text-xs font-bold px-2 py-0.5">
                  {recentOrders.length} Today
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Live order stream from all terminals &amp; tables</p>
          </div>
          <Link
            to="/orders"
            className="text-xs sm:text-sm font-bold text-primary hover:text-primary/80 flex items-center gap-1 transition-colors"
          >
            Open POS Terminal <ArrowRight className="h-4 w-4" />
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <ShoppingCart className="h-10 w-10 opacity-30" />
              <p className="text-sm font-medium">No orders recorded yet today</p>
            </div>
          ) : (
            <div className="max-h-[340px] overflow-y-auto overflow-x-auto relative">
              <Table>
                <TableHeader className="bg-card/95 backdrop-blur-md sticky top-0 z-10 shadow-2xs border-b border-border/80">
                  <TableRow className="border-border/60 hover:bg-transparent">
                    <TableHead className="w-[100px] h-11 text-xs font-bold uppercase tracking-wider">Order #</TableHead>
                    <TableHead className="h-11 text-xs font-bold uppercase tracking-wider">Table / Channel</TableHead>
                    <TableHead className="h-11 text-xs font-bold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="h-11 text-xs font-bold uppercase tracking-wider">Amount</TableHead>
                    <TableHead className="text-right h-11 text-xs font-bold uppercase tracking-wider pr-6">Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOrders.map(o => {
                    const statusInfo = STATUS_CONFIG[o.status] ?? { label: o.status, style: 'bg-muted text-foreground' };
                    return (
                      <TableRow key={o.id} className="border-border/50 hover:bg-muted/40 transition-colors h-13">
                        <TableCell className="font-mono font-bold text-sm text-foreground">
                          #{o.orderNumber}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">
                              {o.tableName ? `Table ${o.tableName}` : 'Direct'}
                            </span>
                            <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wider bg-muted/40">
                              {o.type.replace('_', ' ')}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`font-bold text-[11px] px-2.5 py-0.5 border ${statusInfo.style}`}>
                            {statusInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-extrabold text-base text-foreground font-mono">
                          ₹{(o.totalAmount ?? 0).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground pr-6 font-mono">
                          {o.createdAt ? new Date(o.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Actions - Large Tactile POS Touch Tiles */}
      <div>
        <h3 className="text-base font-bold text-foreground mb-3">POS Quick Navigation</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { href: '/orders',  icon: ShoppingCart,    label: 'New Order',     desc: 'POS Entry',       color: 'text-primary',     bg: 'bg-primary/15' },
            { href: '/tables',  icon: UtensilsCrossed, label: 'Floor Plan',    desc: 'Table Layout',    color: 'text-indigo-400',  bg: 'bg-indigo-500/15' },
            { href: '/menu',    icon: UtensilsCrossed, label: 'Menu Dishes',   desc: 'Pricing & 86',    color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
            { href: '/kds',     icon: ChefHat,         label: 'Kitchen KDS',   desc: 'Ticket Display',  color: 'text-amber-400',   bg: 'bg-amber-500/15' },
            { href: '/reports', icon: BarChart3,       label: 'Reports & P&L', desc: 'Daily Analytics', color: 'text-pink-400',    bg: 'bg-pink-500/15' },
            { href: '/staff',   icon: Users,           label: 'Staff Shifts',  desc: 'Team & Access',   color: 'text-teal-400',    bg: 'bg-teal-500/15' },
          ].map(a => (
            <Link
              key={a.href}
              to={a.href}
              className="group flex flex-col items-center justify-center gap-2.5 rounded-2xl border border-border/80 bg-card/90 p-5 transition-all hover:-translate-y-1 hover:border-primary/50 hover:shadow-lg active:scale-95 text-center cursor-pointer min-h-[120px]"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${a.bg} ${a.color} transition-transform group-hover:scale-110 shadow-xs`}>
                <a.icon className="h-6 w-6" />
              </div>
              <div>
                <span className="text-sm font-bold text-foreground block leading-tight">{a.label}</span>
                <span className="text-[11px] text-muted-foreground mt-0.5 block">{a.desc}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
