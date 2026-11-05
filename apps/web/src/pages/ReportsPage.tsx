import { useState, useEffect, useMemo } from 'react';
import {
  BarChart3, ShoppingCart, DollarSign, TrendingUp,
  CheckCircle, XCircle, Award, Calendar, CreditCard,
  UtensilsCrossed, Truck, ShoppingBag, PieChart,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from '@/components/ui/table';
import { getOrdersForRange, computeSummary, type SummaryStats } from '../services/report.service';
import { getPaymentsForRange } from '../services/payment.service';
import type { Order, Payment } from '../lib/types';

/** Format a Date as YYYY-MM-DD for <input type="date"> */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Parse a YYYY-MM-DD string to start/end of day Dates in LOCAL time (avoids UTC-shift bug) */
function parseRange(fromStr: string, toStr: string): [Date, Date] {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd, 0, 0, 0, 0);
  const to   = new Date(ty, tm - 1, td, 23, 59, 59, 999);
  return [from, to];
}

const TYPE_ICONS = { DINE_IN: UtensilsCrossed, TAKEAWAY: ShoppingBag, DELIVERY: Truck };
const TYPE_COLORS = { DINE_IN: '#6366f1', TAKEAWAY: '#f97316', DELIVERY: '#22c55e' };
const PAYMENT_COLORS = { CASH: '#22c55e', CARD: '#6366f1', UPI: '#f97316' };

