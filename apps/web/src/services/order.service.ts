/**
 * Order service — CRUD via Express API + Socket.IO real-time.
 */
import api from '../lib/api';
import type { Order, OrderItem } from '../lib/types';

// Prisma Decimal fields come back as strings over JSON — coerce to number
function normalizeOrder(o: Order): Order {
  const subtotal       = Number((o as any).subtotal ?? o.totalAmount);
  const taxAmount      = Number((o as any).taxAmount ?? 0);
  const discountAmount = Number((o as any).discountAmount ?? 0);
  // taxRate may not be stored in DB; derive it from amounts if missing
  const taxRate = Number(
    (o as any).taxRate ??
    (subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) : 5)
  );
  return {
    ...o,
    tableName:      (o as any).table?.name ?? o.tableName,
    userName:       (o as any).user?.name ?? o.userName,
    totalAmount:    Number(o.totalAmount),
    subtotal,
    taxAmount,
    taxRate,
    discountAmount,
    items: (o.items ?? []).map((i: any) => ({
      ...i,
      menuItemName: i.menuItem?.name ?? i.menuItemName ?? 'Dish Item',
      unitPrice:  Number(i.unitPrice),
      totalPrice: Number(i.totalPrice),
    })),
  };
}

// ── Create new order ───────────────────────────────────────────────────────
export async function createOrder(data: {
  tableId?: string;
  tableName?: string;
  userId?: string;
  userName?: string;
  type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  customerName?: string;
  note?: string;
  items: Array<{
    menuItemId: string;
    quantity: number;
    note?: string;
    menuItemName?: string;
    unitPrice?: number;
  }>;
  taxRate?: number;
}): Promise<Order> {
  const order = await api.post<Order>('/api/orders', {
    tableId: data.tableId ?? null,
    type: data.type,
    customerName: data.customerName ?? null,
    note: data.note ?? null,
    taxRate: data.taxRate ?? 5,
    items: data.items.map((i) => ({
      menuItemId: i.menuItemId,
      quantity: i.quantity,
      note: i.note,
    })),
  });
  return normalizeOrder(order);
}


// ── Update order items / note ──────────────────────────────────────────────
export async function updateOrder(id: string, data: {
  items?: OrderItem[];
  note?: string;
  customerName?: string;
  taxRate?: number;
}): Promise<void> {
  if (data.items) {
    await api.post(`/api/orders/${id}/items`, {
      items: data.items.map((i) => ({
        menuItemId: i.menuItemId,
        menuItemName: i.menuItemName,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        note: i.note,
      })),
    });
  }
}

// ── Update order status ────────────────────────────────────────────────────
export async function updateOrderStatus(
  id: string,
  status: Order['status'],
  _tableId?: string,
): Promise<void> {
  await api.patch(`/api/orders/${id}/status`, { status });
}

// ── Update single item status (for KDS) ───────────────────────────────────
export async function updateOrderItemStatus(
  orderId: string,
  itemId: string,
  status: OrderItem['status'],
): Promise<void> {
  await api.patch(`/api/orders/${orderId}/items/${itemId}/status`, { status });
}

// ── Fetch helpers ──────────────────────────────────────────────────────────
export async function fetchActiveOrders(): Promise<Order[]> {
  const orders = await api.get<Order[]>('/api/orders?activeOnly=true');
  return orders.map(normalizeOrder);
}

export async function fetchTodayOrders(): Promise<Order[]> {
  const orders = await api.get<Order[]>('/api/orders/today');
  return orders.map(normalizeOrder);
}

export async function fetchOrderById(id: string): Promise<Order> {
  const order = await api.get<Order>(`/api/orders/${id}`);
  return normalizeOrder(order);
}

export async function fetchOrdersByTable(tableId: string): Promise<Order[]> {
  const orders = await api.get<Order[]>(`/api/orders?tableId=${tableId}`);
  return orders.map(normalizeOrder);
}

// ── Legacy subscription-style APIs ─────────────────────────────────────────
export function subscribeToActiveOrders(cb: (orders: Order[]) => void): () => void {
  let cancelled = false;
  fetchActiveOrders().then((orders) => {
    if (!cancelled) cb(orders);
  }).catch(console.error);
  return () => { cancelled = true; };
}

export function subscribeToTodayOrders(cb: (orders: Order[]) => void): () => void {
  let cancelled = false;
  fetchTodayOrders().then((orders) => {
    if (!cancelled) cb(orders);
  }).catch(console.error);
  return () => { cancelled = true; };
}

// ── Void order ─────────────────────────────────────────────────────────────
export async function voidOrder(id: string, _tableId?: string): Promise<void> {
  await api.post(`/api/orders/${id}/void`);
}
