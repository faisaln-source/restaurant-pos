import { Request, Response } from 'express';
import { param } from '../../lib/params';
import * as orderService from './order.service';
import {
  createOrderSchema, addItemsSchema,
  updateOrderStatusSchema, updateItemStatusSchema,
} from './order.schema';

export async function listOrders(req: Request, res: Response) {
  const q = req.query;
  const filters: Parameters<typeof orderService.listOrders>[0] = {};

  if (typeof q.status === 'string') filters.status = q.status as any;
  if (typeof q.type === 'string') filters.type = q.type as any;
  if (typeof q.tableId === 'string') filters.tableId = q.tableId;
  if (typeof q.userId === 'string') filters.userId = q.userId;
  if (q.activeOnly === 'true') filters.activeOnly = true;
  if (typeof q.from === 'string') filters.from = new Date(q.from);
  if (typeof q.to === 'string') filters.to = new Date(q.to);

  const data = await orderService.listOrders(filters);
  res.json({ success: true, data });
}

export async function getTodayOrders(_req: Request, res: Response) {
  const data = await orderService.getTodayOrders();
  res.json({ success: true, data });
}

export async function getOrderById(req: Request, res: Response) {
  const data = await orderService.getOrderById(param(req, 'id'));
  res.json({ success: true, data });
}

export async function createOrder(req: Request, res: Response) {
  const input = createOrderSchema.parse(req.body);
  const data = await orderService.createOrder(input, req.user!.userId);

  const io = req.app.get('io');
  if (io) {
    io.emit('order:new', data);
    if (data.tableId) {
      io.emit('table:updated', { tableId: data.tableId, status: 'OCCUPIED' });
    }
  }

  res.status(201).json({ success: true, data });
}

export async function addItems(req: Request, res: Response) {
  const { items } = addItemsSchema.parse(req.body);
  const data = await orderService.addItemsToOrder(param(req, 'id'), items);

  const io = req.app.get('io');
  if (io) {
    io.emit('order:updated', data);
  }

  res.json({ success: true, data });
}

export async function updateOrderStatus(req: Request, res: Response) {
  const { status } = updateOrderStatusSchema.parse(req.body);
  const data = await orderService.updateOrderStatus(param(req, 'id'), status);

  const io = req.app.get('io');
  if (io) {
    io.emit('order:statusChanged', data);
    io.emit('order:updated', data);
    io.to('kds').emit('order:statusChanged', data);
    io.to('pos').emit('order:statusChanged', data);
  }

  res.json({ success: true, data });
}

export async function updateItemStatus(req: Request, res: Response) {
  const { status } = updateItemStatusSchema.parse(req.body);
  const orderId = param(req, 'orderId');
  const itemId = param(req, 'itemId');
  const data = await orderService.updateOrderItemStatus(orderId, itemId, status);

  const io = req.app.get('io');
  if (io) {
    // Notify item-level change (KDS uses this to re-render individual item rows)
    io.emit('orderItem:statusChanged', { orderId, item: data });
    // Notify order-level change (KDS badge + POS use this for the order header status)
    // The service may have auto-promoted the parent order status, so always emit this.
    io.emit('order:statusChanged', { orderId });
  }

  res.json({ success: true, data });
}

export async function voidOrder(req: Request, res: Response) {
  const data = await orderService.voidOrder(param(req, 'id'));

  const io = req.app.get('io');
  if (io) {
    io.to('kds').emit('order:voided', data);
    io.to('pos').emit('order:voided', data);
  }

  res.json({ success: true, data });
}
