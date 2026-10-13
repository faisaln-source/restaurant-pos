import { Request } from 'express';

/**
 * Safely extract a route param as a string.
 * Express 5 types `req.params[key]` as `string | string[]`.
 * This normalizes it to a plain string.
 */
export function param(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}
