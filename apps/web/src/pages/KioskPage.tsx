import { useState, useEffect, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Utensils, ShoppingBag, Plus, Minus, Search, Clock,
  CheckCircle, ArrowRight, X, ChevronRight, Sparkles,
  QrCode, CreditCard, Banknote, RefreshCw, AlertCircle,
  Volume2, Flame, Award, Heart, ShieldCheck
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import {
  fetchKioskMenu,
  fetchKioskTables,
  placeKioskOrder,
  getKioskPayQR,
  getKioskOrderStatus,
  type KioskCategory,
  type KioskMenuItem,
  type KioskTable,
} from '../services/kiosk.service';
import { checkQRPaymentStatus } from '../services/payment.service';

interface CartItem {
  item: KioskMenuItem;
  quantity: number;
  note: string;
}

export default function KioskPage() {
  // ── Data State ─────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<KioskCategory[]>([]);
  const [tables, setTables] = useState<KioskTable[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Filter & Navigation State ──────────────────────────────────────────────
  const [selectedCatId, setSelectedCatId] = useState<string>('all');
  const [dietFilter, setDietFilter] = useState<'all' | 'veg' | 'nonveg'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Cart & Order State ─────────────────────────────────────────────────────
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [orderType, setOrderType] = useState<'DINE_IN' | 'TAKEAWAY'>('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [orderNote, setOrderNote] = useState('');

  // ── UI Modals / Screens ────────────────────────────────────────────────────
  const [showTray, setShowTray] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<KioskMenuItem | null>(null);
  const [customItemNote, setCustomItemNote] = useState('');

  // ── Payment & Confirmation State ───────────────────────────────────────────
  const [placingOrder, setPlacingOrder] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<any>(null);
  const [countdown, setCountdown] = useState(20);

  // ── Initial Data Load ──────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const [cats, tbls] = await Promise.all([
        fetchKioskMenu(),
        fetchKioskTables(),
      ]);
      setCategories(cats);
      setTables(tbls);
      if (tbls.length > 0) {
        setSelectedTableId(tbls[0].id);
      }
    } catch (err) {
      console.error('Failed to load kiosk menu:', err);
      toast.error('Unable to load menu. Please ask staff.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // ── Cart Calculations ──────────────────────────────────────────────────────
  const cartItems = useMemo(() => Object.values(cart), [cart]);
  const totalItemCount = useMemo(() => cartItems.reduce((sum, i) => sum + i.quantity, 0), [cartItems]);
  const subtotal = useMemo(() => cartItems.reduce((sum, i) => sum + i.item.price * i.quantity, 0), [cartItems]);
  const taxAmount = useMemo(() => subtotal * 0.05, [subtotal]); // 5% GST
  const grandTotal = useMemo(() => subtotal + taxAmount, [subtotal, taxAmount]);

  // ── Filtered Menu Items ────────────────────────────────────────────────────
  const displayedItems = useMemo(() => {
    let items: KioskMenuItem[] = [];

    if (selectedCatId === 'all') {
      items = categories.flatMap(c => c.items);
    } else {
      const cat = categories.find(c => c.id === selectedCatId);
      items = cat ? cat.items : [];
    }

    if (dietFilter === 'veg') {
      items = items.filter(i => i.isVeg);
    } else if (dietFilter === 'nonveg') {
      items = items.filter(i => !i.isVeg);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q) || (i.description && i.description.toLowerCase().includes(q)));
    }

    return items;
  }, [categories, selectedCatId, dietFilter, searchQuery]);

  // ── Cart Handlers ──────────────────────────────────────────────────────────
  const handleAddToCart = (item: KioskMenuItem, note: string = '') => {
    setCart(prev => {
      const existing = prev[item.id];
      if (existing) {
        return {
          ...prev,
          [item.id]: {
            ...existing,
            quantity: existing.quantity + 1,
            note: note || existing.note,
          },
        };
      }
      return {
        ...prev,
        [item.id]: {
          item,
          quantity: 1,
          note,
        },
      };
    });
    toast.success(`Added ${item.name}!`, { duration: 1500, position: 'bottom-center' });
  };

  const handleUpdateQuantity = (itemId: string, delta: number) => {
    setCart(prev => {
      const current = prev[itemId];
      if (!current) return prev;
      const nextQty = current.quantity + delta;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      }
      return {
        ...prev,
        [itemId]: {
          ...current,
          quantity: nextQty,
        },
      };
    });
  };

  // ── Place Order from Kiosk ─────────────────────────────────────────────────
  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) {
      toast.error('Your tray is empty!');
      return;
    }
    if (orderType === 'DINE_IN' && !selectedTableId) {
      toast.error('Please select an available dining table!');
      return;
    }

    setPlacingOrder(true);
    try {
      const payload = {
        type: orderType,
        tableId: orderType === 'DINE_IN' ? selectedTableId : undefined,
        customerName: customerName.trim() || 'Self-Order Guest',
        customerPhone: customerPhone.trim() || undefined,
        note: orderNote.trim() || undefined,
        items: cartItems.map(c => ({
          menuItemId: c.item.id,
          quantity: c.quantity,
          note: c.note || undefined,
        })),
      };

      const res = await placeKioskOrder(payload);
      const newOrder = (res as any)?.data ?? res;

      const selectedTable = tables.find(t => t.id === selectedTableId);
      setPlacedOrder({
        ...newOrder,
        type: orderType,
        tableName: orderType === 'DINE_IN' ? selectedTable?.name : undefined,
        totalAmount: grandTotal,
        items: cartItems.map(c => ({
          name: c.item.name,
          quantity: c.quantity,
          price: c.item.price,
        })),
      });

      // Clear tray
      setCart({});
      setShowTray(false);
      toast.success('Order placed! Sent to kitchen.');
    } catch (err: any) {
      console.error(err);
      toast.error(err?.response?.data?.message || 'Failed to place order. Please ask cashier.');
    } finally {
      setPlacingOrder(false);
    }
  };

  // ── Auto Return Countdown ──────────────────────────────────────────────────
  useEffect(() => {
    if (!placedOrder) return;
    setCountdown(20);
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleStartNewOrder();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [placedOrder]);

  const handleStartNewOrder = () => {
    setPlacedOrder(null);
    setShowTray(false);
    setCustomerName('');
    setCustomerPhone('');
    setOrderNote('');
    loadData();
  };

  return (
    <div className="min-h-screen bg-[#0d0f17] text-white flex flex-col font-sans select-none antialiased">
      {/* ── Kiosk Top Brand Header ────────────────────────────────────────── */}
      <header className="bg-[#141724]/90 backdrop-blur-md sticky top-0 z-40 border-b border-white/10 px-4 sm:px-8 py-3.5 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-rose-600 flex items-center justify-center text-white shadow-lg shadow-rose-950/40">
            <Flame className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white uppercase">
                QuickServe <span className="text-amber-400">Kiosk</span>
              </h1>
              <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
                Self Order
              </Badge>
            </div>
            <p className="text-xs text-zinc-400 font-medium hidden sm:block">Touch to pick food • Instant kitchen dispatch</p>
          </div>
        </div>

        {/* Order Type Toggle (Dine In / Takeaway) */}
        <div className="flex items-center gap-1.5 p-1 bg-white/[0.05] rounded-2xl border border-white/10">
          <button
            type="button"
            onClick={() => setOrderType('DINE_IN')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
              orderType === 'DINE_IN'
                ? 'bg-amber-500 text-slate-950 shadow-md scale-105'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>Dine In</span>
          </button>
          <button
            type="button"
            onClick={() => setOrderType('TAKEAWAY')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-black transition-all cursor-pointer ${
              orderType === 'TAKEAWAY'
                ? 'bg-rose-600 text-white shadow-md scale-105'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Takeaway</span>
          </button>
        </div>
      </header>

      {/* ── Main Kiosk Body ───────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Categories Sidebar (KFC/McD style) */}
        <aside className="w-24 sm:w-36 md:w-44 bg-[#11131c] border-r border-white/10 flex flex-col shrink-0 overflow-y-auto p-2 sm:p-3 space-y-2">
          <button
            type="button"
            onClick={() => setSelectedCatId('all')}
            className={`w-full p-2.5 sm:p-3.5 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer border ${
              selectedCatId === 'all'
                ? 'bg-gradient-to-b from-amber-500 to-rose-600 text-slate-950 font-black border-amber-400 shadow-lg scale-102'
                : 'bg-white/[0.02] border-white/5 text-zinc-400 hover:text-white hover:bg-white/[0.05]'
            }`}
          >
            <div className="text-2xl sm:text-3xl">🔥</div>
            <span className="text-xs sm:text-sm font-black leading-tight">All Menu</span>
          </button>

          {categories.map(cat => {
            const isSelected = selectedCatId === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCatId(cat.id)}
                className={`w-full p-2.5 sm:p-3.5 rounded-2xl flex flex-col items-center justify-center text-center gap-1.5 transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-gradient-to-b from-amber-500 to-rose-600 text-slate-950 font-black border-amber-400 shadow-lg scale-102'
                    : 'bg-white/[0.02] border-white/5 text-zinc-400 hover:text-white hover:bg-white/[0.05]'
                }`}
              >
                <div className="text-2xl sm:text-3xl">{cat.icon || '🍽️'}</div>
                <span className="text-xs sm:text-sm font-black leading-tight line-clamp-2">
                  {cat.name}
                </span>
                <span className={`text-[10px] font-bold ${isSelected ? 'text-slate-950' : 'text-zinc-400'}`}>
                  {cat.items.length} items
                </span>
              </button>
            );
          })}
        </aside>

        {/* Right Product Grid Area */}
        <main className="flex-1 flex flex-col overflow-y-auto p-4 sm:p-6 space-y-5 bg-[#0a0c13]">
          {/* Top Search & Dietary Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <Input
                placeholder="Search burgers, pizzas, drinks..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10 h-11 rounded-2xl bg-white/[0.04] border-white/10 text-white placeholder:text-zinc-500 text-sm focus:border-amber-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Veg / Non-Veg Filters */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDietFilter('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  dietFilter === 'all'
                    ? 'bg-white text-slate-950 border-white'
                    : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setDietFilter('veg')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  dietFilter === 'veg'
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-emerald-950/20 border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/40'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                Pure Veg
              </button>
              <button
                type="button"
                onClick={() => setDietFilter('nonveg')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                  dietFilter === 'nonveg'
                    ? 'bg-rose-500 text-white border-rose-400'
                    : 'bg-rose-950/20 border-rose-500/30 text-rose-400 hover:bg-rose-950/40'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-rose-400" />
                Non-Veg
              </button>
            </div>
          </div>

          {/* Menu Items Grid */}
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-zinc-400">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
              <span className="text-sm font-black">Loading Delicious Menu...</span>
            </div>
          ) : displayedItems.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-24 text-center gap-3">
              <div className="h-16 w-16 rounded-3xl bg-white/[0.04] flex items-center justify-center text-3xl">
                🔍
              </div>
              <div>
                <p className="text-base font-bold text-white">No items found</p>
                <p className="text-xs text-zinc-500 mt-1">Try changing category or clearing search</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-28">
              {displayedItems.map(item => {
                const inCart = cart[item.id];
                return (
                  <div
                    key={item.id}
                    className="group bg-[#141724] border border-white/10 hover:border-amber-500/50 rounded-3xl overflow-hidden flex flex-col justify-between shadow-xl transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl hover:shadow-amber-950/20"
                  >
                    {/* Item Image & Badges */}
                    <div className="relative aspect-4/3 w-full bg-slate-900 overflow-hidden">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-5xl bg-gradient-to-br from-slate-900 to-slate-800">
                          🍔
                        </div>
                      )}

                      {/* Veg / Non-Veg Indicator Badge */}
                      <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md p-1.5 rounded-lg border border-white/10 flex items-center gap-1.5 shadow-md">
                        <span className={`h-2.5 w-2.5 rounded-full ${item.isVeg ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                        <span className="text-[10px] font-black uppercase tracking-wider text-white">
                          {item.isVeg ? 'Veg' : 'Non-Veg'}
                        </span>
                      </div>

                      {/* Prep Time Badge */}
                      {item.preparationTime > 0 && (
                        <div className="absolute top-3 right-3 bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded-lg border border-white/10 flex items-center gap-1 text-[10px] font-bold text-zinc-300">
                          <Clock className="w-3 h-3 text-amber-400" />
                          <span>{item.preparationTime}m</span>
                        </div>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black text-white leading-tight line-clamp-1 group-hover:text-amber-400 transition-colors">
                          {item.name}
                        </h3>
                        {item.description && (
                          <p className="text-xs text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        )}
                      </div>

                      {/* Price & Add to Cart Action */}
                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <div className="flex flex-col">
                          <span className="text-[10px] text-zinc-400 uppercase font-black tracking-wider">Price</span>
                          <span className="text-lg font-black font-mono text-white">
                            ₹{Number(item.price).toFixed(2)}
                          </span>
                        </div>

                        {inCart ? (
                          <div className="flex items-center gap-2 bg-amber-500 text-slate-950 px-2 py-1.5 rounded-2xl shadow-md font-black">
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, -1)}
                              className="h-7 w-7 rounded-xl bg-slate-950 text-white flex items-center justify-center hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Minus className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                            <span className="min-w-6 text-center font-black text-sm">
                              {inCart.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQuantity(item.id, 1)}
                              className="h-7 w-7 rounded-xl bg-slate-950 text-white flex items-center justify-center hover:bg-slate-800 transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleAddToCart(item)}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-2xl px-5 h-9 shadow-lg shadow-amber-950/40 gap-1.5 transition-transform active:scale-95 cursor-pointer text-xs"
                          >
                            <Plus className="w-4 h-4 stroke-[3]" />
                            ADD
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      {/* ── Sticky Bottom Cart Tray Bar (McDonald's / KFC Style) ──────────── */}
      {totalItemCount > 0 && !placedOrder && (
        <aside className="fixed bottom-4 left-4 right-4 sm:left-12 sm:right-12 max-w-4xl mx-auto z-50">
          <div className="bg-gradient-to-r from-slate-950 via-[#181c2c] to-slate-950 border-2 border-amber-500/60 p-3 sm:p-4 rounded-3xl shadow-2xl shadow-black/80 flex items-center justify-between gap-4 backdrop-blur-xl animate-in slide-in-from-bottom-5">
            <div className="flex items-center gap-3.5 pl-2">
              <div className="h-12 w-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg font-black text-lg">
                {totalItemCount}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm sm:text-base font-black text-white">Your Tray Summary</span>
                  <Badge className="bg-white/10 text-zinc-300 text-[10px] font-bold">
                    {orderType.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5">
                  <span>Grand Total:</span>
                  <span className="font-mono font-black text-amber-400 text-sm">₹{grandTotal.toFixed(2)}</span>
                  <span className="text-[10px] text-zinc-400">(incl. 5% GST)</span>
                </div>
              </div>
            </div>

            <Button
              size="lg"
              onClick={() => setShowTray(true)}
              className="bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-slate-950 font-black text-sm sm:text-base px-6 h-12 rounded-2xl shadow-xl shadow-rose-950/50 gap-2 uppercase tracking-wide cursor-pointer active:scale-95 transition-all"
            >
              <span>View Tray &amp; Checkout</span>
              <ArrowRight className="w-5 h-5 stroke-[2.5]" />
            </Button>
          </div>
        </aside>
      )}

      {/* ── Checkout & Tray Drawer / Modal ────────────────────────────────── */}
      {showTray && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in">
          <div className="bg-[#121521] border border-white/10 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <span>🛒 Complete Your Order</span>
                </h2>
                <p className="text-xs text-zinc-400 mt-0.5">Review items &amp; choose settlement method</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTray(false)}
                className="h-9 w-9 rounded-xl bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Order Mode (Dine In Table vs Takeaway) */}
              <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/10 space-y-3">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-300">
                  Where will you eat?
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setOrderType('DINE_IN')}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      orderType === 'DINE_IN'
                        ? 'bg-amber-500/10 border-amber-500 text-amber-400 font-black ring-1 ring-amber-500/40'
                        : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Utensils className="w-5 h-5" />
                    <span className="text-xs">Dine In (Table Seating)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setOrderType('TAKEAWAY')}
                    className={`p-3 rounded-2xl border text-center flex flex-col items-center gap-1.5 transition-all cursor-pointer ${
                      orderType === 'TAKEAWAY'
                        ? 'bg-rose-500/10 border-rose-500 text-rose-400 font-black ring-1 ring-rose-500/40'
                        : 'border-white/10 bg-white/[0.02] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <ShoppingBag className="w-5 h-5" />
                    <span className="text-xs">Takeaway / To-Go</span>
                  </button>
                </div>

                {/* Table Picker if Dine In */}
                {orderType === 'DINE_IN' && (
                  <div className="pt-2 border-t border-white/5 space-y-1.5">
                    <label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                      Select Available Table
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                      {tables.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setSelectedTableId(t.id)}
                          className={`p-2 rounded-xl border text-center text-xs font-black transition-all cursor-pointer ${
                            selectedTableId === t.id
                              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                              : 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                          }`}
                        >
                          Table {t.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Items List */}
              <div className="space-y-2">
                <label className="text-xs font-black uppercase tracking-wider text-zinc-300">
                  Items in Tray ({totalItemCount})
                </label>
                <div className="divide-y divide-white/5 rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                  {cartItems.map(({ item, quantity, note }) => (
                    <div key={item.id} className="pt-2 first:pt-0 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${item.isVeg ? 'bg-emerald-400' : 'bg-rose-500'}`} />
                        <div className="min-w-0">
                          <p className="font-bold text-white truncate text-sm">{item.name}</p>
                          <span className="text-zinc-400 font-mono">₹{Number(item.price).toFixed(2)} each</span>
                          {note && (
                            <p className="text-[11px] text-amber-400 truncate">Note: {note}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-xl p-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, -1)}
                            className="h-6 w-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center font-black">{quantity}</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateQuantity(item.id, 1)}
                            className="h-6 w-6 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-mono font-black text-white text-sm w-16 text-right">
                          ₹{(item.price * quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Customer Contact */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase">Your Name (For Token)</label>
                  <Input
                    placeholder="e.g. Alex"
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="h-10 text-xs bg-white/5 border-white/10 text-white rounded-xl"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-zinc-300 uppercase">Mobile Number (Optional)</label>
                  <Input
                    placeholder="For pickup SMS alert"
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="h-10 text-xs bg-white/5 border-white/10 text-white rounded-xl"
                  />
                </div>
              </div>

              {/* Payment Notice: Pay at Counter */}
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs font-black text-amber-300">
                    {orderType === 'DINE_IN' ? 'Pay After Dining at Counter' : 'Pay at Counter on Pickup'}
                  </div>
                  <div className="text-[11px] text-zinc-300 mt-0.5 leading-snug">
                    {orderType === 'DINE_IN'
                      ? 'No upfront payment required! Enjoy your meal first, then pay your bill with the cashier at the counter.'
                      : 'No payment needed on kiosk! Collect your food and pay via Cash, Card, or UPI directly with the cashier at the pickup counter.'}
                  </div>
                </div>
              </div>

              {/* Bill Totals Breakdown */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1.5 text-xs">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal</span>
                  <span className="font-mono text-zinc-300">₹{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>GST &amp; Restaurant Tax (5%)</span>
                  <span className="font-mono text-zinc-300">₹{taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-black text-sm text-white pt-2 border-t border-white/10">
                  <span>Amount to Pay</span>
                  <span className="font-mono text-amber-400 text-lg">₹{grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Drawer Footer CTA */}
            <div className="p-5 border-t border-white/10 bg-white/[0.02]">
              <Button
                onClick={handlePlaceOrder}
                disabled={placingOrder}
                className="w-full h-12 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-slate-950 font-black text-base rounded-2xl shadow-xl shadow-rose-950/50 gap-2 cursor-pointer uppercase tracking-wider active:scale-95 transition-all"
              >
                {placingOrder ? (
                  <span>Sending to Kitchen...</span>
                ) : (
                  <>
                    <span>Confirm &amp; Send to Kitchen • ₹{grandTotal.toFixed(2)}</span>
                    <ArrowRight className="w-5 h-5 stroke-[2.5]" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Order Placed / Token Screen (Counter Payment Flow) ────── */}
      {placedOrder && (
        <div className="fixed inset-0 z-50 bg-[#0a0c14]/95 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center animate-in zoom-in-95">
          <div className="w-full max-w-lg bg-[#141724] border-2 border-amber-500/40 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl shadow-black relative overflow-hidden text-left">
            {/* Top decorative glow */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

            {/* Success icon + Order Number */}
            <div className="text-center space-y-2">
              <div className="h-16 w-16 mx-auto rounded-3xl bg-emerald-500/15 border-2 border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg">
                <CheckCircle className="h-9 w-9 stroke-[2.5]" />
              </div>
              <span className="text-xs font-black uppercase tracking-widest text-emerald-400 block">
                Order Placed Successfully!
              </span>
              <h2 className="text-4xl sm:text-5xl font-black text-white tracking-tight font-mono">
                #{placedOrder.orderNumber}
              </h2>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-bold text-amber-400">
                {placedOrder.type === 'DINE_IN' ? (
                  <>
                    <Utensils className="w-3.5 h-3.5" />
                    <span>Dine-In • Table {placedOrder.tableName || placedOrder.table?.name || 'Selected Table'}</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>Takeaway • Pickup Counter</span>
                  </>
                )}
              </div>
            </div>

            {/* Clear Payment & Next Steps Banner */}
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
              <div className="flex items-center gap-2 text-amber-400 font-black text-xs sm:text-sm">
                <Banknote className="w-4 h-4 shrink-0" />
                <span>
                  {placedOrder.type === 'DINE_IN' ? 'Pay at Counter After Dining' : 'Pay at Cashier Counter on Pickup'}
                </span>
              </div>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {placedOrder.type === 'DINE_IN' ? (
                  <>
                    Please take your seat at <strong>Table {placedOrder.tableName || placedOrder.table?.name}</strong>. Your food is being prepared and will be served shortly! You can pay your bill of <strong className="text-amber-400">₹{placedOrder.totalAmount?.toFixed(2)}</strong> with the cashier at the counter after eating.
                  </>
                ) : (
                  <>
                    Please collect your food at the <strong>Pickup Counter</strong> when Token <strong className="text-amber-400">#{placedOrder.orderNumber}</strong> is called. Please pay <strong className="text-amber-400">₹{placedOrder.totalAmount?.toFixed(2)}</strong> (Cash, UPI, or Card) with the counter cashier upon collecting your food.
                  </>
                )}
              </p>
            </div>

            {/* Order Items Summary */}
            {placedOrder.items && placedOrder.items.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
                <div className="flex items-center justify-between text-xs text-zinc-400 font-bold uppercase tracking-wider">
                  <span>Items Ordered ({placedOrder.items.reduce((s: number, i: any) => s + i.quantity, 0)})</span>
                  <span className="font-mono text-amber-400 text-sm font-black">Total: ₹{placedOrder.totalAmount?.toFixed(2)}</span>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1 divide-y divide-white/5">
                  {placedOrder.items.map((it: any, idx: number) => (
                    <div key={idx} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                      <span className="text-white font-medium truncate">
                        <span className="text-amber-400 font-bold mr-1.5">{it.quantity}×</span>
                        {it.name || it.menuItemName}
                      </span>
                      <span className="font-mono text-zinc-300 shrink-0 ml-2">
                        ₹{((it.price || it.unitPrice || 0) * it.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer Action */}
            <div className="pt-2">
              <Button
                onClick={handleStartNewOrder}
                className="w-full h-12 bg-white text-slate-950 hover:bg-zinc-200 font-black text-sm rounded-2xl shadow-lg cursor-pointer uppercase tracking-wider"
              >
                <span>Done • Start New Order {countdown > 0 ? `(${countdown}s)` : ''}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
