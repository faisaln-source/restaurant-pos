import { Router, Request, Response } from 'express';
import prisma from '../lib/prisma';
import { param } from '../lib/params';
import * as orderService from '../modules/order/order.service';
import * as razorpayService from '../modules/payment/razorpay.service';
import { createOrderSchema } from '../modules/order/order.schema';

const router = Router();

// ── GET /api/kiosk/menu ────────────────────────────────────────────────────────
// Public menu with categories and available dishes for customer self-ordering
router.get('/menu', async (_req: Request, res: Response) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: 'asc' },
    include: {
      items: {
        where: { isAvailable: true },
        orderBy: { displayOrder: 'asc' },
      },
    },
  });

  res.json({ success: true, data: categories });
});

// ── GET /api/kiosk/tables ──────────────────────────────────────────────────────
// Returns available dining tables for Dine-In guests
router.get('/tables', async (_req: Request, res: Response) => {
  const tables = await prisma.table.findMany({
    where: { status: 'AVAILABLE' },
    orderBy: { name: 'asc' },
    select: {
      id: true,
      name: true,
      capacity: true,
      floorSection: true,
    },
  });

  res.json({ success: true, data: tables });
});

// ── POST /api/kiosk/order ──────────────────────────────────────────────────────
// Place an order directly from the Customer Self-Ordering Kiosk
router.post('/order', async (req: Request, res: Response) => {
  const input = createOrderSchema.parse(req.body);

  // Assign to first active cashier/admin user
  const kioskUser = await prisma.user.findFirst({
    where: { isActive: true },
    orderBy: { role: 'asc' },
    select: { id: true },
  });

  if (!kioskUser) {
    return res.status(500).json({ success: false, message: 'No active staff account found to assign order' });
  }

  const orderData = await orderService.createOrder(input, kioskUser.id);

  const io = req.app.get('io');
  if (io) {
    io.emit('order:new', orderData);
    if (orderData.tableId) {
      io.emit('table:updated', { tableId: orderData.tableId, status: 'OCCUPIED' });
    }
  }

  res.status(201).json({ success: true, data: orderData });
});

// ── POST /api/kiosk/pay-qr ─────────────────────────────────────────────────────
// Generate live dynamic UPI QR code for the customer kiosk order
router.post('/pay-qr', async (req: Request, res: Response) => {
  const { orderId } = req.body;
  if (!orderId) {
    return res.status(400).json({ success: false, message: 'orderId is required' });
  }

  const qrData = await razorpayService.generateDynamicQR({ orderId });
  res.json({ success: true, data: qrData });
});

// ── GET /api/kiosk/order/:id ───────────────────────────────────────────────────
// Check kiosk order and payment status in real-time
router.get('/order/:id', async (req: Request, res: Response) => {
  const order = await prisma.order.findUnique({
    where: { id: param(req, 'id') },
    include: {
      table: { select: { name: true } },
      items: {
        include: { menuItem: { select: { name: true, imageUrl: true } } },
      },
      payment: true,
    },
  });

  if (!order) {
    return res.status(404).json({ success: false, message: 'Order not found' });
  }

  res.json({ success: true, data: order });
});

export default router;
