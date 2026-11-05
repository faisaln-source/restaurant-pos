import { Request, Response } from 'express';
import { param } from '../../lib/params';
import * as paymentService from './payment.service';
import * as razorpayService from './razorpay.service';
import { processPaymentSchema } from './payment.schema';

export async function processPayment(req: Request, res: Response) {
  const input = processPaymentSchema.parse(req.body);
  const data = await paymentService.processPayment(input);

  const io = req.app.get('io');
  if (io) {
    io.emit('payment:completed', data.payment);
    io.emit('order:statusChanged', { orderId: input.orderId, status: 'COMPLETED' });
    // Only emit table:updated (AVAILABLE) if the table was actually freed
    if (data.tableFreed && data.tableId) {
      io.emit('table:updated', { id: data.tableId, status: 'AVAILABLE' });
    }
  }

  res.status(201).json({ success: true, data });
}

export async function getPaymentById(req: Request, res: Response) {
  const data = await paymentService.getPaymentById(param(req, 'id'));
  res.json({ success: true, data });
}

export async function getPaymentByOrderId(req: Request, res: Response) {
  const data = await paymentService.getPaymentByOrderId(param(req, 'orderId'));
  res.json({ success: true, data });
}

export async function listPayments(req: Request, res: Response) {
  const q = req.query;
  const filters: Parameters<typeof paymentService.listPayments>[0] = {};

  if (typeof q.from === 'string') filters.from = new Date(q.from);
  if (typeof q.to === 'string') filters.to = new Date(q.to);
  if (typeof q.method === 'string') filters.method = q.method;
  if (typeof q.status === 'string') filters.status = q.status;

  const data = await paymentService.listPayments(filters);
  res.json({ success: true, data });
}

export async function getTodayPayments(_req: Request, res: Response) {
  const data = await paymentService.getTodayPayments();
  res.json({ success: true, data });
}

export async function refundPayment(req: Request, res: Response) {
  const data = await paymentService.refundPayment(param(req, 'id'));
  res.json({ success: true, data });
}

// ── Settle specific seats (partial billing) ───────────────────────────────────

export async function settleSeats(req: Request, res: Response) {
  const orderId = param(req, 'id');
  const { seatNumbers, method, amount, tip, reference } = req.body;

  if (!Array.isArray(seatNumbers) || seatNumbers.length === 0) {
    return res.status(400).json({ success: false, message: 'seatNumbers array is required' });
  }
  if (!method || !amount) {
    return res.status(400).json({ success: false, message: 'method and amount are required' });
  }

  const result = await paymentService.settleSeats({
    orderId,
    seatNumbers: seatNumbers.map(Number),
    method,
    amount: Number(amount),
    tip: tip ? Number(tip) : 0,
    reference: reference ?? null,
  });

  const io = req.app.get('io');
  if (io) {
    io.emit('payment:completed', result.payment);
    if (result.allPaid) {
      io.emit('order:statusChanged', { orderId, status: 'COMPLETED' });
      // Emit table:updated only if the table was actually freed
      if (result.tableFreed && result.tableId) {
        io.emit('table:updated', { id: result.tableId, status: 'AVAILABLE' });
      }
    }
  }

  res.status(201).json({ success: true, data: result });
}

// ── Razorpay Endpoints ────────────────────────────────────────────────────────

export async function getRazorpayConfig(_req: Request, res: Response) {
  const config = razorpayService.getPublicRazorpayConfig();
  res.json({ success: true, data: config });
}

export async function createRazorpayOrder(req: Request, res: Response) {
  const { orderId, amount, currency } = req.body;
  if (!orderId) {
    return res.status(400).json({ success: false, message: 'orderId is required' });
  }

  const data = await razorpayService.createRazorpayOrder({
    orderId,
    amount: Number(amount),
    currency,
  });

  res.status(201).json({ success: true, data });
}

export async function verifyRazorpayPayment(req: Request, res: Response) {
  const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, method } = req.body;
  if (!orderId || !razorpayOrderId) {
    return res.status(400).json({ success: false, message: 'orderId and razorpayOrderId are required' });
  }

  const data = await razorpayService.verifyAndCompleteRazorpayPayment({
    orderId,
    razorpayOrderId,
    razorpayPaymentId: razorpayPaymentId || `pay_${Date.now()}`,
    razorpaySignature: razorpaySignature || '',
    method,
  });

  const io = req.app.get('io');
  if (io) {
    io.to('pos').emit('payment:completed', data);
    io.to('pos').emit('order:statusChanged', { orderId, status: 'COMPLETED' });
  }

  res.json({ success: true, data });
}

export async function generateDynamicQR(req: Request, res: Response) {
  const { orderId, amount } = req.body;
  if (!orderId) {
    return res.status(400).json({ success: false, message: 'orderId is required' });
  }

  const data = await razorpayService.generateDynamicQR({
    orderId,
    amount: amount ? Number(amount) : undefined,
  });

  res.json({ success: true, data });
}

export async function checkQRPaymentStatus(req: Request, res: Response) {
  const orderId = param(req, 'orderId');
  const qrId = typeof req.query.qrId === 'string' ? req.query.qrId : undefined;

  const data = await razorpayService.checkQRPaymentStatus(orderId, qrId);

  if (data.paid && data.payment) {
    const io = req.app.get('io');
    if (io) {
      io.to('pos').emit('payment:completed', data.payment);
      io.to('pos').emit('order:statusChanged', { orderId, status: 'COMPLETED' });
    }
  }

  res.json({ success: true, data });
}

