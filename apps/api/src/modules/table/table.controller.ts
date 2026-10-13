import { Request, Response } from 'express';
import { param } from '../../lib/params';
import * as tableService from './table.service';
import { createTableSchema, updateTableSchema, updateTableStatusSchema } from './table.schema';

export async function listTables(req: Request, res: Response) {
  const floorSection = typeof req.query.floorSection === 'string' ? req.query.floorSection : undefined;
  const data = await tableService.listTables(floorSection);
  res.json({ success: true, data });
}

export async function getTableById(req: Request, res: Response) {
  const data = await tableService.getTableById(param(req, 'id'));
  res.json({ success: true, data });
}

export async function createTable(req: Request, res: Response) {
  const input = createTableSchema.parse(req.body);
  const data = await tableService.createTable(input);
  res.status(201).json({ success: true, data });
}

export async function updateTable(req: Request, res: Response) {
  const input = updateTableSchema.parse(req.body);
  const data = await tableService.updateTable(param(req, 'id'), input);
  res.json({ success: true, data });
}

export async function updateTableStatus(req: Request, res: Response) {
  const { status } = updateTableStatusSchema.parse(req.body);
  const data = await tableService.updateTableStatus(param(req, 'id'), status);
  res.json({ success: true, data });
}

export async function deleteTable(req: Request, res: Response) {
  await tableService.deleteTable(param(req, 'id'));
  res.json({ success: true, message: 'Table deleted' });
}

export async function getFloorSections(_req: Request, res: Response) {
  const data = await tableService.getFloorSections();
  res.json({ success: true, data });
}
