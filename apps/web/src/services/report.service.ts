/**
 * Report service — fetch reports from Express API.
 * Computation now happens server-side.
 */
import api from '../lib/api';
import type { Order, Payment } from '../lib/types';

// ── Normalize order decimal fields ─────────────────────────────────────────
function normalizeOrder(o: any): Order {
  return {
    ...o,
    tableName: o.table?.name ?? o.tableName,
    totalAmount: Number(o.totalAmount ?? 0),
    subtotal: Number(o.subtotal ?? o.totalAmount ?? 0),
    taxAmount: Number(o.taxAmount ?? 0),
    discountAmount: Number(o.discountAmount ?? 0),
    items: (o.items ?? []).map((i: any) => ({
      ...i,
      menuItemName: i.menuItem?.name ?? i.menuItemName ?? 'Dish Item',
      unitPrice: Number(i.unitPrice ?? 0),
      totalPrice: Number(i.totalPrice ?? 0),
      quantity: Number(i.quantity ?? 1),
    })),
  };
}

// ── Fetch orders for date range ────────────────────────────────────────────
export async function getOrdersForRange(from: Date, to: Date): Promise<Order[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const orders = await api.get<Order[]>(`/api/orders?${params}`);
  return (orders ?? []).map(normalizeOrder);
}

// ── Dashboard stats from API ───────────────────────────────────────────────
export interface DashboardStats {
  todayOrders: number;
  todayRevenue: number;
  activeOrders: number;
  avgOrderValue: number;
  completedOrders: number;
  cancelledOrders: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  return api.get<DashboardStats>('/api/reports/dashboard');
}

// ── Revenue report ─────────────────────────────────────────────────────────
export async function fetchRevenueReport(from: Date, to: Date) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return api.get(`/api/reports/revenue?${params}`);
}

// ── Top selling items ──────────────────────────────────────────────────────
export async function fetchTopItems(from: Date, to: Date) {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return api.get(`/api/reports/top-items?${params}`);
}

// ── Aggregate daily stats (client-side computation for backward compat) ───
// ── Hourly & Daily stats ───────────────────────────────────────────────────
export interface HourlyStat {
  hour: number;
  label: string;
  orders: number;
  revenue: number;
}

export interface DailyStat {
  date: string;
  orders: number;
  revenue: number;
  avgOrderValue: number;
  topItems: { name: string; qty: number }[];
  byType: { DINE_IN: number; TAKEAWAY: number; DELIVERY: number };
  byStatus: Record<string, number>;
  byPaymentMethod: { CASH: number; CARD: number; UPI: number };
}

export function computeHourlyStats(orders: Order[] = []): HourlyStat[] {
  const hoursMap = new Map<number, { orders: number; revenue: number }>();

  // Slots from 8 AM to 11 PM
  for (let h = 8; h <= 23; h++) {
    hoursMap.set(h, { orders: 0, revenue: 0 });
  }

  for (const o of (orders ?? [])) {
    if (o.status === 'CANCELLED') continue;
    const date = o.createdAt ? new Date(o.createdAt) : new Date();
    const h = date.getHours();
    if (hoursMap.has(h)) {
      const slot = hoursMap.get(h)!;
      slot.orders += 1;
      slot.revenue += Number(o.totalAmount ?? 0);
    }
  }

  const slots: HourlyStat[] = [];
  for (let h = 8; h <= 23; h++) {
    const slot = hoursMap.get(h)!;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    slots.push({
      hour: h,
      label: `${displayHour} ${ampm}`,
      orders: slot.orders,
      revenue: slot.revenue,
    });
  }

  return slots;
}

