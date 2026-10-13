import { z } from 'zod';

// ── Categories ─────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  icon: z.string().max(10).optional(),
  displayOrder: z.number().int().min(0).default(0),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(10).optional().nullable(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

// ── Menu Items ─────────────────────────────────────────────────────────────

export const createMenuItemSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(500).optional(),
  price: z.number().positive('Price must be positive'),
  imageUrl: z.string().optional().nullable(),
  isVeg: z.boolean().default(false),
  preparationTime: z.number().int().min(1).default(10),
  displayOrder: z.number().int().min(0).default(0),
});

export const updateMenuItemSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  price: z.number().positive().optional(),
  imageUrl: z.string().optional().nullable(),
  isAvailable: z.boolean().optional(),
  isVeg: z.boolean().optional(),
  preparationTime: z.number().int().min(1).optional(),
  displayOrder: z.number().int().min(0).optional(),
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
