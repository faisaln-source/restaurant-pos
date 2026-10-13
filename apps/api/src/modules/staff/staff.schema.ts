import { z } from 'zod';

export const createStaffSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']).default('WAITER'),
  pin: z
    .string()
    .length(4, 'PIN must be exactly 4 digits')
    .regex(/^\d+$/, 'PIN must contain only digits')
    .optional(),
});

export const updateStaffSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'CASHIER', 'WAITER', 'KITCHEN']).optional(),
  isActive: z.boolean().optional(),
  pin: z
    .string()
    .length(4)
    .regex(/^\d+$/)
    .optional()
    .nullable(),
});

export const clockInSchema = z.object({
  note: z.string().max(500).optional(),
});

export const clockOutSchema = z.object({
  note: z.string().max(500).optional(),
});

export type CreateStaffInput = z.infer<typeof createStaffSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
