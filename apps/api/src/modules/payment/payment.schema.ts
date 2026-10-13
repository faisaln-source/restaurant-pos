import { z } from 'zod';

export const processPaymentSchema = z.object({
  orderId: z.string().min(1, 'Order ID is required'),
  method: z.enum(['CASH', 'CARD', 'UPI', 'WALLET', 'SPLIT']),
  amount: z.number().positive('Amount must be positive'),
  tip: z.number().min(0).default(0),
  reference: z.string().max(200).optional().nullable(),
});

export const refundPaymentSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
