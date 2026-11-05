import prisma from '../../lib/prisma';
import { notFoundError, badRequest } from '../../lib/errors';
import type { CreateKitchenStationInput, UpdateKitchenStationInput } from './kitchen-station.schema';

export async function listKitchenStations() {
  return prisma.kitchenStation.findMany({
    orderBy: { displayOrder: 'asc' },
    include: { _count: { select: { menuItems: true } } },
  });
}

export async function getKitchenStationById(id: string) {
  const station = await prisma.kitchenStation.findUnique({
    where: { id },
    include: {
      menuItems: {
        orderBy: { displayOrder: 'asc' },
        include: { category: { select: { id: true, name: true } } },
      },
    },
  });
  if (!station) throw notFoundError('Kitchen station not found');
  return station;
}

export async function createKitchenStation(input: CreateKitchenStationInput) {
  return prisma.kitchenStation.create({ data: input });
}

export async function updateKitchenStation(id: string, input: UpdateKitchenStationInput) {
  const existing = await prisma.kitchenStation.findUnique({ where: { id } });
  if (!existing) throw notFoundError('Kitchen station not found');
  return prisma.kitchenStation.update({ where: { id }, data: input });
}

export async function deleteKitchenStation(id: string) {
  const existing = await prisma.kitchenStation.findUnique({ where: { id } });
  if (!existing) throw notFoundError('Kitchen station not found');

  // Unassign items from this station before deleting
  await prisma.menuItem.updateMany({
    where: { kitchenStationId: id },
    data: { kitchenStationId: null },
  });

  return prisma.kitchenStation.delete({ where: { id } });
}

/**
 * Returns orders that contain at least one item belonging to a given kitchen station.
 * Each order's items are filtered to only those belonging to this station.
 */
export async function getOrdersForStation(stationId: string, activeOnly = true) {
  // Get menu item IDs for this station
  const stationItems = await prisma.menuItem.findMany({
    where: { kitchenStationId: stationId },
    select: { id: true },
  });
  const stationItemIds = stationItems.map(i => i.id);
  if (stationItemIds.length === 0) return [];

  const statusFilter = activeOnly
    ? { status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] as any } }
    : {};

  const orders = await prisma.order.findMany({
    where: {
      ...statusFilter,
      items: {
        some: {
          menuItemId: { in: stationItemIds },
          status: { not: 'CANCELLED' },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      table: { select: { id: true, name: true } },
      user: { select: { id: true, name: true } },
      items: {
        where: { menuItemId: { in: stationItemIds }, status: { not: 'CANCELLED' } },
        include: {
          menuItem: {
            select: { id: true, name: true, isVeg: true, kitchenStationId: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return orders;
}
