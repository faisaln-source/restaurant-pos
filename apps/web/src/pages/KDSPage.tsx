import { useState, useEffect } from 'react';
import { Clock, CheckCircle, ChefHat, AlertTriangle, RefreshCw, Flame, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchActiveOrders, updateOrderItemStatus, updateOrderStatus } from '../services/order.service';
import { useSocketEvent } from '../lib/socket';
import type { Order, OrderItem } from '../lib/types';

function playKitchenChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // Audio context may be suspended before user gesture
  }
}

const ITEM_STATUS_CONFIG = {
  PENDING:   { label: 'Pending',   variant: 'outline' as const, bg: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/25', next: 'PREPARING' as const, nextLabel: 'Start', nextVariant: 'default' as const },
  PREPARING: { label: 'Preparing', variant: 'secondary' as const, bg: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-500/25', next: 'READY'     as const, nextLabel: 'Ready!', nextVariant: 'default' as const },
  READY:     { label: 'Ready',     variant: 'default' as const, bg: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/25', next: 'SERVED'    as const, nextLabel: 'Served', nextVariant: 'secondary' as const },
  SERVED:    { label: 'Served',    variant: 'secondary' as const, bg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25', next: null, nextLabel: '', nextVariant: 'secondary' as const },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' as const, bg: 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/25', next: null, nextLabel: '', nextVariant: 'secondary' as const },
};

function elapsed(createdAt: string | null | undefined): string {
  if (!createdAt) return '';
  const secs = Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

// ── KDS Order Card ──────────────────────────────────────────────────────────
function KDSCard({ order, onRefresh }: { order: Order; onRefresh?: () => void }) {
  const [tick, setTick] = useState(0);
  const [bumping, setBumping] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 10000);
    return () => clearInterval(t);
  }, []);

  void tick; // used to trigger re-render for elapsed time

  const isOrderServed = order.status === 'SERVED';
  const pendingItems = order.items.filter(i => !['SERVED', 'CANCELLED'].includes(i.status));
  const allReady = !isOrderServed && pendingItems.length > 0 && pendingItems.every(i => i.status === 'READY');

  const handleItemAction = async (item: OrderItem) => {
    const cfg = ITEM_STATUS_CONFIG[item.status as keyof typeof ITEM_STATUS_CONFIG];
    if (!cfg?.next) return;
    try {
      await updateOrderItemStatus(order.id, item.id, cfg.next);
      onRefresh?.();
    } catch { /* noop */ }
  };

  const handleServeAll = async () => {
    if (bumping) return;
    setBumping(true);
    try {
      await updateOrderStatus(order.id, 'SERVED', order.tableId ?? undefined);
      toast.success(`Ticket #${order.orderNumber} served!`);
      onRefresh?.();
    } catch {
      toast.error('Failed to bump ticket');
    } finally {
      setBumping(false);
    }
  };

  const elapsedMins = order.createdAt
    ? (Date.now() - new Date(order.createdAt).getTime()) / 60000
    : 0;

  const isUrgent = elapsedMins > 20;
  const isWarning = elapsedMins > 10 && !isUrgent;

  return (
    <div className={`flex flex-col rounded-xl border transition-all duration-200 overflow-hidden shadow-sm bg-card dark:bg-[#141721] w-full ${
      isUrgent
        ? 'border-rose-500 ring-1 ring-rose-500/30 shadow-rose-500/10 dark:shadow-rose-950/40'
        : isWarning
        ? 'border-amber-500 ring-1 ring-amber-500/30 shadow-amber-500/10 dark:shadow-amber-950/40'
        : 'border-border dark:border-slate-800 hover:border-border/80 dark:hover:border-slate-700'
    }`}>
      {/* ── Top Urgency Header Bar ────────────────────────────────────────── */}
      <div className={`px-2.5 py-1 flex items-center justify-between text-[11px] font-black uppercase tracking-wider text-white ${
        isUrgent
          ? 'bg-rose-600 animate-pulse'
          : isWarning
          ? 'bg-amber-600'
          : 'bg-slate-800'
      }`}>
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3 stroke-[2.5]" />
          <span>{isUrgent ? 'URGENT' : isWarning ? 'DELAYED' : 'ACTIVE'} • {elapsed(order.createdAt)}</span>
        </div>
        <span className="font-bold tracking-wide text-[10px]">{order.type.replace('_', ' ')}</span>
      </div>

      {/* ── Order Info Header ─────────────────────────────────────────────── */}
      <div className="px-3 py-2 bg-muted/40 dark:bg-[#1a1e2b] border-b border-border/80 dark:border-slate-800 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg font-black tracking-tight text-foreground dark:text-white shrink-0">#{order.orderNumber}</span>
          <Badge className="bg-primary/15 text-primary border border-primary/30 font-black text-[11px] px-1.5 py-0.5 rounded-md truncate">
            {order.tableName ? `Table ${order.tableName}` : order.type.replace('_', ' ')}
          </Badge>
        </div>
        <Badge
          variant="outline"
          className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0 ${
            order.status === 'READY'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
              : order.status === 'PREPARING'
              ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30'
              : order.status === 'SERVED'
              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
              : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
          }`}
        >
          {order.status}
        </Badge>
      </div>

      {/* ── Note banner ───────────────────────────────────────────────────── */}
      {order.note && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 border-b border-amber-500/25">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500 dark:text-amber-400" />
          <span className="truncate">{order.note}</span>
        </div>
      )}

      {/* ── Items List ────────────────────────────────────────────────────── */}
      <div className="p-2 space-y-1.5 flex-1 bg-card dark:bg-[#141721]">
        {order.items.filter(i => i.status !== 'CANCELLED').map(item => {
          const cfg = ITEM_STATUS_CONFIG[item.status as keyof typeof ITEM_STATUS_CONFIG]
            ?? ITEM_STATUS_CONFIG.PENDING;
          const isServed = item.status === 'SERVED';
          const isReady = item.status === 'READY';
          const isCooking = item.status === 'PREPARING';

          return (
            <div
              key={item.id}
              className={`flex items-center justify-between gap-2 p-2 rounded-lg border transition-all ${
                isServed
                  ? 'bg-muted/20 border-border/40 opacity-60 dark:bg-[#181c26]/60 dark:border-slate-800/80'
                  : isReady
                  ? 'bg-emerald-50/80 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-500/40'
                  : isCooking
                  ? 'bg-indigo-50/80 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-500/40'
                  : 'bg-muted/40 border-border/70 hover:border-border dark:bg-[#1e2332] dark:border-slate-700/80 dark:hover:border-slate-600'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`min-w-[26px] h-6 px-1 font-black text-xs rounded-md flex items-center justify-center shadow-xs shrink-0 ${
                  isServed
                    ? 'bg-muted text-muted-foreground dark:bg-slate-800 dark:text-slate-400'
                    : 'bg-amber-400 text-slate-950'
                }`}>
                  {item.quantity}×
                </span>
                <div className="min-w-0">
                  <div className={`font-bold text-xs leading-tight truncate ${
                    isServed ? 'line-through text-muted-foreground dark:text-slate-400' : 'text-foreground dark:text-white'
                  }`}>
                    {item.menuItemName || (item as any).menuItem?.name || 'Dish Item'}
                  </div>
                  {item.note && (
                    <div className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded flex items-center gap-1 mt-0.5 truncate">
                      <span>📝</span> {item.note}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0">
                {cfg.next ? (
                  <Button
                    size="sm"
                    className={`h-7 px-2.5 font-bold text-xs rounded-md shadow-xs gap-1.5 transition-all active:scale-95 ${
                      cfg.nextLabel === 'Ready!'
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white shadow-orange-950/40'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                    }`}
                    onClick={() => handleItemAction(item)}
                  >
                    {cfg.nextLabel === 'Ready!' && <Flame className="w-3 h-3 text-white" />}
                    {cfg.nextLabel}
                  </Button>
                ) : (
                  <Badge className="h-6 px-2 font-bold text-[10px] rounded-md bg-muted text-muted-foreground border-border dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-500 dark:text-emerald-400" />
                    Served
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Footer action if all ready ────────────────────────────────────── */}
      {allReady && (
        <div className="p-2 pt-0 bg-card dark:bg-[#141721]">
          <Button
            disabled={bumping}
            className="w-full h-8 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-lg shadow-md shadow-emerald-950/30 gap-1.5 uppercase tracking-wider active:scale-95 disabled:opacity-50"
            onClick={handleServeAll}
          >
            <CheckCircle className="w-3.5 h-3.5 stroke-[2.5]" />
            {bumping ? 'Serving...' : 'Bump Ticket • Serve All'}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── KDS Page ────────────────────────────────────────────────────────────────
export default function KDSPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [filter, setFilter] = useState<'all' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('all');
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);

  const loadOrders = async () => {
    try {
      const all = await fetchActiveOrders();
      setOrders(all.filter(ord => !['COMPLETED', 'CANCELLED'].includes(ord.status)));
    } catch (err) {
      console.error('KDS load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
    const ticker = setInterval(() => setTick(n => n + 1), 30000);
    return () => clearInterval(ticker);
  }, []);

  // Live updates
  useSocketEvent('order:new', (newOrd: any) => {
    playKitchenChime();
    toast('🔔 New Order Ticket for Kitchen!', { icon: '🍳', duration: 4000 });
    loadOrders();
  });
  useSocketEvent('order:statusChanged', () => loadOrders());
  useSocketEvent('order:updated', () => loadOrders());
  useSocketEvent('orderItem:statusChanged', () => loadOrders());

  const filtered = filter === 'all' ? orders : orders.filter(o => o.type === filter);

  const counts = {
    all: orders.length,
    DINE_IN: orders.filter(o => o.type === 'DINE_IN').length,
    TAKEAWAY: orders.filter(o => o.type === 'TAKEAWAY').length,
    DELIVERY: orders.filter(o => o.type === 'DELIVERY').length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
            <ChefHat className="h-6 w-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Kitchen Display</h1>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">Real-time order tickets & cooking station tracking</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Tabs value={filter} onValueChange={v => setFilter(v as any)}>
            <TabsList className="bg-muted/60 h-11 p-1 rounded-xl">
              <TabsTrigger value="all" className="gap-2 text-xs sm:text-sm font-bold px-3.5 rounded-lg data-[state=active]:bg-background">
                All
                <Badge variant="secondary" className="px-1.5 py-0 text-xs font-mono font-bold h-5">
                  {counts.all}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="DINE_IN" className="gap-2 text-xs sm:text-sm font-bold px-3.5 rounded-lg data-[state=active]:bg-background">
                Dine In
                <Badge variant="secondary" className="px-1.5 py-0 text-xs font-mono font-bold h-5">
                  {counts.DINE_IN}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="TAKEAWAY" className="gap-2 text-xs sm:text-sm font-bold px-3.5 rounded-lg data-[state=active]:bg-background">
                Takeaway
                <Badge variant="secondary" className="px-1.5 py-0 text-xs font-mono font-bold h-5">
                  {counts.TAKEAWAY}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="DELIVERY" className="gap-2 text-xs sm:text-sm font-bold px-3.5 rounded-lg data-[state=active]:bg-background">
                Delivery
                <Badge variant="secondary" className="px-1.5 py-0 text-xs font-mono font-bold h-5">
                  {counts.DELIVERY}
                </Badge>
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11 rounded-xl shrink-0 border-border/80"
            title="Refresh orders"
            onClick={() => loadOrders()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Legend & Urgency Guide */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-1.5 rounded-xl bg-card/70 border border-border/70 text-xs text-muted-foreground shadow-2xs">
        <span className="font-bold text-foreground">Status:</span>
        <div className="flex items-center gap-1.5 font-semibold">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> Pending
        </div>
        <div className="flex items-center gap-1.5 font-semibold">
          <span className="h-2 w-2 rounded-full bg-indigo-400" /> Preparing
        </div>
        <div className="flex items-center gap-1.5 font-semibold">
          <span className="h-2 w-2 rounded-full bg-emerald-400" /> Ready
        </div>
        <div className="flex items-center gap-1.5 font-semibold">
          <span className="h-2 w-2 rounded-full bg-slate-400" /> Served
        </div>
        <span className="h-3.5 w-px bg-border/60 mx-0.5 hidden sm:inline-block" />
        <span className="font-bold text-foreground">Urgency:</span>
        <div className="flex items-center gap-1.5 text-amber-400 font-bold">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> &gt;10 min warning
        </div>
        <div className="flex items-center gap-1.5 text-rose-400 font-bold">
          <span className="h-2 w-2 rounded-full bg-rose-400" /> &gt;20 min urgent
        </div>
      </div>

      {/* Orders Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-semibold">Loading kitchen tickets...</p>
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center border-dashed rounded-2xl">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground/40 mb-3">
            <ChefHat className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold">Kitchen is Clear! 🎉</h3>
          <p className="text-sm text-muted-foreground max-w-sm mt-1">
            There are currently no active tickets in the kitchen. New orders will appear automatically in real-time.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 items-start">
          {filtered.map(order => (
            <KDSCard key={order.id} order={order} onRefresh={loadOrders} />
          ))}
        </div>
      )}
    </div>
  );
}

