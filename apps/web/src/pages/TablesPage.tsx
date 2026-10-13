import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Pencil, Trash2, LayoutGrid, Map,
  Users, Database, CheckCircle, Clock, Sparkles, MoreHorizontal,
  Layers, Wand2, Receipt, ArrowRight, UtensilsCrossed, Calendar,
  ShoppingBag, Check, CreditCard,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  subscribeToTables, fetchTables, createTable, updateTable,
  updateTableStatus, deleteTable, seedTables,
} from '../services/table.service';
import {
  fetchOrdersByTable, fetchActiveOrders, subscribeToActiveOrders,
} from '../services/order.service';
import { getPaymentByOrderId } from '../services/payment.service';
import { useSocketEvent } from '../lib/socket';
import PaymentModal from '../components/PaymentModal';
import ReceiptModal from '../components/ReceiptModal';
import type { Table, Order, Payment } from '../lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetDescription,
  SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── Status config ───────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  AVAILABLE: { label: 'Available', color: '#22c55e', icon: CheckCircle, bg: 'rgba(34,197,94,0.14)', variant: 'default' as const },
  OCCUPIED:  { label: 'Occupied',  color: '#f97316', icon: Clock,        bg: 'rgba(249,115,22,0.14)', variant: 'secondary' as const },
  RESERVED:  { label: 'Reserved',  color: '#6366f1', icon: Clock,        bg: 'rgba(99,102,241,0.14)', variant: 'secondary' as const },
  CLEANING:  { label: 'Cleaning',  color: '#f59e0b', icon: Sparkles,     bg: 'rgba(245,158,11,0.14)', variant: 'outline' as const },
} as const;

type TableStatus = keyof typeof STATUS_CONFIG;

