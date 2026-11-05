import prisma from '../../lib/prisma';
import { notFoundError, badRequest } from '../../lib/errors';
import type {
  CreateCategoryInput, UpdateCategoryInput,
  CreateMenuItemInput, UpdateMenuItemInput,
  BulkUpdateDailyPricesInput,
} from './menu.schema';
import {
  calculateEffectiveItemPrice,
  getCurrentDayName,
  getTodayDateString,
} from './pricing.utils';

function enrichItemWithPricing<T extends {
  price: any;
  isVariablePrice?: boolean | null;
  dailyPrice?: any;
  dayPrices?: any;
  dailyPriceDate?: string | null;
}>(item: T) {
  const effectivePriceDecimal = calculateEffectiveItemPrice(item);
  const currentDay = getCurrentDayName();
  let todayDefaultPrice: number | null = null;

  if (item.dayPrices && typeof item.dayPrices === 'object') {
    const p = (item.dayPrices as Record<string, any>)[currentDay];
    if (p !== undefined && p !== null && !isNaN(Number(p))) {
      todayDefaultPrice = Number(p);
    }
  }

  return {
    ...item,
    effectivePrice: effectivePriceDecimal.toNumber(),
    todayDefaultPrice: todayDefaultPrice ?? Number(item.price),
    currentDay,
    isOverriddenToday: item.dailyPriceDate === getTodayDateString() && item.dailyPrice != null,
  };
}

// ── Categories ─────────────────────────────────────────────────────────────

export async function listCategories() {
  return prisma.category.findMany({
    orderBy: { displayOrder: 'asc' },
    include: { _count: { select: { items: true } } },
  });
}

export async function getCategoryById(id: string) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { items: { orderBy: { displayOrder: 'asc' } } },
  });
  if (!category) throw notFoundError('Category not found');
  return {
    ...category,
    items: category.items.map(enrichItemWithPricing),
  };
}

export async function createCategory(input: CreateCategoryInput) {
  return prisma.category.create({ data: input });
}

export async function updateCategory(id: string, input: UpdateCategoryInput) {
  await _ensureCategoryExists(id);
  return prisma.category.update({ where: { id }, data: input });
}

export async function deleteCategory(id: string) {
  await _ensureCategoryExists(id);
  // Check if there are menu items attached
  const count = await prisma.menuItem.count({ where: { categoryId: id } });
  if (count > 0) {
    throw badRequest(`Cannot delete category — ${count} menu item(s) still belong to it. Reassign or delete them first.`);
  }
  return prisma.category.delete({ where: { id } });
}

// ── Menu Items ─────────────────────────────────────────────────────────────

export async function listMenuItems(filters?: {
  categoryId?: string;
  isAvailable?: boolean;
  isVeg?: boolean;
  search?: string;
}) {
  const where: Record<string, unknown> = {};
  if (filters?.categoryId) where.categoryId = filters.categoryId;
  if (filters?.isAvailable !== undefined) where.isAvailable = filters.isAvailable;
  if (filters?.isVeg !== undefined) where.isVeg = filters.isVeg;
  if (filters?.search) {
    where.name = { contains: filters.search, mode: 'insensitive' };
  }

  const items = await prisma.menuItem.findMany({
    where,
    orderBy: { displayOrder: 'asc' },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      kitchenStation: { select: { id: true, name: true, color: true } },
    },
  });

  return items.map(enrichItemWithPricing);
}

export async function getMenuItemById(id: string) {
  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: {
      category: { select: { id: true, name: true, icon: true } },
      kitchenStation: { select: { id: true, name: true, color: true } },
    },
  });
  if (!item) throw notFoundError('Menu item not found');
  return enrichItemWithPricing(item);
}

export async function createMenuItem(input: CreateMenuItemInput) {
  // Verify category exists
  await _ensureCategoryExists(input.categoryId);
  const created = await prisma.menuItem.create({
    data: input as any,
    include: {
      category: { select: { id: true, name: true, icon: true } },
      kitchenStation: { select: { id: true, name: true, color: true } },
    },
  });
  return enrichItemWithPricing(created);
}

