import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Plus, Minus, Trash2, Search, Send, Receipt,
  ShoppingCart, UtensilsCrossed, Package, Bike,
  ChevronDown, History, Loader2, CreditCard, X, Check,
  Clock, CheckCircle, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchCategories, fetchMenuItems } from '../services/menu.service';
import { fetchTables } from '../services/table.service';
import {
  createOrder, fetchTodayOrders, updateOrderStatus, voidOrder,
} from '../services/order.service';
import { getPaymentByOrderId } from '../services/payment.service';
import { useAuthStore } from '../store/authStore';
import { useSocketEvent } from '../lib/socket';
import PaymentModal from '../components/PaymentModal';
import ReceiptModal from '../components/ReceiptModal';
import type { MenuCategory, MenuItem, Table, Order, OrderItem, Payment } from '../lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetDescription,
  SheetHeader, SheetTitle,
} from '@/components/ui/sheet';

const TAX_RATE = 5; // %

type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';

const ORDER_TYPE_CONFIG = {
  DINE_IN:  { label: 'Dine In',   icon: UtensilsCrossed },
  TAKEAWAY: { label: 'Takeaway',  icon: Package },
  DELIVERY: { label: 'Delivery',  icon: Bike },
};

const STATUS_VARIANT: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color?: string }> = {
  PENDING:   { label: 'Pending',   variant: 'outline', color: '#f59e0b' },
  CONFIRMED: { label: 'Confirmed', variant: 'secondary', color: '#6366f1' },
  PREPARING: { label: 'Preparing', variant: 'default', color: '#f97316' },
  READY:     { label: 'Ready',     variant: 'default', color: '#22c55e' },
  SERVED:    { label: 'Served',    variant: 'secondary' },
  COMPLETED: { label: 'Completed', variant: 'secondary' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
};

interface CartItem {
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  note?: string;
}

// ── Table Selector Dialog ────────────────────────────────────────────────────
function TableSelector({
  open,
  tables,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  tables: Table[];
  selected: string;
  onSelect: (t: Table) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'available' | 'occupied'>('available');
  const available = tables.filter(t => t.status === 'AVAILABLE');
  const occupied = tables.filter(t => t.status === 'OCCUPIED');

  const currentList = tab === 'available' ? available : occupied;
  const sections = [...new Set(currentList.map(t => t.floorSection ?? 'General'))];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Select Dining Table</DialogTitle>
          <DialogDescription>
            Choose a table for new guests or add items to an existing bill.
          </DialogDescription>
        </DialogHeader>

        {/* Tab Toggle */}
        <div className="flex items-center gap-2 p-1 bg-white/[0.04] rounded-xl border border-white/10 mt-1">
          <button
            type="button"
            onClick={() => setTab('available')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tab === 'available'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Available Tables ({available.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('occupied')}
            className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              tab === 'occupied'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Occupied (Add to Bill) ({occupied.length})
          </button>
        </div>

        <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
          {currentList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p className="text-2xl mb-1">🪑</p>
              <p>{tab === 'available' ? 'No available tables right now.' : 'No currently occupied tables.'}</p>
            </div>
          ) : (
            sections.map(section => (
              <div key={section} className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section}</p>
                <div className="grid grid-cols-3 gap-2">
                  {currentList.filter(t => (t.floorSection ?? 'General') === section).map(t => (
                    <Button
                      key={t.id}
                      variant={selected === t.id ? 'default' : 'outline'}
                      onClick={() => { onSelect(t); onClose(); }}
                      className={`h-14 flex-col items-center justify-center p-2 rounded-xl cursor-pointer ${
                        t.status === 'OCCUPIED'
                          ? 'border-orange-500/40 bg-orange-500/10 hover:bg-orange-500/20 text-orange-200'
                          : ''
                      }`}
                    >
                      <span className="font-bold text-sm leading-tight">{t.name}</span>
                      <span className="text-[10px] opacity-80 leading-tight">
                        {t.status === 'OCCUPIED' ? 'Add to Tab' : `${t.capacity} seats`}
                      </span>
                    </Button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Order History Sheet (Drawer) ─────────────────────────────────────────────
function OrderHistorySheet({
  open,
  orders,
  onClose,
  onVoid,
  onPay,
  onReceipt,
}: {
  open: boolean;
  orders: Order[];
  onClose: () => void;
  onVoid: (o: Order) => void;
  onPay: (o: Order) => void;
  onReceipt: (o: Order) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
        <SheetHeader className="p-5 border-b border-border/80">
          <SheetTitle className="flex items-center gap-2">
            <History size={18} className="text-primary" /> Today's Orders
          </SheetTitle>
          <SheetDescription>
            {orders.length} order{orders.length !== 1 ? 's' : ''} recorded today
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {orders.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <ShoppingCart size={36} className="mx-auto mb-2 opacity-30" />
              <p className="text-sm">No orders yet today</p>
            </div>
          ) : (
            orders.map(o => {
              const statusCfg = STATUS_VARIANT[o.status] ?? { label: o.status, variant: 'secondary' };
              return (
                <Card key={o.id} className="border-border/70 bg-card/60">
                  <CardContent className="p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-foreground">#{o.orderNumber}</span>
                      <Badge
                        variant={statusCfg.variant}
                        className="text-[11px] font-semibold"
                        style={statusCfg.color ? { borderColor: statusCfg.color, color: statusCfg.color } : {}}
                      >
                        {statusCfg.label}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{o.tableName ?? o.type.replace('_', ' ')}</span>
                      <span className="font-bold text-sm text-primary">₹{o.totalAmount.toFixed(2)}</span>
                    </div>

                    <div className="text-xs text-muted-foreground/80 line-clamp-1">
                      {o.items.slice(0, 3).map(i => `${i.menuItemName} ×${i.quantity}`).join(', ')}
                      {o.items.length > 3 && ` +${o.items.length - 3} more`}
                    </div>

                    {o.status !== 'COMPLETED' && o.status !== 'CANCELLED' && (
                      <div className="flex items-center gap-2 pt-2 border-t border-border/40">
                        {o.status === 'READY' && (
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 cursor-pointer"
                            onClick={() => updateOrderStatus(o.id, 'SERVED', o.tableId ?? undefined)
                              .then(() => toast.success(`Order #${o.orderNumber} marked as Served!`))
                              .catch(() => toast.error('Failed to update status'))}
                          >
                            <Check size={13} /> Food Ready • Serve to Table
                          </Button>
                        )}
                        {o.status === 'PREPARING' && (
                          <span className="text-[11px] font-semibold text-orange-400 flex items-center gap-1.5 py-1">
                            <Clock size={12} className="animate-spin" /> Cooking in kitchen...
                          </span>
                        )}
                        {o.status === 'SERVED' && (
                          <span className="text-[11px] font-bold text-cyan-400 flex items-center gap-1.5 py-1">
                            <Check size={12} /> Food Served to Table
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-destructive hover:bg-destructive/10 ml-auto cursor-pointer"
                          onClick={() => onVoid(o)}
                          title="Void order"
                        >
                          <Trash2 size={13} />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── Main OrdersPage Component ───────────────────────────────────────────────
export default function OrdersPage() {
  const { profile } = useAuthStore();
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [todayOrders, setTodayOrders] = useState<Order[]>([]);

  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const location = useLocation();
  const [orderType, setOrderType] = useState<OrderType>('DINE_IN');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [orderNote, setOrderNote] = useState('');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [placing, setPlacing] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [showTableSelector, setShowTableSelector] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);

  // Track whether the table selector was opened mid-checkout so we can
  // auto-submit the order immediately after the user picks a table.
  const pendingSubmitRef = useRef<{ payImmediately: boolean } | null>(null);

  useEffect(() => {
    const targetTableId = (location.state as any)?.tableId;
    if (targetTableId && tables.length > 0) {
      const match = tables.find(t => t.id === targetTableId);
      if (match) {
        setSelectedTable(match);
        setOrderType('DINE_IN');
      }
    }
  }, [location.state, tables]);

  const loadData = useCallback(async () => {
    try {
      const [cats, menuItems, tbls, orders] = await Promise.all([
        fetchCategories(),
        fetchMenuItems(),
        fetchTables(),
        fetchTodayOrders(),
      ]);
      setCategories(cats);
      setItems(menuItems);
      setTables(tbls);
      setTodayOrders(orders);
    } catch {
      toast.error('Failed to load menu data');
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useSocketEvent('order:new', () => { fetchTodayOrders().then(setTodayOrders); });
  useSocketEvent('order:statusChanged', () => { fetchTodayOrders().then(setTodayOrders); });
  useSocketEvent('table:updated', () => { fetchTables().then(setTables); });
  useSocketEvent('menu:updated', () => { fetchMenuItems().then(setItems); });

  const addToCart = (item: MenuItem) => {
    if (!item.isAvailable) { toast.error('Item is currently unavailable'); return; }
    setCart(prev => {
      const idx = prev.findIndex(c => c.menuItemId === item.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { menuItemId: item.id, name: item.name, unitPrice: item.price, quantity: 1 }];
    });
  };

  const updateQty = (menuItemId: string, delta: number) => {
    setCart(prev =>
      prev
        .map(c => c.menuItemId === menuItemId ? { ...c, quantity: c.quantity + delta } : c)
        .filter(c => c.quantity > 0)
    );
  };

  const removeFromCart = (menuItemId: string) => {
    setCart(prev => prev.filter(c => c.menuItemId !== menuItemId));
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((acc, c) => acc + c.unitPrice * c.quantity, 0);
  const taxAmount = (subtotal * TAX_RATE) / 100;
  const total = subtotal + taxAmount;

  // ── Core order submission — accepts explicit table to avoid stale state ──
  const submitOrder = async (table: Table | null, payImmediately: boolean) => {
    setPlacing(true);
    try {
      const newOrder = await createOrder({
        type: orderType,
        tableId: table?.id,
        customerName: customerName.trim() || undefined,
        note: orderNote.trim() || undefined,
        items: cart.map(c => ({ menuItemId: c.menuItemId, quantity: c.quantity, note: c.note })),
      });

      const tableLabel = table ? `Table ${table.name}` : orderType.replace('_', ' ');
      if (orderType === 'DINE_IN') {
        toast.success(`🍳 Order #${newOrder.orderNumber} sent to Kitchen! ${tableLabel} is now Occupied.`);
      } else {
        toast.success(`🍳 Order #${newOrder.orderNumber} placed & sent to Kitchen!`);
      }

      clearCart();
      setSelectedTable(null);
      setCustomerName('');
      setOrderNote('');
      fetchTodayOrders().then(setTodayOrders);
      fetchTables().then(setTables);

      if (payImmediately) {
        setPaymentOrder(newOrder);
      }
    } catch {
      toast.error('Failed to place order');
    } finally {
      setPlacing(false);
    }
  };

  const handlePlaceOrder = async (payImmediately = false) => {
    if (cart.length === 0) return;
    if (orderType === 'DINE_IN' && !selectedTable) {
      // Remember intent — auto-submit once the user picks a table
      pendingSubmitRef.current = { payImmediately };
      setShowTableSelector(true);
      return;
    }
    await submitOrder(selectedTable, payImmediately);
  };

  // Called when user picks a table from the dialog
  const handleTableSelect = (table: Table) => {
    setSelectedTable(table);
    const pending = pendingSubmitRef.current;
    if (pending !== null) {
      pendingSubmitRef.current = null;
      // Submit immediately with the just-selected table (state hasn't updated yet)
      submitOrder(table, pending.payImmediately);
    }
  };

  const handleVoid = async (order: Order) => {
    if (!confirm(`Are you sure you want to void order #${order.orderNumber}?`)) return;
    try {
      await voidOrder(order.id, 'Voided by staff');
      toast.success('Order voided');
      fetchTodayOrders().then(setTodayOrders);
      fetchTables().then(setTables);
    } catch {
      toast.error('Failed to void order');
    }
  };

  const handlePaymentSuccess = (paymentId?: string) => {
    const paidOrder = paymentOrder;
    setPaymentOrder(null);
    fetchTodayOrders().then(setTodayOrders);
    fetchTables().then(setTables);
    if (paidOrder) {
      handleViewReceipt(paidOrder);
    }
  };

  const handleViewReceipt = async (order: Order) => {
    try {
      const payment = await getPaymentByOrderId(order.id);
      setReceiptOrder(order);
      setReceiptPayment(payment);
    } catch {
      setReceiptOrder(order);
      setReceiptPayment(null);
    }
  };

  const filteredItems = items.filter(i => {
    const matchesCat = activeCategory === 'all' || i.categoryId === activeCategory;
    const matchesSearch = i.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  const activeOrdersCount = todayOrders.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status)).length;

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-[calc(100vh-108px)] overflow-hidden">
      {/* Left Menu / Food Catalog Panel */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 overflow-hidden">
        {/* Top bar: Category tabs & History toggle */}
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex gap-2 overflow-x-auto flex-1 no-scrollbar py-1">
            <Button
              variant={activeCategory === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveCategory('all')}
              className={`rounded-xl h-11 text-xs sm:text-sm font-bold px-4 shrink-0 transition-all ${
                activeCategory === 'all'
                  ? 'bg-primary text-primary-foreground shadow-md shadow-orange-500/20'
                  : 'bg-card/80 border-border/80 hover:bg-muted/60'
              }`}
            >
              🍽️ All Menu
            </Button>
            {categories.map(cat => (
              <Button
                key={cat.id}
                variant={activeCategory === cat.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveCategory(cat.id)}
                className={`rounded-xl h-11 text-xs sm:text-sm font-bold px-4 shrink-0 gap-2 transition-all ${
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground shadow-md shadow-orange-500/20'
                    : 'bg-card/80 border-border/80 hover:bg-muted/60'
                }`}
              >
                <span className="text-base">{cat.icon}</span>
                <span>{cat.name}</span>
              </Button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowHistory(true)}
            className="h-11 shrink-0 text-xs sm:text-sm gap-2 font-bold px-3.5 rounded-xl border-border/80 bg-card/80"
          >
            <History size={16} />
            <span className="hidden sm:inline">Orders</span>
            {activeOrdersCount > 0 && (
              <Badge variant="default" className="h-5 px-1.5 text-[11px] font-bold bg-primary text-primary-foreground">
                {activeOrdersCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Search filter input */}
        <div className="relative flex-shrink-0">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search menu items by name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10 h-11 bg-card/80 text-sm rounded-xl border-border/80"
          />
        </div>

        {/* Food Items Grid - Waiter & POS Ordering Cards */}
        <div className="flex-1 min-h-0 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5 pr-1 auto-rows-max pb-8">
          {filteredItems.map((item) => {
            const inCartItem = cart.find(c => c.menuItemId === item.id);
            const cartQty = inCartItem?.quantity ?? 0;
            const prepTime = item.preparationTime || 10;
            const isAvailable = item.isAvailable !== false;

            return (
              <Card
                key={item.id}
                onClick={() => {
                  if (isAvailable) addToCart(item);
                  else toast.error(`${item.name} is currently sold out in the kitchen!`);
                }}
                className={`cursor-pointer overflow-hidden rounded-2xl border-2 transition-all duration-200 select-none group flex flex-col justify-between min-h-[260px] ${
                  !isAvailable
                    ? 'opacity-60 bg-muted/40 border-border cursor-not-allowed'
                    : cartQty > 0
                      ? 'border-primary bg-card shadow-lg shadow-primary/10 ring-2 ring-primary/30'
                      : 'border-border/80 bg-card hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-md'
                }`}
              >
                {/* Top: Food Image & Waiter Badges */}
                <div className="relative h-32 sm:h-36 w-full overflow-hidden bg-muted shrink-0">
                  {item.imageUrl ? (
                    <>
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fb = e.currentTarget.parentElement?.querySelector('.img-fallback');
                          if (fb) fb.classList.remove('hidden');
                        }}
                      />
                      <div className="img-fallback hidden h-full w-full flex items-center justify-center text-4xl bg-muted">
                        {item.isVeg ? '🥗' : '🍗'}
                      </div>
                    </>
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-4xl bg-muted">
                      {item.isVeg ? '🥗' : '🍗'}
                    </div>
                  )}

                  {/* Gradient overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 pointer-events-none" />

                  {/* Top Left: Dietary Dot (Veg / Non-Veg) & Prep Time */}
                  <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                    {item.isVeg ? (
                      <div className="h-4.5 w-4.5 rounded-sm border-2 border-emerald-500 flex items-center justify-center p-0.5 bg-black/80 shadow-xs" title="Vegetarian">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      </div>
                    ) : (
                      <div className="h-4.5 w-4.5 rounded-sm border-2 border-red-500 flex items-center justify-center p-0.5 bg-black/80 shadow-xs" title="Non-Vegetarian">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                      </div>
                    )}

                    {/* Waiter Preparation Time Badge */}
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/75 text-zinc-200 border border-white/20 backdrop-blur-xs">
                      <Clock size={11} className="text-amber-400" /> ~{prepTime}m
                    </span>
                  </div>

                  {/* Top Right: Real-time Kitchen Availability Badge */}
                  <div className="absolute top-2.5 right-2.5 z-10">
                    {isAvailable ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-300 border border-emerald-500/40 backdrop-blur-xs shadow-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> In Stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-950/90 text-rose-300 border border-rose-500/50 backdrop-blur-xs shadow-xs">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Sold Out
                      </span>
                    )}
                  </div>
                </div>

                {/* Card Content & Details for Waiters */}
                <div className="p-3.5 flex flex-col justify-between flex-1 gap-2">
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-foreground tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
                      {item.name}
                    </h4>
                    {item.description ? (
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {item.description}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/70">
                        {item.isVeg ? 'Vegetarian dish' : 'Non-vegetarian dish'}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground pt-0.5">
                      <Clock size={12} className="text-primary/70 shrink-0" />
                      <span>Wait time: ~{prepTime} mins</span>
                    </div>
                  </div>

                  {/* Bottom: Exact Price & Fast Waiter Add Action */}
                  <div className="flex items-center justify-between pt-2 border-t border-border/60 mt-auto" onClick={e => e.stopPropagation()}>
                    <div className="flex flex-col">
                      <span className="text-base sm:text-lg font-black text-foreground font-mono leading-none">
                        ₹{item.price.toFixed(2)}
                      </span>
                    </div>

                    {!isAvailable ? (
                      <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground border-border bg-muted/50 px-2 py-1">
                        Sold Out
                      </Badge>
                    ) : cartQty > 0 ? (
                      <div className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl p-1 shadow-xs">
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, -1)}
                          className="h-6 w-6 rounded-lg bg-black/20 hover:bg-black/35 flex items-center justify-center font-black text-xs transition-colors cursor-pointer"
                          title="Decrease quantity"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="font-mono font-black text-xs px-1 min-w-4 text-center">
                          {cartQty}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.id, 1)}
                          className="h-6 w-6 rounded-lg bg-black/20 hover:bg-black/35 flex items-center justify-center font-black text-xs transition-colors cursor-pointer"
                          title="Increase quantity"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => addToCart(item)}
                        className="h-8 px-3 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs gap-1 cursor-pointer transition-all shadow-xs"
                      >
                        <Plus size={13} className="stroke-[3]" /> Add
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Right Order / Cart Drawer - Dedicated Waiter Ticket Panel */}
      <Card className="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col h-[560px] lg:h-full border-border/80 bg-card/95 backdrop-blur-md overflow-hidden shadow-2xl rounded-2xl">
        {/* Ticket Header & Table Assignment */}
        <div className="p-4 border-b border-border/80 flex flex-col gap-3 bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UtensilsCrossed size={18} className="text-primary" />
              <h3 className="font-extrabold text-base text-foreground">Table Order Ticket</h3>
            </div>
            {cart.length > 0 && (
              <Badge variant="secondary" className="text-xs font-bold px-2 py-0.5">
                {cart.reduce((s, c) => s + c.quantity, 0)} items
              </Badge>
            )}
          </div>

          {/* Dining Table Selector Button */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs font-bold text-muted-foreground uppercase tracking-wider">
              <span>Assigned Table</span>
              {selectedTable && (
                <span className="text-primary font-black">{selectedTable.capacity} Seats</span>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTableSelector(true)}
              className={`w-full justify-between h-12 text-sm font-black border-2 rounded-xl transition-all cursor-pointer ${
                selectedTable
                  ? 'border-primary/60 bg-primary/10 text-foreground hover:bg-primary/20'
                  : 'border-dashed border-primary/50 bg-background text-primary hover:bg-primary/5'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-base">{selectedTable ? '🪑' : '➕'}</span>
                <span>{selectedTable ? `Table ${selectedTable.name}` : 'Select Dining Table *'}</span>
              </span>
              <span className="text-xs font-semibold opacity-70 flex items-center gap-1">
                {selectedTable ? 'Change' : 'Choose Table'}
                <ChevronDown size={14} />
              </span>
            </Button>
          </div>

          {/* Optional Guest Name / Party Note */}
          <Input
            placeholder="Guest name / party info (Optional)..."
            value={customerName}
            onChange={e => setCustomerName(e.target.value)}
            className="h-9 text-xs bg-background/60 rounded-xl border-border/80"
          />
        </div>

        {/* Cart Item List */}
        <div className="cart-items flex-1 overflow-y-auto p-3.5 space-y-2.5">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground py-16">
              <div className="h-16 w-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-3 text-muted-foreground/40">
                <ShoppingCart size={32} />
              </div>
              <p className="text-sm font-bold text-foreground">Ticket is empty</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                Tap items on the left to add dishes to this table's order
              </p>
            </div>
          ) : (
            cart.map(item => (
              <div
                key={item.menuItemId}
                className="flex items-center justify-between p-3 rounded-xl border border-border/70 bg-background/60 hover:bg-background/90 transition-colors shadow-2xs"
              >
                <div className="min-w-0 flex-1 pr-3">
                  <p className="text-sm font-bold text-foreground truncate">{item.name}</p>
                  <p className="text-sm font-black text-primary mt-0.5 font-mono">
                    ₹{(item.unitPrice * item.quantity).toFixed(2)}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-card border-border/80 hover:bg-muted font-bold text-sm cursor-pointer"
                    onClick={() => updateQty(item.menuItemId, -1)}
                  >
                    <Minus size={14} />
                  </Button>
                  <span className="w-6 text-center text-sm font-black text-foreground">
                    {item.quantity}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg bg-card border-border/80 hover:bg-muted font-bold text-sm cursor-pointer"
                    onClick={() => updateQty(item.menuItemId, 1)}
                  >
                    <Plus size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-1 cursor-pointer"
                    onClick={() => removeFromCart(item.menuItemId)}
                    title="Remove item"
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer: Kitchen instructions & Dispatch */}
        <div className="p-4 border-t border-border/80 bg-card/95 space-y-3">
          {cart.length > 0 && (
            <Input
              placeholder="Kitchen instructions / chef note..."
              value={orderNote}
              onChange={e => setOrderNote(e.target.value)}
              className="h-10 text-xs sm:text-sm bg-background/60 rounded-xl border-border/80"
            />
          )}

          <div className="flex items-center justify-between py-1">
            <span className="text-xs text-muted-foreground font-semibold">
              {cart.reduce((s, c) => s + c.quantity, 0)} items on ticket
            </span>
            <span className="text-xl sm:text-2xl font-black text-foreground font-mono">
              ₹{total.toFixed(2)}
            </span>
          </div>

          <div className="flex gap-2">
            {cart.length > 0 && (
              <Button
                variant="outline"
                size="icon"
                onClick={clearCart}
                className="h-12 w-12 shrink-0 rounded-xl border-border/80 text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                title="Clear ticket"
              >
                <Trash2 size={16} />
              </Button>
            )}
            <Button
              className="flex-1 h-12 font-black gap-2 text-sm rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 cursor-pointer min-w-0"
              onClick={() => handlePlaceOrder(false)}
              disabled={cart.length === 0 || placing}
            >
              {placing ? (
                <>
                  <Loader2 size={16} className="animate-spin shrink-0" />
                  <span className="truncate">Sending to Kitchen...</span>
                </>
              ) : (
                <div className="flex items-center justify-center gap-2 font-black text-sm">
                  <Send size={16} />
                  <span>Send Order to Kitchen</span>
                </div>
              )}
            </Button>
          </div>

          {selectedTable ? (
            <p className="text-[11px] text-muted-foreground text-center font-medium">
              🍳 KOT will be sent directly to the kitchen display for <strong>Table {selectedTable.name}</strong>.
            </p>
          ) : (
            <p className="text-[11px] text-amber-500 text-center font-bold">
              ⚠️ Please pick a dining table before sending order to kitchen.
            </p>
          )}
        </div>
      </Card>

      {/* Table Selector Dialog */}
      <TableSelector
        open={showTableSelector}
        tables={tables}
        selected={selectedTable?.id ?? ''}
        onSelect={handleTableSelect}
        onClose={() => setShowTableSelector(false)}
      />

      {/* Order History Sheet */}
      <OrderHistorySheet
        open={showHistory}
        orders={todayOrders}
        onClose={() => setShowHistory(false)}
        onVoid={handleVoid}
        onPay={(o) => { setPaymentOrder(o); setShowHistory(false); }}
        onReceipt={(o) => { handleViewReceipt(o); setShowHistory(false); }}
      />

      {/* Payment Modal */}
      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Receipt Modal */}
      {receiptOrder && (
        <ReceiptModal
          order={receiptOrder}
          payment={receiptPayment}
          onClose={() => { setReceiptOrder(null); setReceiptPayment(null); }}
        />
      )}
    </div>
  );
}
