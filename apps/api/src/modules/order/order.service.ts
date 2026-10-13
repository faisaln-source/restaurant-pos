import prisma from '../../lib/prisma';
import { notFoundError, badRequest } from '../../lib/errors';
import type { CreateOrderInput, OrderItemInput } from './order.schema';
import type { OrderStatus, OrderItemStatus } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

// Tax rate — in production this would come from settings
const TAX_RATE = 0.05; // 5%

// ── Order number counter ───────────────────────────────────────────────────

/**
 * Returns the next order number inside a Prisma transaction.
 * Running inside the same tx as the INSERT means no other concurrent
 * transaction can claim the same number before this one commits.
 * Any collision on the unique index produces a retryable P2002 error.
 */
async function getNextOrderNumber(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]
): Promise<number> {
  const lastOrder = await tx.order.findFirst({
    orderBy: { orderNumber: 'desc' },
    select: { orderNumber: true },
  });
  return (lastOrder?.orderNumber ?? 1000) + 1;
}

// ── Consolidate table orders into one single bill ─────────────────────────

export async function consolidateTableOrders(tableId?: string) {
  try {
    if (tableId) {
      const activeOrders = await prisma.order.findMany({
        where: {
          tableId,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] },
        },
        orderBy: { createdAt: 'asc' },
      });

      if (activeOrders.length > 1) {
        const primaryOrder = activeOrders[0];
        const secondaryOrders = activeOrders.slice(1);

        for (const sec of secondaryOrders) {
          await prisma.orderItem.updateMany({
            where: { orderId: sec.id },
            data: { orderId: primaryOrder.id },
          });
          await prisma.order.delete({ where: { id: sec.id } });
        }

        return await _recalculateOrderTotals(primaryOrder.id);
      }
      return activeOrders[0] ?? null;
    } else {
      const occupiedTables = await prisma.table.findMany({
        where: { status: 'OCCUPIED' },
        select: { id: true },
      });
      for (const t of occupiedTables) {
        await consolidateTableOrders(t.id);
      }
    }
  } catch (err) {
    console.error('Error consolidating table orders:', err);
  }
}

// ── List orders ────────────────────────────────────────────────────────────

export async function listOrders(filters?: {
  status?: OrderStatus;
  type?: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  tableId?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  activeOnly?: boolean;
}) {
  if (filters?.tableId) {
    await consolidateTableOrders(filters.tableId);
  } else if (filters?.activeOnly) {
    await consolidateTableOrders();
  }

  const where: Record<string, unknown> = {};

  if (filters?.status) where.status = filters.status;
  if (filters?.type) where.type = filters.type;
  if (filters?.tableId) where.tableId = filters.tableId;
  if (filters?.userId) where.userId = filters.userId;
  if (filters?.activeOnly) {
    where.status = { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] };
  }
  if (filters?.from || filters?.to) {
    where.createdAt = {
      ...(filters?.from && { gte: filters.from }),
      ...(filters?.to && { lte: filters.to }),
    };
  }

  return prisma.order.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      table: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      items: {
        include: { menuItem: { select: { id: true, name: true, isVeg: true } } },
      },
      payment: true,
    },
  });
}

// ── Get today's orders ─────────────────────────────────────────────────────

export async function getTodayOrders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return listOrders({ from: today });
}

// ── Get single order ───────────────────────────────────────────────────────

export async function getOrderById(id: string) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      table: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      items: {
        include: { menuItem: { select: { id: true, name: true, isVeg: true, price: true } } },
        orderBy: { createdAt: 'asc' },
      },
      payment: true,
    },
  });
  if (!order) throw notFoundError('Order not found');
  return order;
}

// ── Create order ───────────────────────────────────────────────────────────

