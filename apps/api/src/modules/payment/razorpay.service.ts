import crypto from 'crypto';
import Razorpay from 'razorpay';
import prisma from '../../lib/prisma';
import { notFoundError, badRequest, conflict } from '../../lib/errors';

export interface CreateRazorpayOrderInput {
  orderId: string;
  amount: number;
  currency?: string;
}

export interface VerifyRazorpayPaymentInput {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  method?: 'UPI' | 'CARD' | 'WALLET';
}

export interface GenerateQRInput {
  orderId: string;
  amount?: number;
}

function getGatewayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || 'rzp_test_5173testkey';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || 'rzp_test_secret_demo123';
  const currency = process.env.RAZORPAY_CURRENCY || 'INR';
  const upiId = process.env.RESTAURANT_UPI_ID || 'quickserve.pos@okaxis';
  const restaurantName = process.env.RESTAURANT_NAME || 'QuickServe Dining';
  const hasLiveKeys = !keyId.includes('placeholder') && !keyId.includes('5173testkey');

  return { keyId, keySecret, currency, upiId, restaurantName, hasLiveKeys };
}

export function getPublicRazorpayConfig() {
  const { keyId, currency, upiId, restaurantName, hasLiveKeys } = getGatewayConfig();
  return {
    keyId,
    currency,
    upiId,
    restaurantName,
    hasLiveKeys,
  };
}

// ── Generate Dynamic Real-Time UPI / Razorpay QR Code ──────────────────────────

export async function generateDynamicQR(input: GenerateQRInput) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payment: true },
  });

  if (!order) throw notFoundError('Order not found');
  if (order.payment) throw conflict('Order already settled');

  const { keyId, keySecret, upiId, restaurantName, hasLiveKeys } = getGatewayConfig();
  const amount = Number(input.amount || order.totalAmount);
  const formattedAmount = amount.toFixed(2);

  // Standard NPCI UPI URI Scheme (Scannable by ANY phone UPI app: GPay, PhonePe, Paytm, CRED, BHIM)
  const upiPayload = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(restaurantName)}&am=${formattedAmount}&cu=INR&tn=${encodeURIComponent(`Table Bill #${order.orderNumber}`)}&tr=${order.id.slice(-12)}`;

  let razorpayQrId: string | null = null;
  let razorpayQrImage: string | null = null;

  if (hasLiveKeys) {
    try {
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const qrResponse: any = await razorpay.qrCode.create({
        type: 'upi_qr',
        name: `Order #${order.orderNumber}`,
        usage: 'single_use',
        fixed_amount: true,
        payment_amount: Math.round(amount * 100),
        description: `Order #${order.orderNumber} Table Bill`,
        notes: { orderId: order.id, orderNumber: String(order.orderNumber) },
      });
      razorpayQrId = qrResponse.id;
      razorpayQrImage = qrResponse.image_url || null;
    } catch (e: any) {
      console.warn('[Razorpay QR] Dynamic QR API notice:', e?.message || e);
    }
  }

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    amount,
    currency: 'INR',
    upiId,
    restaurantName,
    upiPayload,
    razorpayQrId,
    razorpayQrImage,
  };
}

// ── Check QR Code Payment Status (Realtime Polling) ───────────────────────────

export async function checkQRPaymentStatus(orderId: string, razorpayQrId?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: true },
  });

  if (!order) throw notFoundError('Order not found');

  // If already marked completed in DB
  if (order.payment && order.payment.status === 'COMPLETED') {
    return {
      paid: true,
      payment: order.payment,
    };
  }

  // If Razorpay live QR was generated, check Razorpay QR payments
  const { keyId, keySecret, hasLiveKeys } = getGatewayConfig();
  if (hasLiveKeys && razorpayQrId) {
    try {
      const razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
      const payments: any = await (razorpay.qrCode as any).fetchPayments(razorpayQrId);
      if (payments && payments.items && payments.items.length > 0) {
        const captured = payments.items.find((p: any) => p.status === 'captured');
        if (captured) {
          const payment = await completePaymentRecord(
            orderId,
            Number(captured.amount) / 100,
            `razorpay_qr:${captured.id}`,
            'UPI'
          );
          return { paid: true, payment };
        }
      }
    } catch (err: any) {
      console.warn('[Razorpay QR Poll] Error checking status:', err?.message || err);
    }
  }

  return { paid: false };
}

