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

/**
 * Settle a specific set of seats on an order (partial billing).
 * Returns { payment, allPaid } — allPaid=true means the order is now fully settled.
 */
export async function settleSeats(
  orderId: string,
  seatNumbers: number[],
  method: 'CASH' | 'CARD' | 'UPI',
  amount: number,
  tip: number = 0,
  reference?: string,
): Promise<{ payment: Payment; allPaid: boolean }> {
  return api.post(`/api/payments/${orderId}/settle-seats`, {
    seatNumbers,
    method,
    amount,
    tip,
    reference: reference ?? null,
  });
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
  return payments.map(normalizePayment);
}

export async function createRazorpayOrder(orderId: string, amount: number) {
  return api.post<{
    razorpayOrderId: string;
    amount: number;
    currency: string;
    keyId: string;
  }>('/api/payments/razorpay/order', { orderId, amount });
}

export async function verifyRazorpayPayment(data: {
  orderId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  method?: string;
}) {
  return api.post<Payment>('/api/payments/razorpay/verify', data);
}

export async function getRazorpayConfig() {
  return api.get<{ keyId: string; enabled: boolean }>('/api/payments/razorpay/config');
}

export interface DynamicQRResponse {
  upiPayload: string;
  upiId: string;
  razorpayQrId?: string;
}

export async function generateDynamicQR(orderId: string, amount?: number) {
  return api.post<DynamicQRResponse>('/api/payments/qr/generate', { orderId, amount });
}

export async function checkQRPaymentStatus(orderId: string, qrId?: string) {
  const params = qrId ? `?qrId=${qrId}` : '';
  return api.get<{ paid: boolean; payment?: Payment }>(`/api/payments/qr/${orderId}/status${params}`);
}