export async function createOrder(input: CreateOrderInput, userId: string) {
  // Validate table for dine-in
  if (input.type === 'DINE_IN' && !input.tableId) {
    throw badRequest('Table is required for dine-in orders');
  }

  // If dine-in and table already has an active order, append to existing order so it generates as ONE SINGLE BILL
  if (input.type === 'DINE_IN' && input.tableId) {
    const existingOrder = await prisma.order.findFirst({
      where: {
        tableId: input.tableId,
        status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (existingOrder) {
      if (input.customerName && !existingOrder.customerName) {
        await prisma.order.update({
          where: { id: existingOrder.id },
          data: { customerName: input.customerName },
        });
      }
      return addItemsToOrder(existingOrder.id, input.items);
    }
  }

  // Lookup menu items and calculate prices
  const menuItemIds = input.items.map(i => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
  });

  if (menuItems.length !== menuItemIds.length) {
    throw badRequest('One or more menu items not found');
  }

  const unavailable = menuItems.filter(mi => !mi.isAvailable);
  if (unavailable.length > 0) {
    throw badRequest(`Unavailable items: ${unavailable.map(i => i.name).join(', ')}`);
  }

  const menuItemMap = new Map(menuItems.map(mi => [mi.id, mi]));

  // Build order items with calculated prices
  const orderItems = input.items.map(item => {
    const mi = menuItemMap.get(item.menuItemId)!;
    const unitPrice = mi.price;
    const totalPrice = mi.price.mul(item.quantity);
    return {
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPrice,
      totalPrice,
      note: item.note ?? null,
    };
  });

  const subtotal = orderItems.reduce(
    (sum, item) => sum.add(item.totalPrice),
    new Decimal(0)
  );
  const taxAmount = subtotal.mul(TAX_RATE);
  const totalAmount = subtotal.add(taxAmount);

  // Wrap the order number fetch + INSERT in a transaction so the number
  // is reserved atomically. A unique-constraint collision (P2002) surfaces
  // as a retryable 409 rather than silently producing a duplicate number.
  const order = await prisma.$transaction(async (tx) => {
    const orderNumber = await getNextOrderNumber(tx);

    return tx.order.create({
      data: {
        orderNumber,
        tableId: input.tableId ?? null,
        userId,
        type: input.type,
        status: 'PENDING',
        customerName: input.customerName ?? null,
        note: input.note ?? null,
        subtotal,
        taxAmount,
        totalAmount,
        items: { create: orderItems },
      },
      include: {
        table: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        items: {
          include: { menuItem: { select: { id: true, name: true, isVeg: true } } },
        },
      },
    });
  });

  // Mark table as occupied for dine-in
  if (input.tableId) {
    await prisma.table.update({
      where: { id: input.tableId },
      data: { status: 'OCCUPIED' },
    });
  }

  return order;
}

// ── Add items to existing order ────────────────────────────────────────────

export async function addItemsToOrder(orderId: string, items: OrderItemInput[]) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFoundError('Order not found');

  if (['COMPLETED', 'CANCELLED', 'VOIDED'].includes(order.status)) {
    throw badRequest('Cannot add items to a completed/cancelled order');
  }

  const menuItemIds = items.map(i => i.menuItemId);
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: menuItemIds } },
  });
  const menuItemMap = new Map(menuItems.map(mi => [mi.id, mi]));

  const newItems = items.map(item => {
    const mi = menuItemMap.get(item.menuItemId);
    if (!mi) throw badRequest(`Menu item ${item.menuItemId} not found`);
    return {
      orderId,
      menuItemId: item.menuItemId,
      quantity: item.quantity,
      unitPrice: mi.price,
      totalPrice: mi.price.mul(item.quantity),
      note: item.note ?? null,
    };
  });

  await prisma.orderItem.createMany({ data: newItems });

  // If order was already READY or SERVED, revert back to PREPARING because new items need cooking
  if (['READY', 'SERVED'].includes(order.status)) {
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'PREPARING' },
    });
  }

  // Recalculate totals
  return _recalculateOrderTotals(orderId);
}

// ── Update order status ────────────────────────────────────────────────────

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) throw notFoundError('Order not found');

  // When order is marked SERVED or COMPLETED, promote all active items to SERVED as well
  if (status === 'SERVED' || status === 'COMPLETED') {
    await prisma.orderItem.updateMany({
      where: {
        orderId,
        status: { not: 'CANCELLED' },
      },
      data: { status: 'SERVED' },
    });
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status },
    include: {
      table: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      items: {
        include: { menuItem: { select: { id: true, name: true, isVeg: true } } },
      },
    },
  });

  // Free table when order is completed/cancelled/voided
  if (order.tableId && ['COMPLETED', 'CANCELLED', 'VOIDED'].includes(status)) {
    // Check if table has any other active orders
    const otherActive = await prisma.order.count({
      where: {
        tableId: order.tableId,
        id: { not: orderId },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] },
      },
    });
    if (otherActive === 0) {
      await prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      });
    }
  }

  return updated;
}

// ── Update individual item status (for KDS) ────────────────────────────────

export async function updateOrderItemStatus(
  orderId: string,
  itemId: string,
  status: OrderItemStatus
) {
  // Verify item belongs to order
  const item = await prisma.orderItem.findFirst({
    where: { id: itemId, orderId },
  });
  if (!item) throw notFoundError('Order item not found');

  const updatedItem = await prisma.orderItem.update({
    where: { id: itemId },
    data: { status },
    include: { menuItem: { select: { id: true, name: true, isVeg: true } } },
  });

  // ── Auto-promote order status based on item statuses ──────────────────
  // Fetch all sibling items (excluding cancelled) after the update
  const siblings = await prisma.orderItem.findMany({
    where: { orderId, status: { not: 'CANCELLED' } },
    select: { status: true },
  });

  if (siblings.length > 0) {
    const statuses = siblings.map(s => s.status);
    let nextOrderStatus: string | null = null;

    if (statuses.every(s => s === 'SERVED')) {
      nextOrderStatus = 'SERVED';
    } else if (statuses.every(s => s === 'READY' || s === 'SERVED')) {
      nextOrderStatus = 'READY';
    } else if (statuses.some(s => s === 'PREPARING' || s === 'READY')) {
      nextOrderStatus = 'PREPARING';
    }

    if (nextOrderStatus) {
      await prisma.order.update({
        where: { id: orderId },
        data: { status: nextOrderStatus as any },
      });
    }
  }

  return updatedItem;
}

// ── Void / Cancel order ────────────────────────────────────────────────────

export async function voidOrder(orderId: string) {
  return updateOrderStatus(orderId, 'VOIDED');
}

// ── Recalculate totals ─────────────────────────────────────────────────────

async function _recalculateOrderTotals(orderId: string) {
  const items = await prisma.orderItem.findMany({
    where: { orderId, status: { not: 'CANCELLED' } },
  });

  const subtotal = items.reduce(
    (sum, item) => sum.add(item.totalPrice),
    new Decimal(0)
  );
  const taxAmount = subtotal.mul(TAX_RATE);
  const totalAmount = subtotal.add(taxAmount);

  return prisma.order.update({
    where: { id: orderId },
    data: { subtotal, taxAmount, totalAmount },
    include: {
      table: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      items: {
        include: { menuItem: { select: { id: true, name: true, isVeg: true } } },
      },
    },
  });
}
