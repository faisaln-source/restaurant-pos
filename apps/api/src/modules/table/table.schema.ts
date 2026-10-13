import { z } from 'zod';

export const createTableSchema = z.object({
  name: z.string().min(1, 'Name is required').max(50),
  capacity: z.number().int().min(1, 'Capacity must be at least 1'),
  floorSection: z.string().max(100).optional().nullable(),
  posX: z.number().optional().nullable(),
  posY: z.number().optional().nullable(),
});

export const updateTableSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  capacity: z.number().int().min(1).optional(),
  floorSection: z.string().max(100).optional().nullable(),
  posX: z.number().optional().nullable(),
  posY: z.number().optional().nullable(),
});

export const updateTableStatusSchema = z.object({
  status: z.enum(['AVAILABLE', 'OCCUPIED', 'RESERVED', 'CLEANING']),
});

export type CreateTableInput = z.infer<typeof createTableSchema>;
export type UpdateTableInput = z.infer<typeof updateTableSchema>;
