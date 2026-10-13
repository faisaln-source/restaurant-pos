// ── User ───────────────────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN';
  pin?: string;
  isActive: boolean;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Menu ───────────────────────────────────────────────────────────────────
export interface MenuCategory {
  id: string;
  name: string;
  icon?: string;
  displayOrder: number;
  isActive: boolean;
  _count?: { items: number };
  createdAt: string;
  updatedAt: string;
}

export interface MenuItem {
  id: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  isAvailable: boolean;
  isVeg: boolean;
  preparationTime: number;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ── Table ──────────────────────────────────────────────────────────────────
export interface Table {
  id: string;
  name: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED' | 'CLEANING';
  floorSection?: string;
  posX?: number;
  posY?: number;
  currentOrderId?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Order ──────────────────────────────────────────────────────────────────
export interface OrderItem {
  id: string;
  menuItemId: string;
  menuItemName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  status: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED' | 'CANCELLED';
  note?: string;
}

export interface Order {
  id: string;
  orderNumber: number;
  tableId?: string;
  tableName?: string;
  userId: string;
  userName: string;
  type: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
  status: 'PENDING' | 'CONFIRMED' | 'PREPARING' | 'READY' | 'SERVED' | 'COMPLETED' | 'CANCELLED';
  customerName?: string;
  note?: string;
  items: OrderItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
}

// ── Payment ────────────────────────────────────────────────────────────────
export interface Payment {
  id: string;
  orderId: string;
  orderNumber: number;
  method: 'CASH' | 'CARD' | 'UPI';
  amount: number;
  tip: number;
  change?: number;
  status: 'PENDING' | 'COMPLETED' | 'REFUNDED';
  reference?: string;
  createdAt: string;
}


// ── Shift ──────────────────────────────────────────────────────────────────
export interface Shift {
  id: string;
  userId: string;
  userName: string;
  clockIn: string;
  clockOut?: string;
  date: string;
  note?: string;
}

// ── Auth ───────────────────────────────────────────────────────────────────
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserProfile['role'];
  };
}
