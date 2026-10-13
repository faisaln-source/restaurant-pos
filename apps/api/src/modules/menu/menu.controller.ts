import { Request, Response } from 'express';
import { param } from '../../lib/params';
import * as menuService from './menu.service';
import {
  createCategorySchema, updateCategorySchema,
  createMenuItemSchema, updateMenuItemSchema,
} from './menu.schema';

// ── Categories ─────────────────────────────────────────────────────────────

export async function listCategories(_req: Request, res: Response) {
  const data = await menuService.listCategories();
  res.json({ success: true, data });
}

export async function getCategoryById(req: Request, res: Response) {
  const data = await menuService.getCategoryById(param(req, 'id'));
  res.json({ success: true, data });
}

export async function createCategory(req: Request, res: Response) {
  const input = createCategorySchema.parse(req.body);
  const data = await menuService.createCategory(input);
  res.status(201).json({ success: true, data });
}

export async function updateCategory(req: Request, res: Response) {
  const input = updateCategorySchema.parse(req.body);
  const data = await menuService.updateCategory(param(req, 'id'), input);
  res.json({ success: true, data });
}

export async function deleteCategory(req: Request, res: Response) {
  await menuService.deleteCategory(param(req, 'id'));
  res.json({ success: true, message: 'Category deleted' });
}

// ── Menu Items ─────────────────────────────────────────────────────────────

export async function listMenuItems(req: Request, res: Response) {
  const q = req.query;
  const filters = {
    categoryId: typeof q.categoryId === 'string' ? q.categoryId : undefined,
    isAvailable: typeof q.isAvailable === 'string' ? q.isAvailable === 'true' : undefined,
    isVeg: typeof q.isVeg === 'string' ? q.isVeg === 'true' : undefined,
    search: typeof q.search === 'string' ? q.search : undefined,
  };
  const data = await menuService.listMenuItems(filters);
  res.json({ success: true, data });
}

export async function getMenuItemById(req: Request, res: Response) {
  const data = await menuService.getMenuItemById(param(req, 'id'));
  res.json({ success: true, data });
}

import fs from 'fs';
import path from 'path';

export async function createMenuItem(req: Request, res: Response) {
  const input = createMenuItemSchema.parse(req.body);
  const data = await menuService.createMenuItem(input);
  const io = req.app.get('io');
  if (io) {
    io.emit('menu:updated', { action: 'create', item: data });
  }
  res.status(201).json({ success: true, data });
}

export async function updateMenuItem(req: Request, res: Response) {
  const input = updateMenuItemSchema.parse(req.body);
  const data = await menuService.updateMenuItem(param(req, 'id'), input);
  const io = req.app.get('io');
  if (io) {
    io.emit('menu:updated', { action: 'update', item: data });
  }
  res.json({ success: true, data });
}

export async function deleteMenuItem(req: Request, res: Response) {
  const id = param(req, 'id');
  await menuService.deleteMenuItem(id);
  const io = req.app.get('io');
  if (io) {
    io.emit('menu:updated', { action: 'delete', id });
  }
  res.json({ success: true, message: 'Menu item deleted' });
}

export async function toggleAvailability(req: Request, res: Response) {
  const { isAvailable } = req.body;
  if (typeof isAvailable !== 'boolean') {
    res.status(400).json({ success: false, message: 'isAvailable (boolean) is required' });
    return;
  }
  const data = await menuService.toggleAvailability(param(req, 'id'), isAvailable);
  const io = req.app.get('io');
  if (io) {
    io.emit('menu:updated', { action: 'availability', item: data });
  }
  res.json({ success: true, data });
}

export async function uploadImage(req: Request, res: Response) {
  const { image } = req.body;
  if (!image || typeof image !== 'string') {
    res.status(400).json({ success: false, message: 'Image data (base64 string) is required' });
    return;
  }

  const matches = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
  let ext = 'jpg';
  let buffer: Buffer;

  if (matches) {
    ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    buffer = Buffer.from(matches[2], 'base64');
  } else {
    buffer = Buffer.from(image, 'base64');
  }

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const safeName = `dish_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
  const filePath = path.join(uploadsDir, safeName);
  await fs.promises.writeFile(filePath, buffer);

  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${safeName}`;
  res.json({ success: true, url: fileUrl });
}