export function computeDailyStats(
  orders: Order[] = [],
  payments: Payment[] = [],
  from?: Date,
  to?: Date
): DailyStat[] {
  const dayMap = new Map<string, {
    orders: Order[];
    revenue: number;
  }>();

  // If date range provided, ensure each day in range is present
  if (from && to) {
    const cur = new Date(from);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    while (cur <= end) {
      const dStr = cur.toISOString().split('T')[0];
      dayMap.set(dStr, { orders: [], revenue: 0 });
      cur.setDate(cur.getDate() + 1);
    }
  }

  for (const o of (orders ?? [])) {
    const date = o.createdAt ? new Date(o.createdAt).toISOString().split('T')[0] : 'unknown';
    if (!dayMap.has(date)) dayMap.set(date, { orders: [], revenue: 0 });
    const entry = dayMap.get(date)!;
    entry.orders.push(o);
    if (o.status !== 'CANCELLED') entry.revenue += Number(o.totalAmount ?? 0);
  }

  const paymentByOrder = new Map<string, Payment>();
  for (const p of (payments ?? [])) {
    paymentByOrder.set(p.orderId, p);
  }

  const stats: DailyStat[] = [];
  for (const [date, { orders: dayOrders, revenue }] of dayMap) {
    const nonCancelled = dayOrders.filter(o => o.status !== 'CANCELLED');
    const byType = { DINE_IN: 0, TAKEAWAY: 0, DELIVERY: 0 };
    const byStatus: Record<string, number> = {};
    const byPaymentMethod = { CASH: 0, CARD: 0, UPI: 0 };
    const itemCounts = new Map<string, number>();

    for (const o of dayOrders) {
      if (o.type in byType) byType[o.type as keyof typeof byType]++;
      byStatus[o.status] = (byStatus[o.status] ?? 0) + 1;

      for (const item of o.items ?? []) {
        itemCounts.set(item.menuItemName, (itemCounts.get(item.menuItemName) ?? 0) + Number(item.quantity ?? 1));
      }

      const payment = paymentByOrder.get(o.id);
      if (payment && payment.method in byPaymentMethod) {
        byPaymentMethod[payment.method as keyof typeof byPaymentMethod]++;
      }
    }

    const topItems = [...itemCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    stats.push({
      date,
      orders: dayOrders.length,
      revenue,
      avgOrderValue: nonCancelled.length > 0 ? revenue / nonCancelled.length : 0,
      topItems,
      byType,
      byStatus,
      byPaymentMethod,
    });
  }

  return stats.sort((a, b) => b.date.localeCompare(a.date));
}

// ── Summary stats for a range ──────────────────────────────────────────────
export interface SummaryStats {
  totalOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  completedOrders: number;
  cancelledOrders: number;
  topItems: { name: string; qty: number }[];
  ordersByType: { DINE_IN: number; TAKEAWAY: number; DELIVERY: number };
  paymentBreakdown: { CASH: number; CARD: number; UPI: number };
  dailyStats: DailyStat[];
  hourlyStats: HourlyStat[];
}

export function computeSummary(
  orders: Order[] = [],
  payments: Payment[] = [],
  from?: Date,
  to?: Date
): SummaryStats {
  const safeOrders = orders ?? [];
  const safePayments = payments ?? [];
  const dailyStats = computeDailyStats(safeOrders, safePayments, from, to);
  const hourlyStats = computeHourlyStats(safeOrders);
  const nonCancelled = safeOrders.filter(o => o.status !== 'CANCELLED');
  const totalRevenue = nonCancelled.reduce((s, o) => s + Number(o.totalAmount ?? 0), 0);

  const ordersByType = { DINE_IN: 0, TAKEAWAY: 0, DELIVERY: 0 };
  const paymentBreakdown = { CASH: 0, CARD: 0, UPI: 0 };
  const itemCounts = new Map<string, number>();

  for (const o of safeOrders) {
    if (o.type in ordersByType) ordersByType[o.type as keyof typeof ordersByType]++;
    for (const item of o.items ?? []) {
      itemCounts.set(item.menuItemName, (itemCounts.get(item.menuItemName) ?? 0) + Number(item.quantity ?? 1));
    }
  }

  for (const p of safePayments) {
    if (p.method in paymentBreakdown) {
      paymentBreakdown[p.method as keyof typeof paymentBreakdown]++;
    }
  }

  const topItems = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, qty]) => ({ name, qty }));

  return {
    totalOrders: safeOrders.length,
    totalRevenue: Number(totalRevenue) || 0,
    avgOrderValue: nonCancelled.length > 0 ? (Number(totalRevenue) || 0) / nonCancelled.length : 0,
    completedOrders: safeOrders.filter(o => o.status === 'COMPLETED').length,
    cancelledOrders: safeOrders.filter(o => o.status === 'CANCELLED').length,
    topItems,
    ordersByType,
    paymentBreakdown,
    dailyStats,
    hourlyStats,
  };
}
