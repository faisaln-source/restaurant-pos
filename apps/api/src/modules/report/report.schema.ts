import { z } from 'zod';

export const reportQuerySchema = z.object({
  from: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
  to: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
});

export type ReportQueryInput = z.infer<typeof reportQuerySchema>;
