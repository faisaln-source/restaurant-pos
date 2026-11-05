import prisma from '../../lib/prisma';
import { notFoundError, badRequest, conflict } from '../../lib/errors';
import type { ProcessPaymentInput } from './payment.schema';

// ── Process payment ────────────────────────────────────────────────────────

export async function processPayment(input: ProcessPaymentInput) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payment: true },
  });

  if (!order) throw notFoundError('Order not found');
  if (order.payment) throw conflict('Order already has a payment');
  if (['CANCELLED', 'VOIDED'].includes(order.status)) {
    throw badRequest('Cannot process payment for a cancelled/voided order');
  }

  const payment = await prisma.payment.create({
    data: {
      orderId: input.orderId,
      method: input.method,
      amount: input.amount,
      tip: input.tip,
      status: 'COMPLETED',
      reference: input.reference ?? null,
    },
    include: {
      order: {
        select: {
          id: true,
          tableId: true,
          orderNumber: true,
        },
      },
    },
  });

  // Mark order as completed
  await prisma.order.update({
    where: { id: input.orderId },
    data: { status: 'COMPLETED' },
  });

  // Free the table only if NO other active orders remain on this table
  let tableFreed = false;
  if (order.tableId) {
    const otherActive = await prisma.order.count({
      where: {
        tableId: order.tableId,
        id: { not: order.id },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] },
      },
    });

    if (otherActive === 0) {
      await prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      });
      tableFreed = true;
    }
  }

  return { payment, tableFreed, tableId: order.tableId };
}

// ── Get payment by ID ──────────────────────────────────────────────────────

export async function getPaymentById(id: string) {
  const payment = await prisma.payment.findUnique({
    where: { id },
    include: { order: { select: { id: true, orderNumber: true, totalAmount: true } } },
  });
  if (!payment) throw notFoundError('Payment not found');
  return payment;
}

// ── Get payment by order ID ────────────────────────────────────────────────

export async function getPaymentByOrderId(orderId: string) {
  const payment = await prisma.payment.findUnique({
    where: { orderId },
    include: { order: { select: { id: true, orderNumber: true, totalAmount: true } } },
  });
  if (!payment) throw notFoundError('No payment found for this order');
  return payment;
}

// ── List payments ──────────────────────────────────────────────────────────

export async function listPayments(filters?: {
  from?: Date;
  to?: Date;
  method?: string;
  status?: string;
}) {
  const where: Record<string, unknown> = {};

  if (filters?.method) where.method = filters.method;
  if (filters?.status) where.status = filters.status;
  if (filters?.from || filters?.to) {
    where.createdAt = {
      ...(filters?.from && { gte: filters.from }),
      ...(filters?.to && { lte: filters.to }),
    };
  }

  return prisma.payment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { order: { select: { id: true, orderNumber: true, type: true } } },
  });
}

// ── Refund payment ─────────────────────────────────────────────────────────

export async function refundPayment(id: string) {
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw notFoundError('Payment not found');
  if (payment.status === 'REFUNDED') throw conflict('Payment already refunded');

  return prisma.payment.update({
    where: { id },
    data: { status: 'REFUNDED' },
  });
}

// ── Today's payments ───────────────────────────────────────────────────────

export async function getTodayPayments() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return listPayments({ from: today });
}

// ── Settle a subset of seats (partial billing) ──────────────────────────────
/**
 * Marks the order items belonging to `seatNumbers` as paid (isPaid=true).
 * Creates a Payment record for the partial amount.
 * If ALL non-cancelled items in the order are now paid, completes the order
 * and frees the table.
 * Returns { payment, allPaid } where allPaid signals the order is fully settled.
 */
export async function settleSeats(input: {
  orderId: string;
  seatNumbers: number[];
  method: 'CASH' | 'CARD' | 'UPI' | 'WALLET' | 'SPLIT';
  amount: number;
  tip?: number;
  reference?: string | null;
}) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: true,
      table: { select: { id: true } },
    },
  });
  if (!order) throw notFoundError('Order not found');
  if (['CANCELLED', 'VOIDED'].includes(order.status)) {
    throw badRequest('Cannot settle a cancelled/voided order');
  }

  const now = new Date();

  // Mark target seat items as paid
  await prisma.orderItem.updateMany({
    where: {
      orderId: input.orderId,
      seatNumber: { in: input.seatNumbers },
      isPaid: false,
    },
    data: { isPaid: true, paidAt: now },
  });

  // Create a partial payment record (one payment per seat settlement)
  const payment = await prisma.payment.create({
    data: {
      orderId: input.orderId,
      method: input.method,
      amount: input.amount,
      tip: input.tip ?? 0,
      status: 'COMPLETED',
      reference: input.reference ?? `seats:${input.seatNumbers.join(',')}`,
    },
  });

  // Check if ALL non-cancelled items are now paid
  const unpaidItems = await prisma.orderItem.count({
    where: {
      orderId: input.orderId,
      status: { not: 'CANCELLED' },
      isPaid: false,
    },
  });

  const allPaid = unpaidItems === 0;

  if (allPaid) {
    // Complete this order
    await prisma.order.update({
      where: { id: input.orderId },
      data: { status: 'COMPLETED' },
    });
    // Free the table only if no other active orders remain for this table
    let tableFreed = false;
    if (order.tableId) {
      const otherActive = await prisma.order.count({
        where: {
          tableId: order.tableId,
          id: { not: input.orderId },
          status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] },
        },
      });
      if (otherActive === 0) {
        await prisma.table.update({
          where: { id: order.tableId },
          data: { status: 'AVAILABLE' },
        });
        tableFreed = true;
      }
    }
    return { payment, allPaid, tableFreed, tableId: order.tableId };
  }

  return { payment, allPaid, tableFreed: false, tableId: order.tableId };
}