export async function updateMenuItem(id: string, input: UpdateMenuItemInput) {
  await _ensureMenuItemExists(id);
  if (input.categoryId) {
    await _ensureCategoryExists(input.categoryId);
  }
  const updated = await prisma.menuItem.update({
    where: { id },
    data: input as any,
    include: {
      category: { select: { id: true, name: true, icon: true } },
      kitchenStation: { select: { id: true, name: true, color: true } },
    },
  });
  return enrichItemWithPricing(updated);
}

export async function deleteMenuItem(id: string) {
  await _ensureMenuItemExists(id);
  return prisma.menuItem.delete({ where: { id } });
}

export async function toggleAvailability(id: string, isAvailable: boolean) {
  await _ensureMenuItemExists(id);
  const updated = await prisma.menuItem.update({
    where: { id },
    data: { isAvailable },
  });
  return enrichItemWithPricing(updated);
}

// ── Daily Price Board ──────────────────────────────────────────────────────

export async function getDailyPriceBoard() {
  const items = await prisma.menuItem.findMany({
    where: { isVariablePrice: true },
    orderBy: { displayOrder: 'asc' },
    include: { category: { select: { id: true, name: true, icon: true } } },
  });

  return {
    date: getTodayDateString(),
    dayName: getCurrentDayName(),
    items: items.map(enrichItemWithPricing),
  };
}

export async function bulkUpdateDailyPrices(input: BulkUpdateDailyPricesInput) {
  const todayStr = getTodayDateString();

  const updates = await prisma.$transaction(
    input.updates.map((u) =>
      prisma.menuItem.update({
        where: { id: u.id },
        data: {
          dailyPrice: u.dailyPrice,
          dailyPriceDate: todayStr,
        },
        include: { category: { select: { id: true, name: true, icon: true } } },
      })
    )
  );

  return updates.map(enrichItemWithPricing);
}


// ── Private helpers ────────────────────────────────────────────────────────

async function _ensureCategoryExists(id: string) {
  const cat = await prisma.category.findUnique({ where: { id } });
  if (!cat) throw notFoundError('Category not found');
  return cat;
}

async function _ensureMenuItemExists(id: string) {
  const item = await prisma.menuItem.findUnique({ where: { id } });
  if (!item) throw notFoundError('Menu item not found');
  return item;
}

// ── Bulk CSV import ────────────────────────────────────────────────────────
/**
 * Upserts categories by name, then creates menu items.
 * Returns counts of created categories and items.
 */
export async function bulkImportMenu(rows: Array<{
  category: string;
  name: string;
  price: number;
  description?: string;
  isVeg?: boolean;
  preparationTime?: number;
}>) {
  // Collect unique category names (preserving first-seen order)
  const categoryNames = [...new Set(rows.map(r => r.category.trim()).filter(Boolean))];

  // Upsert categories
  const categoryMap = new Map<string, string>(); // name → id
  for (const name of categoryNames) {
    let cat = await prisma.category.findFirst({ where: { name } });
    if (!cat) {
      cat = await prisma.category.create({ data: { name, displayOrder: 0 } });
    }
    categoryMap.set(name, cat.id);
  }

  // Create menu items
  let itemsCreated = 0;
  for (const row of rows) {
    const catName = row.category.trim();
    const categoryId = categoryMap.get(catName);
    if (!categoryId) continue;

    const price = Number(row.price);
    if (!row.name?.trim() || isNaN(price) || price <= 0) continue;

    await prisma.menuItem.create({
      data: {
        categoryId,
        name: row.name.trim(),
        price,
        description: row.description?.trim() || null,
        isVeg: Boolean(row.isVeg),
        preparationTime: Number(row.preparationTime) > 0 ? Number(row.preparationTime) : 10,
        displayOrder: 0,
      },
    });
    itemsCreated++;
  }

  return {
    categoriesCreated: categoryNames.length,
    itemsCreated,
  };
}

// ── Reset / clear all demo menu data ──────────────────────────────────────
/**
 * Deletes all menu items then all categories.
 * Preserves orders, payments, tables, and all other data.
 */
export async function resetMenuData() {
  await prisma.menuItem.deleteMany({});
  await prisma.category.deleteMany({});
}
