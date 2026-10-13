import { Request, Response } from 'express';
import { param } from '../../lib/params';
import * as staffService from './staff.service';
import {
  createStaffSchema, updateStaffSchema,
  clockInSchema, clockOutSchema,
} from './staff.schema';

export async function listStaff(req: Request, res: Response) {
  const activeOnly = req.query.activeOnly === 'true' || undefined;
  const data = await staffService.listStaff(activeOnly);
  res.json({ success: true, data });
}

export async function getStaffById(req: Request, res: Response) {
  const data = await staffService.getStaffById(param(req, 'id'));
  res.json({ success: true, data });
}

export async function createStaff(req: Request, res: Response) {
  const input = createStaffSchema.parse(req.body);
  const data = await staffService.createStaff(input);
  res.status(201).json({ success: true, data });
}

export async function updateStaff(req: Request, res: Response) {
  const input = updateStaffSchema.parse(req.body);
  const data = await staffService.updateStaff(param(req, 'id'), input);
  res.json({ success: true, data });
}

export async function deleteStaff(req: Request, res: Response) {
  const data = await staffService.deleteStaff(param(req, 'id'));
  res.json({ success: true, data, message: 'Staff member deactivated' });
}

// ── Shifts ─────────────────────────────────────────────────────────────────

export async function clockIn(req: Request, res: Response) {
  const { note } = clockInSchema.parse(req.body);
  const data = await staffService.clockIn(param(req, 'id'), note);
  res.status(201).json({ success: true, data });
}

export async function clockOut(req: Request, res: Response) {
  const { note } = clockOutSchema.parse(req.body);
  const data = await staffService.clockOut(param(req, 'shiftId'), note);
  res.json({ success: true, data });
}

export async function getShifts(req: Request, res: Response) {
  const q = req.query;
  const filters: Parameters<typeof staffService.getShifts>[0] = {};

  if (typeof q.userId === 'string') filters.userId = q.userId;
  if (typeof q.from === 'string') filters.from = new Date(q.from);
  if (typeof q.to === 'string') filters.to = new Date(q.to);
  if (typeof q.date === 'string') filters.date = new Date(q.date);

  const data = await staffService.getShifts(filters);
  res.json({ success: true, data });
}

export async function getTodayShifts(_req: Request, res: Response) {
  const data = await staffService.getTodayShifts();
  res.json({ success: true, data });
}
