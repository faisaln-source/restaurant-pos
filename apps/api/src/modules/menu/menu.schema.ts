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
  isVariablePrice: z.boolean().default(false),
  dailyPrice: z.number().positive().optional().nullable(),
  dayPrices: z.record(z.string(), z.number().nonnegative()).optional().nullable(),
  dailyPriceDate: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isVeg: z.boolean().default(false),
  preparationTime: z.number().int().min(1).default(10),
  displayOrder: z.number().int().min(0).default(0),
  kitchenStationId: z.string().optional().nullable(),
});

export const updateMenuItemSchema = z.object({
  categoryId: z.string().min(1).optional(),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional().nullable(),
  price: z.number().positive().optional(),
  isVariablePrice: z.boolean().optional(),
  dailyPrice: z.number().positive().optional().nullable(),
  dayPrices: z.record(z.string(), z.number().nonnegative()).optional().nullable(),
  dailyPriceDate: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  isAvailable: z.boolean().optional(),
  isVeg: z.boolean().optional(),
  preparationTime: z.number().int().min(1).optional(),
  displayOrder: z.number().int().min(0).optional(),
  kitchenStationId: z.string().optional().nullable(),
});

export const bulkUpdateDailyPricesSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string().min(1),
      dailyPrice: z.number().positive(),
    })
  ),
});

export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type BulkUpdateDailyPricesInput = z.infer<typeof bulkUpdateDailyPricesSchema>;

