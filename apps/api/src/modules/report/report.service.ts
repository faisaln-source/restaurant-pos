import prisma from '../../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

// ── Dashboard summary (today) ──────────────────────────────────────────────

export async function getDashboardStats() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [orders, payments, activeOrders, occupiedTables] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: today } },
      select: { id: true, status: true, type: true, totalAmount: true },
    }),
    prisma.payment.findMany({
      where: { createdAt: { gte: today }, status: 'COMPLETED' },
      select: { amount: true, tip: true, method: true },
    }),
    prisma.order.count({
      where: { status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] } },
    }),
    prisma.table.count({ where: { status: 'OCCUPIED' } }),
  ]);

  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status === 'COMPLETED').length;
  const cancelledOrders = orders.filter(o => o.status === 'CANCELLED' || o.status === 'VOIDED').length;
  const nonCancelled = orders.filter(o => !['CANCELLED', 'VOIDED'].includes(o.status));

  const totalRevenue = payments.reduce(
    (sum, p) => sum.add(p.amount),
    new Decimal(0)
  );
  const totalTips = payments.reduce(
    (sum, p) => sum.add(p.tip),
    new Decimal(0)
  );
  const avgOrderValue = nonCancelled.length > 0
    ? totalRevenue.div(nonCancelled.length)
    : new Decimal(0);

  // Orders by type
  const ordersByType = { DINE_IN: 0, TAKEAWAY: 0, DELIVERY: 0 };
  for (const o of orders) {
    if (o.type in ordersByType) ordersByType[o.type as keyof typeof ordersByType]++;
  }

  // Payments by method
  const paymentsByMethod = { CASH: 0, CARD: 0, UPI: 0, WALLET: 0, SPLIT: 0 };
  for (const p of payments) {
    if (p.method in paymentsByMethod) paymentsByMethod[p.method as keyof typeof paymentsByMethod]++;
  }

  return {
    totalOrders,
    completedOrders,
    cancelledOrders,
    activeOrders,
    occupiedTables,
    totalRevenue,
    totalTips,
    avgOrderValue,
    ordersByType,
    paymentsByMethod,
  };
}

// ── Range-based revenue report ─────────────────────────────────────────────

export async function getRevenueReport(from: Date, to: Date) {
  const orders = await prisma.order.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: { not: 'VOIDED' },
    },
    select: {
      id: true,
      status: true,
      type: true,
      totalAmount: true,
      subtotal: true,
      taxAmount: true,
      discountAmount: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const payments = await prisma.payment.findMany({
    where: {
      createdAt: { gte: from, lte: to },
      status: 'COMPLETED',
    },
    select: { amount: true, tip: true, method: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Build daily breakdown
  const dailyMap = new Map<string, {
    orders: number;
    completed: number;
    cancelled: number;
    revenue: Decimal;
    tax: Decimal;
  }>();

  for (const o of orders) {
    const date = o.createdAt.toISOString().split('T')[0];
    if (!dailyMap.has(date)) {
      dailyMap.set(date, {
        orders: 0, completed: 0, cancelled: 0,
        revenue: new Decimal(0), tax: new Decimal(0),
      });
    }
    const day = dailyMap.get(date)!;
    day.orders++;
    if (o.status === 'COMPLETED') {
      day.completed++;
      day.revenue = day.revenue.add(o.totalAmount);
      day.tax = day.tax.add(o.taxAmount);
    }
    if (o.status === 'CANCELLED') day.cancelled++;
  }

  const dailyStats = [...dailyMap.entries()].map(([date, stats]) => ({
    date,
    ...stats,
    revenue: stats.revenue,
    tax: stats.tax,
  }));

  // Summary
  const completedOrders = orders.filter(o => o.status === 'COMPLETED');
  const totalRevenue = completedOrders.reduce(
    (s, o) => s.add(o.totalAmount), new Decimal(0)
  );
  const totalTax = completedOrders.reduce(
    (s, o) => s.add(o.taxAmount), new Decimal(0)
  );
  const totalTips = payments.reduce(
    (s, p) => s.add(p.tip), new Decimal(0)
  );

  return {
    period: { from, to },
    summary: {
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      cancelledOrders: orders.filter(o => o.status === 'CANCELLED').length,
      totalRevenue,
      totalTax,
      totalTips,
      avgOrderValue: completedOrders.length > 0
        ? totalRevenue.div(completedOrders.length)
        : new Decimal(0),
    },
    dailyStats,
  };
}

// ── Top selling items ──────────────────────────────────────────────────────

export async function getTopSellingItems(from: Date, to: Date, limit = 10) {
  const items = await prisma.orderItem.groupBy({
    by: ['menuItemId'],
    where: {
      order: {
        createdAt: { gte: from, lte: to },
        status: { not: 'VOIDED' },
      },
      status: { not: 'CANCELLED' },
    },
    _sum: { quantity: true, totalPrice: true },
    _count: true,
    orderBy: { _sum: { quantity: 'desc' } },
    take: limit,
  });

  // Fetch item names
  const menuItemIds = items.map(i => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
    select: { id: true, name: true, price: true, categoryId: true },
    // also get category
  });
  const nameMap = new Map(menuItems.map(mi => [mi.id, mi]));

  return items.map(i => ({
    menuItemId: i.menuItemId,
    name: nameMap.get(i.menuItemId)?.name ?? 'Unknown',
    price: nameMap.get(i.menuItemId)?.price,
    totalQuantity: i._sum.quantity ?? 0,
    totalRevenue: i._sum.totalPrice,
    orderCount: i._count,
  }));
}

// ── Staff performance report ───────────────────────────────────────────────

export async function getStaffReport(from: Date, to: Date) {
  const staffOrders = await prisma.order.groupBy({
    by: ['userId'],
    where: {
      createdAt: { gte: from, lte: to },
      status: { not: 'VOIDED' },
    },
    _count: true,
    _sum: { totalAmount: true },
  });

  const userIds = staffOrders.map(s => s.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, name: true, role: true },
  });
  const userMap = new Map(users.map(u => [u.id, u]));

  // Shifts
  const shifts = await prisma.shift.findMany({
    where: { date: { gte: from, lte: to } },
    select: { userId: true, clockIn: true, clockOut: true },
  });

  const shiftsByUser = new Map<string, { totalShifts: number; totalHours: number }>();
  for (const s of shifts) {
    if (!shiftsByUser.has(s.userId)) {
      shiftsByUser.set(s.userId, { totalShifts: 0, totalHours: 0 });
    }
    const entry = shiftsByUser.get(s.userId)!;
    entry.totalShifts++;
    if (s.clockOut) {
      entry.totalHours += (s.clockOut.getTime() - s.clockIn.getTime()) / (1000 * 60 * 60);
    }
  }

  return staffOrders.map(s => ({
    userId: s.userId,
    name: userMap.get(s.userId)?.name ?? 'Unknown',
    role: userMap.get(s.userId)?.role ?? 'Unknown',
    totalOrders: s._count,
    totalRevenue: s._sum.totalAmount,
    shifts: shiftsByUser.get(s.userId) ?? { totalShifts: 0, totalHours: 0 },
  }));
}