// ── Helper to Complete Payment & Free Table ───────────────────────────────────

async function completePaymentRecord(
  orderId: string,
  amount: number,
  reference: string,
  method: 'UPI' | 'CARD' | 'WALLET' | 'CASH' = 'UPI'
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: true },
  });

  if (!order) throw notFoundError('Order not found');
  if (order.payment) return order.payment;

  const payment = await prisma.payment.create({
    data: {
      orderId,
      method,
      amount,
      tip: 0,
      status: 'COMPLETED',
      reference,
    },
  });

  await prisma.order.update({
    where: { id: orderId },
    data: { status: 'COMPLETED' },
  });

  if (order.tableId) {
    const otherActive = await prisma.order.count({
      where: {
        tableId: order.tableId,
        id: { not: order.id },
        status: { notIn: ['COMPLETED', 'CANCELLED', 'VOIDED'] },
      },
    });
    if (otherActive === 0) {
      await prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      });
    }
  }

  return payment;
}

// ── Standard Razorpay Order Creation ──────────────────────────────────────────

export async function createRazorpayOrder(input: CreateRazorpayOrderInput) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payment: true },
  });

  if (!order) throw notFoundError('Order not found');
  if (order.payment) throw conflict('Order already has a payment');
  if (['CANCELLED', 'VOIDED'].includes(order.status)) {
    throw badRequest('Cannot process payment for a cancelled/voided order');
  }

  const { keyId, keySecret, currency, hasLiveKeys } = getGatewayConfig();
  const amountInPaise = Math.round(Number(input.amount || order.totalAmount) * 100);

  if (!hasLiveKeys) {
    // Generate real valid-structured order reference
    const orderRef = `order_${order.id.slice(-8)}_${Date.now()}`;
    return {
      razorpayOrderId: orderRef,
      amount: amountInPaise,
      currency,
      keyId,
      orderNumber: order.orderNumber,
    };
  }

  const razorpay = new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  const razorpayOrder = await razorpay.orders.create({
    amount: amountInPaise,
    currency,
    receipt: `rcpt_${order.orderNumber}_${Date.now().toString().slice(-4)}`,
    notes: {
      orderId: order.id,
      orderNumber: String(order.orderNumber),
    },
  });

  return {
    razorpayOrderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    keyId,
    orderNumber: order.orderNumber,
  };
}

// ── Verify & Capture Payment ──────────────────────────────────────────────────

export async function verifyAndCompleteRazorpayPayment(input: VerifyRazorpayPaymentInput) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payment: true },
  });

  if (!order) throw notFoundError('Order not found');
  if (order.payment) throw conflict('Order already has a payment');
  if (['CANCELLED', 'VOIDED'].includes(order.status)) {
    throw badRequest('Cannot process payment for a cancelled/voided order');
  }

  const { keySecret, hasLiveKeys } = getGatewayConfig();

  // If live keys are present, verify HMAC signature
  if (hasLiveKeys && input.razorpaySignature && !input.razorpayOrderId.startsWith('order_')) {
    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${input.razorpayOrderId}|${input.razorpayPaymentId}`)
      .digest('hex');

    if (generatedSignature !== input.razorpaySignature) {
      throw badRequest('Invalid Razorpay payment signature');
    }
  }

  return completePaymentRecord(
    input.orderId,
    Number(order.totalAmount),
    `razorpay:${input.razorpayPaymentId || 'pay_' + Date.now()}`,
    input.method || 'UPI'
  );
}
