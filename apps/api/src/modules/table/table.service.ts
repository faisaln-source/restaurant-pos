import prisma from '../../lib/prisma';
import { notFoundError, badRequest } from '../../lib/errors';
import type { CreateTableInput, UpdateTableInput } from './table.schema';
import type { TableStatus } from '@prisma/client';

export async function listTables(floorSection?: string) {
  const where = floorSection ? { floorSection } : {};
  return prisma.table.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      orders: {
        where: { status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] } },
        select: { id: true, orderNumber: true, status: true, totalAmount: true },
      },
    },
  });
}

export async function getTableById(id: string) {
  const table = await prisma.table.findUnique({
    where: { id },
    include: {
      orders: {
        where: { status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] } },
        include: { items: { include: { menuItem: { select: { name: true } } } } },
      },
      reservations: {
        where: { status: 'CONFIRMED', reservedAt: { gte: new Date() } },
        orderBy: { reservedAt: 'asc' },
        take: 5,
      },
    },
  });
  if (!table) throw notFoundError('Table not found');
  return table;
}

export async function createTable(input: CreateTableInput) {
  return prisma.table.create({ data: input });
}

export async function updateTable(id: string, input: UpdateTableInput) {
  await _ensureTableExists(id);
  return prisma.table.update({ where: { id }, data: input });
}

export async function updateTableStatus(id: string, status: TableStatus) {
  await _ensureTableExists(id);
  return prisma.table.update({ where: { id }, data: { status } });
}

export async function deleteTable(id: string) {
  const table = await _ensureTableExists(id);
  if (table.status === 'OCCUPIED') {
    throw badRequest('Cannot delete an occupied table. Complete or void active orders first.');
  }
  // Check for active orders
  const activeOrders = await prisma.order.count({
    where: { tableId: id, status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] } },
  });
  if (activeOrders > 0) {
    throw badRequest(`Table has ${activeOrders} active order(s). Complete or void them first.`);
  }
  return prisma.table.delete({ where: { id } });
}

export async function getFloorSections() {
  const sections = await prisma.table.findMany({
    select: { floorSection: true },
    distinct: ['floorSection'],
    orderBy: { floorSection: 'asc' },
  });
  return sections.map(s => s.floorSection).filter(Boolean);
}

// ── Private helpers ────────────────────────────────────────────────────────

async function _ensureTableExists(id: string) {
  const table = await prisma.table.findUnique({ where: { id } });
  if (!table) throw notFoundError('Table not found');
  return table;
}
