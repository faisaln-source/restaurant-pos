import { Request, Response } from 'express';
import * as reportService from './report.service';
import { reportQuerySchema } from './report.schema';

export async function getDashboard(_req: Request, res: Response) {
  const data = await reportService.getDashboardStats();
  res.json({ success: true, data });
}

export async function getRevenueReport(req: Request, res: Response) {
  const { from, to } = reportQuerySchema.parse(req.query);
  const data = await reportService.getRevenueReport(new Date(from), new Date(to));
  res.json({ success: true, data });
}

export async function getTopSellingItems(req: Request, res: Response) {
  const { from, to } = reportQuerySchema.parse(req.query);
  const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 10;
  const data = await reportService.getTopSellingItems(new Date(from), new Date(to), limit);
  res.json({ success: true, data });
}

export async function getStaffReport(req: Request, res: Response) {
  const { from, to } = reportQuerySchema.parse(req.query);
  const data = await reportService.getStaffReport(new Date(from), new Date(to));
  res.json({ success: true, data });
}