export default function ReportsPage() {
  const todayStr = toDateStr(new Date());
  const [fromStr, setFromStr] = useState(todayStr);
  const [toStr,   setToStr]   = useState(todayStr);
  const [orders,   setOrders]   = useState<Order[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading,  setLoading]  = useState(true);

  const [from, to] = useMemo(() => parseRange(fromStr, toStr), [fromStr, toStr]);

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

  const spanDays = useMemo(() => {
    // Use local-date arithmetic to avoid DST/UTC offset issues
    const [fy, fm, fd] = fromStr.split('-').map(Number);
    const [ty, tm, td] = toStr.split('-').map(Number);
    const msPerDay = 86_400_000;
    const fromMs = new Date(fy, fm - 1, fd).getTime();
    const toMs   = new Date(ty, tm - 1, td).getTime();
    return Math.round((toMs - fromMs) / msPerDay) + 1;
  }, [fromStr, toStr]);

  const chartItems = useMemo(() => {
    if (spanDays <= 1) {
      // Single day → hourly breakdown
      return (summary.hourlyStats ?? []).map(h => ({
        id: `hour-${h.hour}`,
        label: h.label,
        sublabel: '',
        revenue: h.revenue,
        orders: h.orders,
      }));
    }

    if (spanDays > 90) {
      // Long range → monthly buckets
      const monthlyMap = new Map<string, { label: string; revenue: number; orders: number }>();
      for (const d of (summary.dailyStats ?? [])) {
        const [year, month] = d.date.split('-');
        const key = `${year}-${month}`;
        const dateObj = new Date(Number(year), Number(month) - 1, 1);
        const label = dateObj.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
        if (!monthlyMap.has(key)) monthlyMap.set(key, { label, revenue: 0, orders: 0 });
        const m = monthlyMap.get(key)!;
        m.revenue += d.revenue;
        m.orders  += d.orders;
      }
      return Array.from(monthlyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, val]) => ({ id, label: val.label, sublabel: '', revenue: val.revenue, orders: val.orders }));
    }

    if (spanDays > 31) {
      // Medium range → weekly buckets (group by ISO week)
      const weeklyMap = new Map<string, { label: string; revenue: number; orders: number }>();
      const sorted = (summary.dailyStats ?? []).slice().sort((a, b) => a.date.localeCompare(b.date));
      for (const d of sorted) {
        const dateObj = new Date(d.date + 'T12:00:00'); // noon avoids DST edge
        // ISO week: Monday-aligned week number within the year
        const dayOfWeek = (dateObj.getDay() + 6) % 7; // Mon=0 … Sun=6
        const monday = new Date(dateObj);
        monday.setDate(dateObj.getDate() - dayOfWeek);
        const weekKey = monday.toISOString().slice(0, 10);
        const label = monday.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        if (!weeklyMap.has(weekKey)) weeklyMap.set(weekKey, { label, revenue: 0, orders: 0 });
        const w = weeklyMap.get(weekKey)!;
        w.revenue += d.revenue;
        w.orders  += d.orders;
      }
      return Array.from(weeklyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, val]) => ({ id, label: val.label, sublabel: '', revenue: val.revenue, orders: val.orders }));
    }

    // 2–31 days → daily
    return (summary.dailyStats ?? [])
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        id: d.date,
        label: new Date(d.date + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        sublabel: '',
        revenue: d.revenue,
        orders: d.orders,
      }));
  }, [summary, spanDays]);

  // Determine chart title based on grouping mode
  const chartMode = spanDays <= 1 ? 'hour' : spanDays > 90 ? 'month' : spanDays > 31 ? 'week' : 'day';
  const chartTitle = {
    hour: 'Hourly Sales (Today)',
    day: 'Revenue by Day',
    week: 'Revenue by Week',
    month: 'Revenue by Month',
  }[chartMode];

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

        {/* Date range picker */}
        <div className="flex items-center gap-2 bg-muted/50 border border-border/60 rounded-xl px-3 py-2">
          <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            id="report-from"
            type="date"
            value={fromStr}
            max={toStr}
            onChange={e => {
              if (e.target.value) setFromStr(e.target.value);
            }}
            className="bg-transparent text-sm font-medium text-foreground outline-none cursor-pointer [color-scheme:dark]"
          />
          <span className="text-muted-foreground text-xs font-semibold">→</span>
          <input
            id="report-to"
            type="date"
            value={toStr}
            min={fromStr}
            max={todayStr}
            onChange={e => {
              if (e.target.value) setToStr(e.target.value);
            }}
            className="bg-transparent text-sm font-medium text-foreground outline-none cursor-pointer [color-scheme:dark]"
          />
        </div>
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
                    {chartTitle}
                  </CardTitle>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {spanDays <= 1
                      ? 'Distribution of order volume & revenue across business hours'
                      : `Revenue tracked: ${fromStr} → ${toStr}`}
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
                ) : (() => {
                  const n = chartItems.length;
                  // Show label every Nth bar so they never collide
                  const labelEvery = n <= 16 ? 1 : n <= 32 ? 2 : n <= 52 ? 4 : 6;
                  const barGap = n <= 20 ? 'gap-1 sm:gap-2' : n <= 40 ? 'gap-px' : 'gap-0';
                  return (
                    <div className="h-64 w-full flex flex-col pt-4 pb-0 px-1">
                      {/* ── Bar area ── */}
                      <div className={`flex-1 flex items-end ${barGap} w-full`}>
                        {chartItems.map((d, idx) => {
                          const heightPercent = maxChartRev > 0 ? Math.round((d.revenue / maxChartRev) * 100) : 0;
                          const hasSales = d.revenue > 0;
                          return (
                            <div
                              key={d.id}
                              className="flex-1 h-full flex flex-col items-center group relative"
                              style={{ minWidth: n > 60 ? '6px' : n > 30 ? '10px' : '18px' }}
                            >
                              {/* Hover Tooltip */}
                              <div className="opacity-0 group-hover:opacity-100 transition-all duration-150 absolute -top-8 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground text-[11px] font-bold py-1 px-2.5 rounded-md shadow-xl border border-border whitespace-nowrap z-30 pointer-events-none">
                                {d.label}: ₹{Number(d.revenue).toFixed(0)} ({d.orders} {d.orders === 1 ? 'order' : 'orders'})
                              </div>

                              {/* Bar Track — flex-1 so it fills up to the baseline */}
                              <div
                                title={`${d.label}: ₹${Number(d.revenue).toFixed(0)} (${d.orders} ${d.orders === 1 ? 'order' : 'orders'})`}
                                className="flex-1 w-full flex items-end bg-muted/20 hover:bg-muted/40 transition-colors rounded-t-sm cursor-pointer"
                              >
                                <div
                                  className={`w-full rounded-t-sm transition-all duration-300 ${
                                    hasSales
                                      ? 'bg-gradient-to-t from-orange-600 via-primary to-amber-400'
                                      : 'bg-zinc-800/30'
                                  }`}
                                  style={{ height: hasSales ? `${Math.max(4, heightPercent)}%` : '3px' }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* ── Baseline rule ── */}
                      <div className="w-full h-px bg-border/40 shrink-0" />

                      {/* ── Label row — fixed height, labels perfectly under each bar ── */}
                      <div className={`flex ${barGap} w-full shrink-0`} style={{ height: '20px' }}>
                        {chartItems.map((d, idx) => {
                          const showLabel = idx % labelEvery === 0;
                          return (
                            <div
                              key={d.id}
                              className="flex-1 flex items-start justify-center overflow-hidden"
                              style={{ minWidth: n > 60 ? '6px' : n > 30 ? '10px' : '18px' }}
                            >
                              {showLabel && (
                                <span className="text-[9px] text-muted-foreground/80 whitespace-nowrap leading-tight pt-1">
                                  {d.label}
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Bar count hint */}
                      {n > 16 && (
                        <p className="text-[10px] text-muted-foreground/50 text-right pr-1 shrink-0">
                          {n} {chartMode === 'month' ? 'months' : chartMode === 'week' ? 'weeks' : chartMode === 'hour' ? 'hours' : 'days'} · hover for details
                        </p>
                      )}
                    </div>
                  );

                })()}
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

