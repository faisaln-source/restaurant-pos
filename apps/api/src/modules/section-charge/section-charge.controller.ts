import { Request, Response } from 'express';
import { param } from '../../lib/params';
import * as svc from './section-charge.service';
import { z } from 'zod';

const chargeSchema = z.object({
  floorSection: z.string().min(1),
  label: z.string().min(1).max(100),
  amount: z.number().min(0),
  isPercent: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export async function list(req: Request, res: Response) {
  const section = req.query.floorSection as string | undefined;
  const data = await svc.listSectionCharges(section);
  res.json({ success: true, data });
}

export async function create(req: Request, res: Response) {
  const input = chargeSchema.parse(req.body);
  const data = await svc.createSectionCharge(input);
  res.status(201).json({ success: true, data });
}

export async function update(req: Request, res: Response) {
  const input = chargeSchema.partial().parse(req.body);
  const data = await svc.updateSectionCharge(param(req, 'id'), input);
  res.json({ success: true, data });
}

export async function remove(req: Request, res: Response) {
  await svc.deleteSectionCharge(param(req, 'id'));
  res.json({ success: true });
}
