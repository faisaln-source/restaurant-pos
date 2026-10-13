import { z } from 'zod';

export const orderItemSchema = z.object({
  menuItemId: z.string().min(1),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  note: z.string().max(500).optional().nullable(),
});

export const createOrderSchema = z.object({
  tableId: z.string().optional().nullable(),
  type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).default('DINE_IN'),
  customerName: z.string().max(200).optional().nullable(),
  note: z.string().max(500).optional().nullable(),
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
});

export const addItemsSchema = z.object({
  items: z.array(orderItemSchema).min(1, 'At least one item is required'),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'SERVED', 'COMPLETED', 'CANCELLED', 'VOIDED']),
});

export const updateItemStatusSchema = z.object({
  status: z.enum(['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type OrderItemInput = z.infer<typeof orderItemSchema>;
