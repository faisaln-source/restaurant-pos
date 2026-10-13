/**
 * Payment service — process payments via Express API.
 */
import api from '../lib/api';
import type { Order, Payment } from '../lib/types';

// Coerce Prisma Decimal strings to JS numbers
function normalizePayment(p: Payment): Payment {
  return {
    ...p,
    amount: Number(p.amount),
    tip:    Number((p as any).tip ?? 0),
    change: Number((p as any).change ?? 0),
  };
}

export async function processPayment(
  order: Order,
  method: 'CASH' | 'CARD' | 'UPI',
  amount: number,
  tip: number = 0,
  reference?: string,
): Promise<string> {
  const payment = await api.post<Payment>('/api/payments', {
    orderId: order.id,
    method,
    amount,
    tip,
    reference: reference ?? null,
  });
  return payment.id;
}

export async function getPaymentById(id: string): Promise<Payment | null> {
  try {
    const p = await api.get<Payment>(`/api/payments/${id}`);
    return normalizePayment(p);
  } catch {
    return null;
  }
}

export async function getPaymentByOrderId(orderId: string): Promise<Payment | null> {
  try {
    const p = await api.get<Payment>(`/api/payments/order/${orderId}`);
    return normalizePayment(p);
  } catch {
    return null;
  }
}

export async function fetchTodayPayments(): Promise<Payment[]> {
  const payments = await api.get<Payment[]>('/api/payments/today');
  return payments.map(normalizePayment);
}

export function subscribeToTodayPayments(cb: (payments: Payment[]) => void): () => void {
  let cancelled = false;
  fetchTodayPayments().then((payments) => {
    if (!cancelled) cb(payments);
  }).catch(console.error);
  return () => { cancelled = true; };
}

export async function getPaymentsForRange(from: Date, to: Date): Promise<Payment[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  const payments = await api.get<Payment[]>(`/api/payments?${params}`);
  return (payments ?? []).map(normalizePayment);
}

export async function refundPayment(id: string): Promise<void> {
  await api.post(`/api/payments/${id}/refund`);
}

// ── Razorpay Gateway Methods ──────────────────────────────────────────────────

export interface RazorpayOrderResponse {
  razorpayOrderId: string;
  amount: number;
  currency: string;
  keyId: string;
  isMockMode: boolean;
  orderNumber?: number;
  warning?: string;
}

export async function getRazorpayConfig(): Promise<{ keyId: string; currency: string; isMockMode: boolean }> {
  return api.get<{ keyId: string; currency: string; isMockMode: boolean }>('/api/payments/razorpay/config');
}

export async function createRazorpayOrder(orderId: string, amount: number): Promise<RazorpayOrderResponse> {
  return api.post<RazorpayOrderResponse>('/api/payments/razorpay/order', {
    orderId,
    amount,
  });
}

export async function verifyRazorpayPayment(payload: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  method?: 'UPI' | 'CARD' | 'WALLET';
}): Promise<Payment> {
  const p = await api.post<Payment>('/api/payments/razorpay/verify', payload);
  return normalizePayment(p);
}

// ── Dynamic UPI QR Code Methods ───────────────────────────────────────────────

export interface DynamicQRResponse {
  orderId: string;
  orderNumber: number;
  amount: number;
  currency: string;
  upiId: string;
  restaurantName: string;
  upiPayload: string;
  razorpayQrId: string | null;
  razorpayQrImage: string | null;
}

export async function generateDynamicQR(orderId: string, amount?: number): Promise<DynamicQRResponse> {
  return api.post<DynamicQRResponse>('/api/payments/qr/generate', {
    orderId,
    amount,
  });
}

export async function checkQRPaymentStatus(orderId: string, qrId?: string): Promise<{ paid: boolean; payment?: Payment }> {
  const params = qrId ? `?qrId=${encodeURIComponent(qrId)}` : '';
  const res = await api.get<{ paid: boolean; payment?: Payment }>(`/api/payments/qr/${orderId}/status${params}`);
  if (res.payment) {
    res.payment = normalizePayment(res.payment);
  }
  return res;
}

