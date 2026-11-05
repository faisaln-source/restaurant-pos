import { Request, Response } from 'express';
import { param } from '../../lib/params';
import * as ksService from './kitchen-station.service';
import { createKitchenStationSchema, updateKitchenStationSchema } from './kitchen-station.schema';

export async function listStations(_req: Request, res: Response) {
  const data = await ksService.listKitchenStations();
  res.json({ success: true, data });
}

export async function getStation(req: Request, res: Response) {
  const data = await ksService.getKitchenStationById(param(req, 'id'));
  res.json({ success: true, data });
}

export async function createStation(req: Request, res: Response) {
  const input = createKitchenStationSchema.parse(req.body);
  const data = await ksService.createKitchenStation(input);
  res.status(201).json({ success: true, data });
}

export async function updateStation(req: Request, res: Response) {
  const input = updateKitchenStationSchema.parse(req.body);
  const data = await ksService.updateKitchenStation(param(req, 'id'), input);
  res.json({ success: true, data });
}

export async function deleteStation(req: Request, res: Response) {
  await ksService.deleteKitchenStation(param(req, 'id'));
  res.json({ success: true });
}

export async function getStationOrders(req: Request, res: Response) {
  const id = param(req, 'id');
  const activeOnly = req.query.activeOnly !== 'false';
  const data = await ksService.getOrdersForStation(id, activeOnly);
  res.json({ success: true, data });
}