const ORDER_STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Pending',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
  CONFIRMED: { label: 'Confirmed', color: '#6366f1', bg: 'rgba(99,102,241,0.15)' },
  PREPARING: { label: 'Preparing', color: '#f97316', bg: 'rgba(249,115,22,0.15)' },
  READY:     { label: 'Ready',     color: '#22c55e', bg: 'rgba(34,197,94,0.15)' },
  SERVED:    { label: 'Served',    color: '#06b6d4', bg: 'rgba(6,182,212,0.15)' },
  COMPLETED: { label: 'Completed', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
  CANCELLED: { label: 'Cancelled', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
  VOIDED:    { label: 'Voided',    color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
};

// Constants for floor plan sizing
const TABLE_WIDTH = 148;
const TABLE_HEIGHT = 96;
const GRID_STEP = 24;

/** Calculate clean non-overlapping grid layout for tables in a section */
function calculateAutoLayout(tables: Table[], canvasWidth = 900) {
  const pos: Record<string, { x: number; y: number }> = {};
  const paddingX = 32;
  const paddingY = 24;
  const colStride = 176; // 148px width + 28px gap
  const rowStride = 124; // 96px height + 28px gap
  const cols = Math.max(1, Math.floor((canvasWidth - paddingX * 2) / colStride));

  tables.forEach((t, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    pos[t.id] = {
      x: paddingX + col * colStride,
      y: paddingY + row * rowStride,
    };
  });
  return pos;
}

// ── Table Orders Viewer Drawer (Sheet) ──────────────────────────────────────
function TableOrdersSheet({
  open,
  table,
  onClose,
  onStatusChange,
  onPayOrder,
  onViewReceipt,
}: {
  open: boolean;
  table: Table | null;
  onClose: () => void;
  onStatusChange: (table: Table, status: TableStatus) => void;
  onPayOrder: (order: Order) => void;
  onViewReceipt: (order: Order) => void;
}) {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'active' | 'completed' | 'all'>('active');

  useEffect(() => {
    if (open && table) {
      setLoading(true);
      fetchOrdersByTable(table.id)
        .then(data => {
          setOrders(data);
          const active = data.filter(o => !['COMPLETED', 'CANCELLED', 'VOIDED'].includes(o.status));
          if (active.length === 0 && data.length > 0) {
            setFilter('all');
          } else {
            setFilter('active');
          }
        })
        .catch(() => toast.error('Failed to load table orders'))
        .finally(() => setLoading(false));
    } else {
      setOrders([]);
    }
  }, [open, table]);

  if (!table) return null;

  const cfg = STATUS_CONFIG[table.status as TableStatus] ?? STATUS_CONFIG.AVAILABLE;

  const activeOrders = orders.filter(o => !['COMPLETED', 'CANCELLED', 'VOIDED'].includes(o.status));
  const completedOrders = orders.filter(o => ['COMPLETED'].includes(o.status));

  const filteredOrders = filter === 'active'
    ? activeOrders
    : filter === 'completed'
    ? completedOrders
    : orders;

  const totalActiveBill = activeOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const primaryActiveOrder = activeOrders[0] ?? null;
  const allActiveItems = activeOrders.flatMap(o => o.items ?? []);
  const activeSubtotal = activeOrders.reduce((sum, o) => sum + (o.subtotal || o.totalAmount), 0);
  const activeTax = activeOrders.reduce((sum, o) => sum + (o.taxAmount || 0), 0);

  const unifiedActiveOrder: Order | null = primaryActiveOrder ? {
    ...primaryActiveOrder,
    items: allActiveItems,
    subtotal: activeSubtotal,
    taxAmount: activeTax,
    totalAmount: totalActiveBill,
  } : null;

  const handleNewOrder = () => {
    onClose();
    navigate('/orders', { state: { tableId: table.id } });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col bg-card border-l border-border text-foreground">
        {/* Drawer Header */}
        <SheetHeader className="p-6 border-b border-border bg-muted/30">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 text-white shadow-lg shrink-0"
                style={{ borderColor: cfg.color, backgroundColor: `${cfg.color}20` }}
              >
                <UtensilsCrossed className="h-6 w-6" style={{ color: cfg.color }} />
              </div>
              <div>
                <SheetTitle className="text-xl font-black text-foreground flex items-center gap-2">
                  Table {table.name}
                </SheetTitle>
                <SheetDescription className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                  <span>{table.floorSection ?? 'General Section'}</span>
                  <span>•</span>
                  <span>{table.capacity} Guest Seats</span>
                </SheetDescription>
              </div>
            </div>

            {/* Quick Status Dropdown Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all hover:scale-105 cursor-pointer shadow-xs"
                  style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: `${cfg.color}40` }}
                >
                  <span className="h-2 w-2 rounded-full animate-pulse" style={{ backgroundColor: cfg.color }} />
                  {cfg.label}
                  <MoreHorizontal className="h-3.5 w-3.5 ml-0.5 opacity-70" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44 p-1.5 bg-popover border-border">
                <DropdownMenuLabel className="text-xs font-bold px-2 py-1 text-foreground">Set Table Status</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                {(Object.keys(STATUS_CONFIG) as TableStatus[]).map(s => {
                  const scfg = STATUS_CONFIG[s];
                  const SIcon = scfg.icon;
                  return (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => onStatusChange(table, s)}
                      className="text-xs font-semibold cursor-pointer gap-2 py-1.5 px-2 rounded-md hover:bg-muted"
                    >
                      <SIcon size={13} style={{ color: scfg.color }} />
                      <span>{scfg.label}</span>
                      {table.status === s && <span className="ml-auto text-xs font-bold text-primary">✓</span>}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Active Bill Summary Banner */}
          {activeOrders.length > 0 && (
            <div className="mt-4 p-3 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-orange-400" />
                <span className="font-bold text-orange-300">
                  {activeOrders.length} Active {activeOrders.length === 1 ? 'Order' : 'Orders'}
                </span>
              </div>
              <div className="font-mono font-black text-sm text-orange-400">
                Total: ₹{totalActiveBill.toFixed(2)}
              </div>
            </div>
          )}

          {/* Filter Pills */}
          <div className="flex items-center gap-2 mt-4 pt-1">
            <button
              type="button"
              onClick={() => setFilter('active')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'active'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Active / Served ({activeOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('completed')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'completed'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              Past ({completedOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-primary text-primary-foreground shadow-xs'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({orders.length})
            </button>
          </div>
        </SheetHeader>

        {/* Drawer Body — Orders List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-400">
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-xs font-medium">Fetching orders for {table.name}...</span>
            </div>
          ) : filter === 'active' ? (
            /* ── Single Consolidated Table Bill ── */
            unifiedActiveOrder ? (
              <Card className="border-2 border-emerald-500/40 bg-card shadow-xl rounded-2xl overflow-hidden">
                {/* Bill Header */}
                <div className="flex items-center justify-between p-4 border-b border-border bg-emerald-500/5">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 font-mono font-black text-xs border border-emerald-500/30">
                      #{unifiedActiveOrder.orderNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-sm sm:text-base text-foreground">Table {table.name} Bill</span>
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] font-black uppercase">
                          Active Tab
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                        <Clock className="h-3 w-3" />
                        <span>{new Date(unifiedActiveOrder.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        {unifiedActiveOrder.customerName && (
                          <>
                            <span>•</span>
                            <span className="text-foreground font-bold">Guest: {unifiedActiveOrder.customerName}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider block font-bold">Total Bill</span>
                    <span className="font-mono font-black text-emerald-400 text-base sm:text-lg leading-tight">₹{totalActiveBill.toFixed(2)}</span>
                  </div>
                </div>

                {/* All Dishes in One Single Unified List */}
                <div className="p-4 space-y-3">
                  <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground flex items-center justify-between border-b border-border pb-2">
                    <span>Ordered Dishes &amp; Drinks</span>
                    <span>{allActiveItems.length} items</span>
                  </p>

                  <div className="space-y-2.5 divide-y divide-border max-h-[300px] overflow-y-auto pr-1">
                    {allActiveItems.map((item, idx) => (
                      <div key={item.id || idx} className="pt-2.5 first:pt-0 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-muted text-xs font-black text-primary shrink-0">
                            {item.quantity}×
                          </span>
                          <div className="min-w-0">
                            <span className="font-bold text-foreground truncate block text-sm">
                              {item.menuItemName}
                            </span>
                            {item.note && (
                              <span className="text-[10px] text-amber-400 block truncate">
                                Note: {item.note}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider bg-muted text-muted-foreground border border-border">
                            {item.status}
                          </span>
                          <span className="font-mono font-black text-foreground text-sm">
                            ₹{(item.totalPrice ?? item.unitPrice * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Single Consolidated Financial Breakdown */}
                  <div className="pt-3 border-t border-border space-y-1.5 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Items Subtotal</span>
                      <span className="font-mono text-foreground">₹{activeSubtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>GST / Restaurant Tax (5%)</span>
                      <span className="font-mono text-foreground">₹{activeTax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-black text-foreground text-base pt-2 border-t border-border">
                      <span>Total Due</span>
                      <span className="font-mono text-emerald-400 text-lg">₹{totalActiveBill.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Single Settle Action */}
                  <Button
                    size="lg"
                    onClick={() => { onClose(); onPayOrder(unifiedActiveOrder); }}
                    className="w-full mt-3 font-black text-sm bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white gap-2 rounded-2xl shadow-lg shadow-emerald-950/50 cursor-pointer h-12 uppercase tracking-wide active:scale-98 transition-all"
                  >
                    <CreditCard size={16} /> Settle Bill &amp; Free Table — ₹{totalActiveBill.toFixed(2)}
                  </Button>
                </div>
              </Card>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3 border border-dashed border-border rounded-2xl p-8">
                <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-2xl">
                  🍽️
                </div>
                <div>
                  <p className="font-bold text-sm text-foreground">No Active Orders Found</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Table {table.name} currently has no active bill or served items.
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={handleNewOrder}
                  className="mt-2 font-bold text-xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 rounded-xl cursor-pointer"
                >
                  <Plus size={14} /> Create Order for Table {table.name}
                </Button>
              </div>
            )
          ) : filteredOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground gap-3 border border-dashed border-border rounded-2xl p-8">
              <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-2xl">
                📜
              </div>
              <div>
                <p className="font-bold text-sm text-foreground">No Past Orders Found</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  No past completed order history for Table {table.name}.
                </p>
              </div>
            </div>
          ) : (
            /* ── Past Completed Orders List ── */
            filteredOrders.map(order => {
              const statusCfg = ORDER_STATUS_CONFIG[order.status] ?? ORDER_STATUS_CONFIG.PENDING;
              const formattedTime = new Date(order.createdAt).toLocaleTimeString([], {
                hour: '2-digit', minute: '2-digit',
              });

              return (
                <Card
                  key={order.id}
                  className="border border-border bg-card shadow-sm rounded-2xl overflow-hidden hover:border-border/80 transition-all"
                >
                  <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary font-mono font-black text-xs">
                        #{order.orderNumber}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">Order #{order.orderNumber}</span>
                          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                            {order.type.replace('_', ' ')}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                          <Clock className="h-3 w-3" />
                          <span>{formattedTime}</span>
                        </div>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className="text-[10px] font-bold px-2.5 py-0.5 rounded-full border shadow-2xs"
                      style={{ backgroundColor: statusCfg.bg, color: statusCfg.color, borderColor: `${statusCfg.color}40` }}
                    >
                      {statusCfg.label}
                    </Badge>
                  </div>

                  <div className="p-4 space-y-2.5">
                    <div className="space-y-1.5 divide-y divide-border">
                      {(order.items ?? []).map((item, idx) => (
                        <div key={item.id || idx} className="pt-1.5 first:pt-0 flex items-center justify-between text-xs">
                          <span className="text-foreground">{item.quantity}× {item.menuItemName}</span>
                          <span className="font-mono text-muted-foreground">₹{(item.totalPrice ?? item.unitPrice * item.quantity).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pt-2 border-t border-border flex justify-between font-black text-foreground text-xs">
                      <span>Total Settled</span>
                      <span className="font-mono text-primary">₹{order.totalAmount.toFixed(2)}</span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { onClose(); onViewReceipt(order); }}
                      className="w-full mt-2 font-bold text-xs gap-1.5 rounded-xl hover:bg-muted cursor-pointer h-8"
                    >
                      <Receipt size={13} /> View Receipt
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {/* Drawer Footer Actions */}
        <SheetFooter className="p-4 border-t border-border bg-muted/30 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 rounded-xl text-xs font-bold border-border hover:bg-muted cursor-pointer"
          >
            Close
          </Button>
          {unifiedActiveOrder && (
            <Button
              onClick={() => { onClose(); onPayOrder(unifiedActiveOrder); }}
              className="flex-1 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-md shadow-emerald-900/30 cursor-pointer h-10"
            >
              <CreditCard size={14} /> Settle Bill (₹{totalActiveBill.toFixed(2)})
            </Button>
          )}
          <Button
            onClick={handleNewOrder}
            className="flex-1 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-md shadow-orange-500/25 cursor-pointer"
          >
            <Plus size={14} /> Add Items
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// ── Table Form Dialog ────────────────────────────────────────────────────────
function TableDialog({
  open,
  table,
  sections,
  allTables,
  onClose,
}: {
  open: boolean;
  table: Table | null;
  sections: string[];
  allTables: Table[];
  onClose: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    capacity: '4',
    floorSection: 'Ground Floor',
    newSection: '',
  });
  const [addingSection, setAddingSection] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({
        name: table?.name ?? '',
        capacity: table?.capacity?.toString() ?? '4',
        floorSection: table?.floorSection ?? sections[0] ?? 'Ground Floor',
        newSection: '',
      });
      setAddingSection(false);
    }
  }, [open, table, sections]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setLoading(true);
    const section = addingSection && form.newSection.trim()
      ? form.newSection.trim() : form.floorSection;
    try {
      if (table) {
        await updateTable(table.id, {
          name: form.name,
          capacity: parseInt(form.capacity),
          floorSection: section,
        } as Partial<Table>);
        toast.success('Table updated');
      } else {
        const sectionTables = allTables.filter(t => (t.floorSection ?? 'Ground Floor') === section);
        const col = sectionTables.length % 4;
        const row = Math.floor(sectionTables.length / 4);
        await createTable({
          name: form.name,
          capacity: parseInt(form.capacity),
          floorSection: section,
          posX: 40 + col * 184,
          posY: 40 + row * 132,
        });
        toast.success('Table created');
      }
      onClose();
    } catch {
      toast.error('Failed to save table');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{table ? 'Edit Table' : 'New Table'}</DialogTitle>
          <DialogDescription>
            Configure table name, seat capacity, and floor location.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Table Name *</label>
              <Input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. T-1, Bar-2"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Capacity (seats) *</label>
              <Input
                type="number"
                min="1"
                max="30"
                value={form.capacity}
                onChange={e => set('capacity', e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Floor Section</label>
            {!addingSection ? (
              <div className="flex gap-2">
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.floorSection}
                  onChange={e => set('floorSection', e.target.value)}
                >
                  {sections.map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="Ground Floor">Ground Floor</option>
                  <option value="First Floor">First Floor</option>
                  <option value="Rooftop">Rooftop</option>
                  <option value="Outdoor Terrace">Outdoor Terrace</option>
                  <option value="Bar">Bar</option>
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddingSection(true)}
                  className="shrink-0 h-10"
                >
                  + New
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  value={form.newSection}
                  onChange={e => set('newSection', e.target.value)}
                  placeholder="Section name (e.g. VIP Lounge)"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setAddingSection(false)}
                  className="shrink-0 h-10"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Table'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Floor Section Canvas ────────────────────────────────────────────────────
function SectionCanvas({
  section,
  tables,
  activeOrders,
  onTableClick,
  onStatusChange,
  onEditClick,
  onDelete,
}: {
  section: string;
  tables: Table[];
  activeOrders: Order[];
  onTableClick: (t: Table) => void;
  onStatusChange: (t: Table, s: TableStatus) => void;
  onEditClick: (t: Table) => void;
  onDelete?: (t: Table) => void;
}) {
  const [dragging, setDragging] = useState<{ id: string; startX: number; startY: number; offsetX: number; offsetY: number } | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragMovedRef = useRef(false);

  // Sync and detect overlaps automatically on table data update
  useEffect(() => {
    const pos: Record<string, { x: number; y: number }> = {};
    let needsAutoPosition = false;

    tables.forEach(t => {
      const rawX = t.posX ?? 40;
      const rawY = t.posY ?? 40;
      pos[t.id] = { x: Math.max(24, rawX), y: Math.max(24, rawY) };
    });

    // Check if any tables overlap in bounding box
    const ids = tables.map(t => t.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const p1 = pos[ids[i]];
        const p2 = pos[ids[j]];
        if (p1 && p2 && Math.abs(p1.x - p2.x) < TABLE_WIDTH && Math.abs(p1.y - p2.y) < TABLE_HEIGHT) {
          needsAutoPosition = true;
          break;
        }
      }
      if (needsAutoPosition) break;
    }

    if (needsAutoPosition) {
      const autoPos = calculateAutoLayout(tables, canvasRef.current?.clientWidth || 900);
      setPositions(autoPos);
      tables.forEach(t => {
        const p = autoPos[t.id];
        if (p && (p.x !== t.posX || p.y !== t.posY)) {
          updateTable(t.id, { posX: p.x, posY: p.y } as Partial<Table>).catch(() => {});
        }
      });
    } else {
      setPositions(pos);
    }
  }, [tables]);

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    // If clicked on an interactive button or menu, skip drag tracking
    if ((e.target as HTMLElement).closest('button, [role="menuitem"], a, select, input')) {
      return;
    }
    e.preventDefault();
    if (!canvasRef.current) return;
    dragMovedRef.current = false;
    const rect = canvasRef.current.getBoundingClientRect();
    const cur = positions[id] ?? { x: 40, y: 40 };
    setDragging({
      id,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left - cur.x,
      offsetY: e.clientY - rect.top - cur.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    if (Math.abs(e.clientX - dragging.startX) > 4 || Math.abs(e.clientY - dragging.startY) > 4) {
      dragMovedRef.current = true;
    }

    const rect = canvasRef.current.getBoundingClientRect();
    const rawX = e.clientX - rect.left - dragging.offsetX;
    const rawY = e.clientY - rect.top - dragging.offsetY;

    // Snap to 24px grid dots
    const snappedX = Math.round(rawX / GRID_STEP) * GRID_STEP;
    const snappedY = Math.round(rawY / GRID_STEP) * GRID_STEP;

    const x = Math.max(24, Math.min(snappedX, rect.width - TABLE_WIDTH - 24));
    const y = Math.max(24, Math.min(snappedY, canvasHeight - TABLE_HEIGHT - 24));
    setPositions(p => ({ ...p, [dragging.id]: { x, y } }));
  };

  const handleMouseUp = async (table: Table) => {
    if (dragging) {
      if (!dragMovedRef.current) {
        // Simple click without drag movement — open table order viewer
        onTableClick(table);
      } else {
        // Drag action completed — persist position to backend
        const pos = positions[dragging.id];
        if (pos) {
          await updateTable(dragging.id, { posX: pos.x, posY: pos.y } as Partial<Table>);
        }
      }
      setDragging(null);
    }
  };

  const handleAutoArrange = async () => {
    const width = canvasRef.current?.clientWidth || 900;
    const autoPos = calculateAutoLayout(tables, width);
    setPositions(autoPos);
    toast.success(`Arranged ${section} tables in grid`);
    for (const t of tables) {
      const p = autoPos[t.id];
      if (p) {
        await updateTable(t.id, { posX: p.x, posY: p.y } as Partial<Table>);
      }
    }
  };

  // Fit canvas tightly to content - dynamically scales with table count and positions
  const maxTableY = tables.length === 0 ? 0 : Math.max(
    ...tables.map(t => (positions[t.id]?.y ?? t.posY ?? 24) + TABLE_HEIGHT + 24)
  );
  const rowStride = 124;
  const colStride = 176;
  const canvasWidthEst = 900;
  const cols = Math.max(1, Math.floor((canvasWidthEst - 64) / colStride));
  const rows = Math.ceil(tables.length / cols);
  const naturalHeight = rows * rowStride + 40;
  const canvasHeight = Math.max(130, Math.max(maxTableY, naturalHeight));

  const availableCount = tables.filter(t => t.status === 'AVAILABLE').length;
  const occupiedCount = tables.filter(t => t.status === 'OCCUPIED').length;

  return (
    <Card className="overflow-hidden border-border/80 bg-card/80 shadow-md rounded-2xl">
      {/* Section Canvas Header Bar */}
      <div className="flex flex-wrap items-center justify-between px-5 py-3.5 border-b border-border/60 bg-muted/40 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/20 text-primary border border-primary/30">
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm uppercase tracking-wider text-foreground">{section}</span>
              <Badge variant="outline" className="text-[10px] font-bold px-2 py-0 border-border/70">
                {tables.length} {tables.length === 1 ? 'Table' : 'Tables'}
              </Badge>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Quick Stats Pill */}
          <div className="hidden sm:flex items-center gap-2.5 text-xs font-semibold text-muted-foreground bg-background/50 px-3 py-1.5 rounded-xl border border-border/60">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              {availableCount} Available
            </span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5 text-orange-400">
              <span className="h-2 w-2 rounded-full bg-orange-400" />
              {occupiedCount} Occupied
            </span>
          </div>

          {/* Auto Arrange Button */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAutoArrange}
            className="h-8 gap-1.5 text-xs font-bold rounded-xl border-border/80 hover:bg-muted/80 shadow-2xs cursor-pointer"
            title="Auto align tables into a non-overlapping grid"
          >
            <Wand2 className="h-3.5 w-3.5 text-primary" /> Auto Arrange
          </Button>
        </div>
      </div>

      {/* Interactive Dot Grid Canvas */}
      <div
        ref={canvasRef}
        className="relative w-full overflow-hidden select-none transition-all duration-200"
        style={{
          minHeight: `${canvasHeight}px`,
          backgroundColor: 'var(--canvas-bg, hsl(var(--muted)/0.3))',
          backgroundImage: 'radial-gradient(circle, var(--canvas-dot, hsl(var(--foreground)/0.08)) 1.2px, transparent 1.2px)',
          backgroundSize: '24px 24px',
        }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setDragging(null)}
      >
        {tables.map(table => {
          const pos = positions[table.id] ?? { x: table.posX ?? 40, y: table.posY ?? 40 };
          const cfg = STATUS_CONFIG[table.status as TableStatus] ?? STATUS_CONFIG.AVAILABLE;
          const isCurrentDragging = dragging?.id === table.id;

          // Check if table has active order
          const activeOrder = activeOrders.find(o => o.tableId === table.id);

          // Number of chair notches based on table capacity
          const seatCount = table.capacity || 4;
          const topBottomSeats = Math.min(Math.max(1, Math.floor(seatCount / 2)), 3);

          return (
            <div
              key={table.id}
              className={`absolute w-[148px] h-[96px] rounded-2xl p-2.5 flex flex-col justify-between transition-all select-none border-2 cursor-pointer ${
                isCurrentDragging
                  ? 'scale-[1.04] shadow-2xl ring-2 ring-primary z-40 cursor-grabbing'
                  : 'shadow-md hover:shadow-xl hover:-translate-y-0.5 hover:ring-2 hover:ring-primary/40 z-10 group'
              }`}
              style={{
                left: pos.x,
                top: pos.y,
                borderColor: cfg.color,
                backgroundColor: `${cfg.color}15`,
                backdropFilter: 'blur(8px)',
              }}
              onMouseDown={e => handleMouseDown(e, table.id)}
              onMouseUp={() => handleMouseUp(table)}
              title={`Click to view served orders for ${table.name}`}
            >
              {/* Architectural Seat Indicator Notches on top and bottom */}
              <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
                {Array.from({ length: topBottomSeats }).map((_, i) => (
                  <span
                    key={`top-${i}`}
                    className="w-4 h-1 rounded-full shadow-2xs"
                    style={{ backgroundColor: `${cfg.color}70` }}
                  />
                ))}
              </div>
              <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 flex gap-1.5 pointer-events-none">
                {Array.from({ length: topBottomSeats }).map((_, i) => (
                  <span
                    key={`bot-${i}`}
                    className="w-4 h-1 rounded-full shadow-2xs"
                    style={{ backgroundColor: `${cfg.color}70` }}
                  />
                ))}
              </div>

              {/* Table Name & Status Pill */}
              <div className="flex items-center justify-between pointer-events-none">
                <span className="font-black text-sm text-foreground tracking-tight flex items-center gap-1.5">
                  {table.name}
                </span>
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border shadow-2xs"
                  style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: `${cfg.color}40` }}
                >
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ backgroundColor: cfg.color }} />
                  {cfg.label}
                </span>
              </div>

              {/* Table Capacity & Active Order Status */}
              <div className="flex items-center justify-between text-[11px] font-medium pointer-events-none">
                {activeOrder ? (
                  <span className="flex items-center gap-1 text-orange-400 font-bold text-[10px] truncate">
                    <ShoppingBag size={11} />
                    <span>#{activeOrder.orderNumber} • ${activeOrder.totalAmount.toFixed(0)}</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground font-semibold">
                    <Users size={12} className="text-muted-foreground/80" />
                    <span>{table.capacity} Seats</span>
                  </span>
                )}
              </div>

              {/* Bottom Quick Action Bar */}
              <div className="flex items-center justify-between pt-1 border-t border-border/40 text-xs" onClick={e => e.stopPropagation()}>
                {/* Orders click indicator */}
                <button
                  type="button"
                  onClick={() => onTableClick(table)}
                  className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 px-1 py-0.5 rounded hover:bg-primary/10 transition-colors cursor-pointer"
                  title="View served orders"
                >
                  <Receipt size={11} /> Orders
                </button>

                <div className="flex items-center gap-0.5">
                  {/* Status Dropdown Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Change status"
                      >
                        <MoreHorizontal size={11} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 p-1.5 z-50">
                      <DropdownMenuLabel className="text-xs font-bold px-2 py-1">Set Status</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {(Object.keys(STATUS_CONFIG) as TableStatus[]).map(s => {
                        const scfg = STATUS_CONFIG[s];
                        const SIcon = scfg.icon;
                        return (
                          <DropdownMenuItem
                            key={s}
                            onClick={() => onStatusChange(table, s)}
                            className="text-xs font-semibold cursor-pointer gap-2 py-1.5 px-2 rounded-md"
                          >
                            <SIcon size={13} style={{ color: scfg.color }} />
                            <span>{scfg.label}</span>
                            {table.status === s && <span className="ml-auto text-xs font-bold text-primary">✓</span>}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded hover:bg-muted/80 text-muted-foreground hover:text-foreground cursor-pointer"
                    onMouseDown={e => { e.stopPropagation(); onEditClick(table); }}
                    title="Edit table"
                  >
                    <Pencil size={11} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                    onMouseDown={e => { e.stopPropagation(); onDelete?.(table); }}
                    title="Delete table"
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Floor Plan View ─────────────────────────────────────────────────────────
function FloorPlanView({
  tables,
  sections,
  activeOrders,
  onTableClick,
  onStatusChange,
  onEditClick,
  onDelete,
}: {
  tables: Table[];
  sections: string[];
  activeOrders: Order[];
  onTableClick: (t: Table) => void;
  onStatusChange: (t: Table, s: TableStatus) => void;
  onEditClick: (t: Table) => void;
  onDelete?: (t: Table) => void;
}) {
  const [activeSection, setActiveSection] = useState<string>('ALL');

  const visibleSections = activeSection === 'ALL'
    ? sections
    : sections.filter(s => s === activeSection);

  return (
    <div className="space-y-5">
      {/* Floor Section Filter Tabs */}
      {sections.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-card/60 border border-border/70 rounded-2xl">
          <Button
            variant={activeSection === 'ALL' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveSection('ALL')}
            className={`rounded-xl text-xs font-bold h-9 gap-1.5 transition-all cursor-pointer ${
              activeSection === 'ALL' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Layers size={14} /> All Areas ({tables.length})
          </Button>
          {sections.map(sec => {
            const count = tables.filter(t => (t.floorSection ?? 'General') === sec).length;
            const isSelected = activeSection === sec;
            return (
              <Button
                key={sec}
                variant={isSelected ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveSection(sec)}
                className={`rounded-xl text-xs font-bold h-9 gap-1.5 transition-all cursor-pointer ${
                  isSelected ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                {sec} ({count})
              </Button>
            );
          })}
        </div>
      )}

      {/* Canvases per section */}
      <div className="space-y-6">
        {visibleSections.map(section => (
          <SectionCanvas
            key={section}
            section={section}
            tables={tables.filter(t => (t.floorSection ?? 'General') === section)}
            activeOrders={activeOrders}
            onTableClick={onTableClick}
            onStatusChange={onStatusChange}
            onEditClick={onEditClick}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
}

// ── List View (Grid View) ───────────────────────────────────────────────────
function ListView({
  tables,
  activeOrders,
  onTableClick,
  onStatusChange,
  onEditClick,
  onDelete,
}: {
  tables: Table[];
  activeOrders: Order[];
  onTableClick: (t: Table) => void;
  onStatusChange: (t: Table, s: TableStatus) => void;
  onEditClick: (t: Table) => void;
  onDelete: (t: Table) => void;
}) {
  const sections = [...new Set(tables.map(t => t.floorSection ?? 'General'))];

  return (
    <div className="space-y-7">
      {sections.map(section => (
        <div key={section} className="space-y-3.5">
          <div className="flex items-center gap-3">
            <h4 className="text-sm font-black uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-primary/70" />
              {section}
            </h4>
            <span className="h-px flex-1 bg-border/60" />
            <span className="text-xs font-semibold text-muted-foreground">
              {tables.filter(t => (t.floorSection ?? 'General') === section).length} tables
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {tables.filter(t => (t.floorSection ?? 'General') === section).map(table => {
              const cfg = STATUS_CONFIG[table.status as TableStatus] ?? STATUS_CONFIG.AVAILABLE;
              const Icon = cfg.icon;
              const activeOrder = activeOrders.find(o => o.tableId === table.id);

              return (
                <Card
                  key={table.id}
                  onClick={() => onTableClick(table)}
                  className="relative overflow-hidden border-2 border-border/80 bg-card/90 hover:border-primary/50 transition-all hover:shadow-lg rounded-2xl group flex flex-col justify-between min-h-[160px] cursor-pointer"
                  style={{ borderLeftColor: cfg.color, borderLeftWidth: 4 }}
                >
                  <CardContent className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h5 className="text-2xl font-black tracking-tight text-foreground group-hover:text-primary transition-colors">
                          {table.name}
                        </h5>
                        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mt-1">
                          <Users size={14} className="text-muted-foreground/70" />
                          <span>{table.capacity} seats</span>
                        </div>
                      </div>

                      <Badge
                        variant="outline"
                        className="gap-1.5 py-1 px-3 text-xs font-bold rounded-full border shadow-2xs"
                        style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: `${cfg.color}40` }}
                      >
                        <Icon size={13} /> {cfg.label}
                      </Badge>
                    </div>

                    {/* Active Order Pill if served */}
                    {activeOrder && (
                      <div className="py-1 px-2.5 rounded-lg bg-orange-500/15 border border-orange-500/30 flex items-center justify-between text-xs text-orange-400 font-bold">
                        <span className="flex items-center gap-1.5">
                          <ShoppingBag size={12} /> Order #{activeOrder.orderNumber}
                        </span>
                        <span className="font-mono">${activeOrder.totalAmount.toFixed(2)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-border/60" onClick={e => e.stopPropagation()}>
                      {/* View Orders Action Button */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onTableClick(table)}
                        className="h-8 text-xs font-bold gap-1.5 px-3 rounded-lg border-border/80 bg-background/50 hover:bg-primary hover:text-primary-foreground hover:border-primary transition-all cursor-pointer"
                      >
                        <Receipt size={14} /> Orders
                      </Button>

                      <div className="flex items-center gap-1.5">
                        {/* Status Dropdown Menu */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer" title="Change status">
                              <MoreHorizontal size={15} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 p-1.5">
                            <DropdownMenuLabel className="text-xs font-bold px-2 py-1">Set Table Status</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {(Object.keys(STATUS_CONFIG) as TableStatus[]).map(s => {
                              const scfg = STATUS_CONFIG[s];
                              const SIcon = scfg.icon;
                              return (
                                <DropdownMenuItem
                                  key={s}
                                  onClick={() => onStatusChange(table, s)}
                                  className="text-xs font-semibold cursor-pointer gap-2.5 py-2 px-2.5 rounded-md"
                                >
                                  <SIcon size={14} style={{ color: scfg.color }} />
                                  <span>{scfg.label}</span>
                                  {table.status === s && <span className="ml-auto text-xs font-bold text-primary">✓</span>}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                          onClick={() => onEditClick(table)}
                          title="Edit table"
                        >
                          <Pencil size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer"
                          onClick={() => onDelete(table)}
                          title="Delete table"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Tables Page ────────────────────────────────────────────────────────
export default function TablesPage() {
  const [tables, setTables] = useState<Table[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [view, setView] = useState<'grid' | 'floor'>('floor');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [viewOrdersTable, setViewOrdersTable] = useState<Table | null>(null);
  const [seeding, setSeeding] = useState(false);

  const reloadData = async () => {
    try {
      const [t, o] = await Promise.all([fetchTables(), fetchActiveOrders()]);
      setTables(t);
      setActiveOrders(o);
    } catch (err) {
      console.error('TablesPage reload error:', err);
    }
  };

  useEffect(() => {
    reloadData();
    const ticker = setInterval(reloadData, 10000);
    return () => clearInterval(ticker);
  }, []);

  useSocketEvent('payment:completed', reloadData);
  useSocketEvent('order:statusChanged', reloadData);
  useSocketEvent('order:new', reloadData);
  useSocketEvent('table:updated', reloadData);
  useSocketEvent('table:statusChanged', reloadData);

  const sections = [...new Set(tables.map(t => t.floorSection ?? 'General'))];

  const stats = {
    total: tables.length,
    available: tables.filter(t => t.status === 'AVAILABLE').length,
    occupied: tables.filter(t => t.status === 'OCCUPIED').length,
    reserved: tables.filter(t => t.status === 'RESERVED').length,
    cleaning: tables.filter(t => t.status === 'CLEANING').length,
  };

  const handleStatusChange = async (table: Table, status: TableStatus) => {
    try {
      await updateTableStatus(table.id, status);
      toast.success(`${table.name} marked as ${STATUS_CONFIG[status].label}`);
      reloadData();
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (table: Table) => {
    if (table.status === 'OCCUPIED') {
      toast.error('Cannot delete an occupied table');
      return;
    }
    if (!confirm(`Delete table "${table.name}"?`)) return;
    try {
      await deleteTable(table.id);
      toast.success('Table deleted');
      reloadData();
    } catch {
      toast.error('Failed to delete table');
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedTables();
      toast.success('Sample tables created!');
      reloadData();
    } catch {
      toast.error('Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  const [paymentOrder, setPaymentOrder] = useState<Order | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);
  const [receiptPayment, setReceiptPayment] = useState<Payment | null>(null);

  const handlePayOrder = (order: Order) => {
    setPaymentOrder(order);
  };

  const handlePaymentSuccess = async (paymentId?: string) => {
    const paidOrder = paymentOrder;
    setPaymentOrder(null);
    await reloadData();
    toast.success('Payment completed! Table is now Available.');
    if (paidOrder) {
      handleViewReceipt(paidOrder);
    }
  };

  const handleViewReceipt = async (order: Order) => {
    try {
      const p = await getPaymentByOrderId(order.id);
      setReceiptOrder(order);
      setReceiptPayment(p);
    } catch {
      setReceiptOrder(order);
      setReceiptPayment(null);
    }
  };

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-8">
      {/* Stats row with Card components */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-5">
        {[
          { label: 'Total Tables', value: stats.total, color: 'text-foreground', bg: 'bg-muted/40' },
          { label: 'Available',    value: stats.available, color: 'text-emerald-400', bg: 'bg-emerald-500/15 ring-1 ring-emerald-500/25' },
          { label: 'Occupied',     value: stats.occupied,  color: 'text-orange-400',  bg: 'bg-orange-500/15 ring-1 ring-orange-500/25' },
          { label: 'Reserved',     value: stats.reserved,  color: 'text-indigo-400',  bg: 'bg-indigo-500/15 ring-1 ring-indigo-500/25' },
          { label: 'Cleaning',     value: stats.cleaning,  color: 'text-amber-400',   bg: 'bg-amber-500/15 ring-1 ring-amber-500/25' },
        ].map(s => (
          <Card key={s.label} className="border-border/80 bg-card/90 shadow-sm">
            <CardContent className="p-4 sm:p-5 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{s.label}</span>
                <p className={`text-2xl sm:text-3xl font-black tracking-tight mt-0.5 ${s.color}`}>{s.value}</p>
              </div>
              <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${s.bg}`}>
                <span className={`h-3 w-3 rounded-full ${s.color.replace('text-', 'bg-')}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar with Tabs and Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-card/60 border border-border/70 p-3 rounded-2xl">
        <Tabs value={view} onValueChange={(v) => setView(v as 'grid' | 'floor')} className="w-auto">
          <TabsList className="bg-muted/60 h-11 p-1 rounded-xl">
            <TabsTrigger value="grid" className="gap-2 text-xs sm:text-sm font-bold px-4 rounded-lg data-[state=active]:bg-background cursor-pointer">
              <LayoutGrid size={15} /> Grid View
            </TabsTrigger>
            <TabsTrigger value="floor" className="gap-2 text-xs sm:text-sm font-bold px-4 rounded-lg data-[state=active]:bg-background cursor-pointer">
              <Map size={15} /> Floor Plan
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2.5">
          {tables.length === 0 && (
            <Button variant="outline" size="sm" onClick={handleSeed} disabled={seeding} className="h-11 gap-2 font-bold rounded-xl text-xs sm:text-sm">
              <Database size={15} /> {seeding ? 'Generating...' : 'Load Sample Tables'}
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => { setSelectedTable(null); setDialogOpen(true); }}
            className="h-11 gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs sm:text-sm rounded-xl shadow-md shadow-orange-500/20 px-4 cursor-pointer"
          >
            <Plus size={16} /> Add Table
          </Button>
        </div>
      </div>

      {/* Main View */}
      {tables.length === 0 ? (
        <Card className="border-dashed p-12 text-center text-muted-foreground">
          <p className="text-4xl mb-2">🪑</p>
          <h3 className="text-base font-semibold text-foreground">No tables found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            Get started by adding your first restaurant table or generate sample tables.
          </p>
          <Button className="mt-4 gap-1.5" onClick={() => { setSelectedTable(null); setDialogOpen(true); }}>
            <Plus size={15} /> Add First Table
          </Button>
        </Card>
      ) : view === 'grid' ? (
        <ListView
          tables={tables}
          activeOrders={activeOrders}
          onTableClick={t => setViewOrdersTable(t)}
          onStatusChange={handleStatusChange}
          onEditClick={t => { setSelectedTable(t); setDialogOpen(true); }}
          onDelete={handleDelete}
        />
      ) : (
        <FloorPlanView
          tables={tables}
          sections={sections}
          activeOrders={activeOrders}
          onTableClick={t => setViewOrdersTable(t)}
          onStatusChange={handleStatusChange}
          onEditClick={t => { setSelectedTable(t); setDialogOpen(true); }}
          onDelete={handleDelete}
        />
      )}

      {/* Table Orders Viewer Drawer */}
      <TableOrdersSheet
        open={!!viewOrdersTable}
        table={viewOrdersTable}
        onClose={() => setViewOrdersTable(null)}
        onStatusChange={handleStatusChange}
        onPayOrder={handlePayOrder}
        onViewReceipt={handleViewReceipt}
      />

      {/* Table Create/Edit Dialog */}
      <TableDialog
        open={dialogOpen}
        table={selectedTable}
        sections={sections}
        allTables={tables}
        onClose={() => { setDialogOpen(false); setSelectedTable(null); }}
      />

      {/* Cashier Payment Modal */}
      {paymentOrder && (
        <PaymentModal
          order={paymentOrder}
          onClose={() => setPaymentOrder(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Payment Receipt Modal */}
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
