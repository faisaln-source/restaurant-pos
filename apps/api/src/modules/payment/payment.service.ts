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

  // Free the table if dine-in
  if (order.tableId) {
    await prisma.order.updateMany({
      where: {
        tableId: order.tableId,
        id: { not: order.id },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] },
      },
      data: { status: 'COMPLETED' },
    });

    await prisma.table.update({
      where: { id: order.tableId },
      data: { status: 'AVAILABLE' },
    });
  }

  return payment;
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
