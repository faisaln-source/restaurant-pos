import { Request, Response, NextFunction } from 'express';
import { notFoundError } from '../lib/errors';

export function notFound(_req: Request, _res: Response, next: NextFunction): void {
  next(notFoundError(`Route ${_req.originalUrl} not found`));
}
