import { z } from 'zod';

export const createKitchenStationSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(300).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').default('#6366f1'),
  displayOrder: z.number().int().min(0).default(0),
});

export const updateKitchenStationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(300).optional().nullable(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isActive: z.boolean().optional(),
  displayOrder: z.number().int().min(0).optional(),
});

export type CreateKitchenStationInput = z.infer<typeof createKitchenStationSchema>;
export type UpdateKitchenStationInput = z.infer<typeof updateKitchenStationSchema>;
