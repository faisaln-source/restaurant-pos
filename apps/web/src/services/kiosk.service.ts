import api from '../lib/api';

export interface KioskCategory {
  id: string;
  name: string;
  icon?: string;
  displayOrder: number;
  items: KioskMenuItem[];
}

export interface KioskMenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  isVeg: boolean;
  preparationTime: number;
}

export interface KioskTable {
  id: string;
  name: string;
  capacity: number;
  floorSection?: string;
}

export interface KioskOrderPayload {
  type: 'DINE_IN' | 'TAKEAWAY';
  tableId?: string;
  customerName?: string;
  customerPhone?: string;
  note?: string;
  items: {
    menuItemId: string;
    quantity: number;
    note?: string;
  }[];
}

export async function fetchKioskMenu(): Promise<KioskCategory[]> {
  return api.get<KioskCategory[]>('/api/kiosk/menu');
}

export async function fetchKioskTables(): Promise<KioskTable[]> {
  return api.get<KioskTable[]>('/api/kiosk/tables');
}

export async function placeKioskOrder(payload: KioskOrderPayload): Promise<any> {
  return api.post<any>('/api/kiosk/order', payload);
}

export async function getKioskPayQR(orderId: string): Promise<any> {
  return api.post<any>('/api/kiosk/pay-qr', { orderId });
}

export async function getKioskOrderStatus(orderId: string): Promise<any> {
  return api.get<any>(`/api/kiosk/order/${orderId}`);
}
