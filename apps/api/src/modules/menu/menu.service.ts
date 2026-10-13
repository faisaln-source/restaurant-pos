import prisma from '../../lib/prisma';
import { notFoundError, badRequest } from '../../lib/errors';
import type { CreateCategoryInput, UpdateCategoryInput, CreateMenuItemInput, UpdateMenuItemInput } from './menu.schema';

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
  return category;
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

  return prisma.menuItem.findMany({
    where,
    orderBy: { displayOrder: 'asc' },
    include: { category: { select: { id: true, name: true, icon: true } } },
  });
}

export async function getMenuItemById(id: string) {
  const item = await prisma.menuItem.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true, icon: true } } },
  });
  if (!item) throw notFoundError('Menu item not found');
  return item;
}

export async function createMenuItem(input: CreateMenuItemInput) {
  // Verify category exists
  await _ensureCategoryExists(input.categoryId);
  return prisma.menuItem.create({
    data: input,
    include: { category: { select: { id: true, name: true, icon: true } } },
  });
}

export async function updateMenuItem(id: string, input: UpdateMenuItemInput) {
  await _ensureMenuItemExists(id);
  if (input.categoryId) {
    await _ensureCategoryExists(input.categoryId);
  }
  return prisma.menuItem.update({
    where: { id },
    data: input,
    include: { category: { select: { id: true, name: true, icon: true } } },
  });
}

export async function deleteMenuItem(id: string) {
  await _ensureMenuItemExists(id);
  return prisma.menuItem.delete({ where: { id } });
}

export async function toggleAvailability(id: string, isAvailable: boolean) {
  await _ensureMenuItemExists(id);
  return prisma.menuItem.update({
    where: { id },
    data: { isAvailable },
  });
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
