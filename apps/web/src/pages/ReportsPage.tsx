import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3, ShoppingCart, DollarSign, TrendingUp,
  CheckCircle, XCircle, Award, Calendar, CreditCard,
  UtensilsCrossed, Truck, ShoppingBag, PieChart,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { getOrdersForRange, computeSummary, type SummaryStats } from '../services/report.service';
import { getPaymentsForRange } from '../services/payment.service';
import type { Order, Payment } from '../lib/types';

type RangeKey = 'today' | '7d' | '30d' | '90d';

function getRange(key: RangeKey): [Date, Date] {
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (key === '7d') from.setDate(from.getDate() - 6);
  else if (key === '30d') from.setDate(from.getDate() - 29);
  else if (key === '90d') from.setDate(from.getDate() - 89);
  return [from, to];
}

const TYPE_ICONS = { DINE_IN: UtensilsCrossed, TAKEAWAY: ShoppingBag, DELIVERY: Truck };
const TYPE_COLORS = { DINE_IN: '#6366f1', TAKEAWAY: '#f97316', DELIVERY: '#22c55e' };
const PAYMENT_COLORS = { CASH: '#22c55e', CARD: '#6366f1', UPI: '#f97316' };

export default function ReportsPage() {
  const [range, setRange] = useState<RangeKey>('today');
  const [orders, setOrders] = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const [from, to] = useMemo(() => getRange(range), [range]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getOrdersForRange(from, to), getPaymentsForRange(from, to)])
      .then(([o, p]) => {
        setOrders(Array.isArray(o) ? o : []);
        setPayments(Array.isArray(p) ? p : []);
      })
      .catch((err) => {
        console.error('Failed to load analytical reports:', err);
        setOrders([]);
        setPayments([]);
      })
      .finally(() => setLoading(false));
  }, [from, to]);

  const summary: SummaryStats = useMemo(
    () => computeSummary(orders ?? [], payments ?? [], from, to),
    [orders, payments, from, to]
  );

  const chartItems = useMemo(() => {
    if (range === 'today') {
      return (summary.hourlyStats ?? []).map(h => ({
        id: `hour-${h.hour}`,
        label: h.label,
        revenue: h.revenue,
        orders: h.orders,
      }));
    }

    if (range === '90d') {
      // Aggregate into 12-13 weekly buckets for a clean, balanced chart
      const weeklyMap = new Map<string, { label: string; revenue: number; orders: number }>();
      const reversed = (summary.dailyStats ?? []).slice().reverse();
      reversed.forEach((d, idx) => {
        const weekNum = Math.floor(idx / 7) + 1;
        const weekKey = `W${weekNum}`;
        const dateObj = new Date(d.date);
        const label = dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        if (!weeklyMap.has(weekKey)) {
          weeklyMap.set(weekKey, { label, revenue: 0, orders: 0 });
        }
        const w = weeklyMap.get(weekKey)!;
        w.revenue += d.revenue;
        w.orders += d.orders;
      });
      return Array.from(weeklyMap.entries()).map(([id, val]) => ({
        id,
        label: val.label,
        revenue: val.revenue,
        orders: val.orders,
      }));
    }

    return (summary.dailyStats ?? [])
      .slice()
      .reverse()
      .slice(range === '7d' ? -7 : -30)
      .map(d => ({
        id: d.date,
        label: new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        revenue: d.revenue,
        orders: d.orders,
      }));
  }, [summary, range]);

  const maxChartRev = Math.max(...chartItems.map(d => Number(d.revenue) || 0), 1);
  const maxItemQty = (summary.topItems?.length ?? 0) > 0 ? (summary.topItems[0].qty || 1) : 1;

  const totalTypeOrders = (summary.ordersByType?.DINE_IN ?? 0) + (summary.ordersByType?.TAKEAWAY ?? 0) + (summary.ordersByType?.DELIVERY ?? 0);
  const totalPayments = (summary.paymentBreakdown?.CASH ?? 0) + (summary.paymentBreakdown?.CARD ?? 0) + (summary.paymentBreakdown?.UPI ?? 0);

  function buildConicGradient(data: Record<string, number>, colors: Record<string, string>) {
    const total = Object.values(data).reduce((s, v) => s + v, 0);
    if (total === 0) return 'conic-gradient(hsl(var(--muted)) 0deg 360deg)';
    let acc = 0;
    const stops: string[] = [];
    for (const [key, val] of Object.entries(data)) {
      const start = (acc / total) * 360;
      acc += val;
      const end = (acc / total) * 360;
      stops.push(`${colors[key as keyof typeof colors] ?? '#666'} ${start}deg ${end}deg`);
    }
    return `conic-gradient(${stops.join(', ')})`;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-primary" /> Reports & Analytics
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor sales performance, revenue metrics, and high-demand dishes
          </p>
        </div>

        <Tabs value={range} onValueChange={v => setRange(v as RangeKey)}>
          <TabsList className="bg-muted/60">
            <TabsTrigger value="today" className="text-xs px-3">Today</TabsTrigger>
            <TabsTrigger value="7d" className="text-xs px-3">7 Days</TabsTrigger>
            <TabsTrigger value="30d" className="text-xs px-3">30 Days</TabsTrigger>
            <TabsTrigger value="90d" className="text-xs px-3">90 Days</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm">Calculating analytical report...</p>
        </div>
      ) : (
        <>
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <Card className="border-border/60 hover:border-border transition-colors">
              <CardContent className="p-4 flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center shrink-0">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Total Orders</p>
                  <p className="text-xl font-extrabold tracking-tight text-foreground">{summary.totalOrders}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 hover:border-border transition-colors">
              <CardContent className="p-4 flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Total Revenue</p>
                  <p className="text-xl font-extrabold tracking-tight text-foreground">₹{Number(summary.totalRevenue || 0).toFixed(0)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 hover:border-border transition-colors">
              <CardContent className="p-4 flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Avg Order Value</p>
                  <p className="text-xl font-extrabold tracking-tight text-foreground">₹{Number(summary.avgOrderValue || 0).toFixed(0)}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 hover:border-border transition-colors">
              <CardContent className="p-4 flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground truncate">Completed</p>
                  <p className="text-xl font-extrabold tracking-tight text-foreground">{summary.completedOrders}</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 hover:border-border transition-colors col-span-2 md:col-span-1">
              <CardContent className="p-4 flex items-center gap-3.5">
                <div className="h-11 w-11 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center shrink-0">
                  <XCircle className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-medium text-muted-foreground truncate">Cancelled</p>
                    <Badge variant="destructive" className="px-1 py-0 text-[10px] h-4">
                      {summary.totalOrders > 0
                        ? `${((summary.cancelledOrders / summary.totalOrders) * 100).toFixed(1)}%`
                        : '0%'}
                    </Badge>
                  </div>
                  <p className="text-xl font-extrabold tracking-tight text-foreground">{summary.cancelledOrders}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue Bar Chart */}
            <Card className="lg:col-span-2 border-border/60">
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    {range === 'today' ? 'Hourly Sales (Today)' : 'Daily Revenue'}
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {range === 'today'
                      ? 'Distribution of order volume & revenue across business hours'
                      : `Revenue tracked over selected ${range.toUpperCase()} period`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                    ₹{Number(summary.totalRevenue || 0).toFixed(0)} total
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {chartItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground text-sm">
                    <BarChart3 className="w-8 h-8 opacity-30 mb-2" />
                    <p>No revenue data recorded for this period</p>
                  </div>
                ) : (
                  <div className="h-64 w-full pt-8 pb-2 px-2 flex flex-col justify-between">
                    <div className="flex-1 flex items-end gap-1 sm:gap-2 w-full pb-1">
                      {chartItems.map(d => {
                        const heightPercent = maxChartRev > 0 ? Math.round((d.revenue / maxChartRev) * 100) : 0;
                        const hasSales = d.revenue > 0;
                        return (
                          <div
                            key={d.id}
                            className="flex-1 min-w-[20px] sm:min-w-[26px] h-full flex flex-col items-center justify-end group relative"
                          >
                            {/* Hover Tooltip */}
                            <div className="opacity-0 group-hover:opacity-100 transition-all duration-150 absolute top-0 bg-popover text-popover-foreground text-[11px] font-bold py-1 px-2.5 rounded-md shadow-xl border border-border whitespace-nowrap z-30 pointer-events-none scale-95 group-hover:scale-100">
                              ₹{Number(d.revenue).toFixed(0)} ({d.orders} {d.orders === 1 ? 'order' : 'orders'})
                            </div>

                            {/* Bar Track & Fill */}
                            <div
                              title={`₹${Number(d.revenue).toFixed(0)} (${d.orders} ${d.orders === 1 ? 'order' : 'orders'})`}
                              className="w-full max-w-[36px] h-full flex items-end bg-muted/20 hover:bg-muted/40 transition-colors rounded-t-md p-0.5 cursor-pointer"
                            >
                              <div
                                className={`w-full rounded-t-sm transition-all duration-500 ${
                                  hasSales
                                    ? 'bg-gradient-to-t from-orange-600 via-primary to-amber-400 shadow-sm shadow-orange-500/30'
                                    : 'bg-zinc-800/30'
                                }`}
                                style={{ height: hasSales ? `${Math.max(12, heightPercent)}%` : '4px' }}
                              />
                            </div>

                            {/* Bottom Label */}
                            <span className="text-[10px] text-muted-foreground whitespace-nowrap mt-2 group-hover:text-foreground transition-colors truncate max-w-full">
                              {d.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Order Type Donut */}
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-primary" /> Order Fulfillment
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center gap-6 py-2">
                  <div
                    className="relative w-36 h-36 rounded-full flex items-center justify-center shadow-inner"
                    style={{ background: buildConicGradient(summary.ordersByType, TYPE_COLORS) }}
                  >
                    <div className="w-24 h-24 rounded-full bg-card flex flex-col items-center justify-center shadow-md">
                      <span className="text-xl font-extrabold text-foreground">{totalTypeOrders}</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">orders</span>
                    </div>
                  </div>

                  <div className="w-full space-y-2">
                    {Object.entries(summary.ordersByType).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between text-xs p-1.5 rounded-md hover:bg-muted/40">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: TYPE_COLORS[key as keyof typeof TYPE_COLORS] }}
                          />
                          <span className="text-foreground capitalize">{key.replace('_', ' ').toLowerCase()}</span>
                        </div>
                        <span className="font-bold text-foreground">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Payment Breakdown + Top Items Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Items (2 cols) */}
            <Card className="lg:col-span-2 border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-400" /> Top Selling Items
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {summary.topItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
                    <Award className="w-8 h-8 opacity-30 mb-2" />
                    <p>No dish data recorded yet</p>
                  </div>
                ) : (
                  summary.topItems.map((item, i) => (
                    <div
                      key={item.name}
                      className="flex items-center gap-3 p-2.5 rounded-lg border border-border/40 bg-card/60 hover:bg-muted/30 transition-colors"
                    >
                      <span
                        className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-black shrink-0 ${
                          i === 0
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : i === 1
                            ? 'bg-slate-300/20 text-slate-200 border border-slate-300/30'
                            : i === 2
                            ? 'bg-amber-700/20 text-amber-500 border border-amber-700/30'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm font-semibold text-foreground flex-1 truncate">{item.name}</span>
                      <div className="w-28 sm:w-44 h-2 bg-muted rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${(item.qty / maxItemQty) * 100}%` }}
                        />
                      </div>
                      <Badge variant="secondary" className="font-bold text-xs shrink-0">
                        {item.qty} sold
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Payment Method Donut (1 col) */}
            <Card className="border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-primary" /> Payment Methods
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center justify-center gap-6 py-2">
                  <div
                    className="relative w-36 h-36 rounded-full flex items-center justify-center shadow-inner"
                    style={{ background: buildConicGradient(summary.paymentBreakdown, PAYMENT_COLORS) }}
                  >
                    <div className="w-24 h-24 rounded-full bg-card flex flex-col items-center justify-center shadow-md">
                      <span className="text-xl font-extrabold text-foreground">{totalPayments}</span>
                      <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">payments</span>
                    </div>
                  </div>

                  <div className="w-full space-y-2">
                    {Object.entries(summary.paymentBreakdown).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between text-xs p-1.5 rounded-md hover:bg-muted/40">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: PAYMENT_COLORS[key as keyof typeof PAYMENT_COLORS] }}
                          />
                          <span className="text-foreground">{key}</span>
                        </div>
                        <span className="font-bold text-foreground">{val}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Daily Breakdown Table */}
          {summary.dailyStats.length > 0 && (
            <Card className="border-border/60 overflow-hidden">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" /> Daily Breakdown
                </CardTitle>
              </CardHeader>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Orders</TableHead>
                      <TableHead>Revenue</TableHead>
                      <TableHead>Avg Value</TableHead>
                      <TableHead>Dine In</TableHead>
                      <TableHead>Takeaway</TableHead>
                      <TableHead>Delivery</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.dailyStats.map(d => (
                      <TableRow key={d.date}>
                        <TableCell className="font-semibold text-foreground">
                          {new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </TableCell>
                        <TableCell>{d.orders}</TableCell>
                        <TableCell className="font-bold text-emerald-400">
                          ₹{d.revenue.toFixed(0)}
                        </TableCell>
                        <TableCell>₹{d.avgOrderValue.toFixed(0)}</TableCell>
                        <TableCell>{d.byType.DINE_IN}</TableCell>
                        <TableCell>{d.byType.TAKEAWAY}</TableCell>
                        <TableCell>{d.byType.DELIVERY}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

