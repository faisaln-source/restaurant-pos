import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Printer, Clock, RefreshCw, CheckCircle2, ReceiptText,
  ChefHat, Flame, AlertTriangle, Package, Bike, UtensilsCrossed,
  ChevronDown, Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchActiveOrders } from '../services/order.service';
import { fetchKitchenStations, fetchStationOrders } from '../services/kitchen-station.service';
import { useSocketEvent, joinStationRoom, leaveStationRoom } from '../lib/socket';
import { printKitchenTicket } from '../lib/kitchenTicket';
import type { Order, KitchenStation } from '../lib/types';

/** Normalize a raw socket/API order payload to the client Order shape */
function normalizeSocketOrder(raw: any): Order {
  return {
    ...raw,
    tableName:      raw.table?.name ?? raw.tableName ?? undefined,
    userName:       raw.user?.name ?? raw.userName ?? '',
    totalAmount:    Number(raw.totalAmount ?? 0),
    subtotal:       Number(raw.subtotal ?? raw.totalAmount ?? 0),
    taxAmount:      Number(raw.taxAmount ?? 0),
    taxRate:        Number(raw.taxRate ?? 5),
    discountAmount: Number(raw.discountAmount ?? 0),
    items: (raw.items ?? []).map((i: any) => ({
      ...i,
      menuItemName:      i.menuItem?.name ?? i.menuItemName ?? 'Item',
      kitchenStationId:  i.menuItem?.kitchenStationId ?? i.kitchenStationId ?? null,
      unitPrice:    Number(i.unitPrice ?? 0),
      totalPrice:   Number(i.totalPrice ?? 0),
    })),
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────
function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function elapsed(iso: string | null | undefined): string {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function orderTypeIcon(type: string) {
  if (type === 'DINE_IN')  return <UtensilsCrossed className="w-3.5 h-3.5" />;
  if (type === 'TAKEAWAY') return <Package className="w-3.5 h-3.5" />;
  if (type === 'DELIVERY') return <Bike className="w-3.5 h-3.5" />;
  return null;
}

function orderTypeLabel(type: string) {
  return ({ DINE_IN: 'Dine In', TAKEAWAY: 'Takeaway', DELIVERY: 'Delivery' }[type] ?? type);
}

function playChime() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [587.33, 880, 1174.66].forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.18);
      gain.gain.setValueAtTime(0.22, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.5);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.5);
    });
  } catch { /* ignore */ }
}

// ── per-ticket log entry ─────────────────────────────────────────────────────
interface TicketLog {
  order: Order;
  printedAt: Date;
  printCount: number;
}

// ── TicketRow component ──────────────────────────────────────────────────────
function TicketRow({
  entry,
  onReprint,
  stationColor,
  stationId,
}: {
  entry: TicketLog;
  onReprint: () => void;
  stationColor?: string;
  stationId?: string; // when set, only items belonging to this station are shown
}) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 15000);
    return () => clearInterval(t);
  }, []);
  void tick;

  const { order, printCount } = entry;

  // If viewing a specific station, filter items to only those belonging to it.
  // kitchenStationId is set during normalization from menuItem.kitchenStationId.
  const activeItems = order.items.filter(i => {
    if (i.status === 'CANCELLED') return false;
    if (stationId) return (i as any).kitchenStationId === stationId;
    return true;
  });

  // Don't render a ticket if there are no items for this station
  if (activeItems.length === 0) return null;

  const elapsedMins = (Date.now() - new Date(order.createdAt).getTime()) / 60000;
  const isUrgent  = elapsedMins > 20;
  const isWarning = elapsedMins > 10 && !isUrgent;

  return (
    <div className={`rounded-xl border transition-all duration-300 overflow-hidden bg-card dark:bg-[#141721] ${
      isUrgent
        ? 'border-rose-500/70 shadow-md shadow-rose-950/20'
        : isWarning
        ? 'border-amber-500/60 shadow-sm shadow-amber-950/10'
        : 'border-border/70 dark:border-slate-800'
    }`}>
      {/* urgency strip — use station color if set */}
      <div
        className={`h-1 w-full ${
          isUrgent ? 'bg-rose-500 animate-pulse' : isWarning ? 'bg-amber-500' : ''
        }`}
        style={!isUrgent && !isWarning && stationColor ? { backgroundColor: stationColor } : !isUrgent && !isWarning ? { backgroundColor: '#10b981cc' } : {}}
      />

      <div className="p-3 flex flex-col gap-2.5">
        {/* top row: ticket# + type + time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl font-black tracking-tight text-foreground dark:text-white">
              #{order.orderNumber}
            </span>
            <Badge
              className={`flex items-center gap-1 text-[10px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md ${
                order.type === 'DINE_IN'
                  ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
                  : order.type === 'TAKEAWAY'
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              {orderTypeIcon(order.type)}
              {orderTypeLabel(order.type)}
            </Badge>
            {order.tableName && (
              <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0.5 rounded-md">
                Table {order.tableName}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground font-semibold shrink-0">
            {formatTime(order.createdAt)}
          </span>
        </div>

        {/* items list — filtered to this station when stationId is set */}
        <div className="space-y-1">
          {activeItems.map(item => (
            <div key={item.id} className="flex items-baseline gap-2 text-sm">
              <span className="font-black text-amber-500 dark:text-amber-400 min-w-[20px] text-base leading-none">
                {item.quantity}×
              </span>
              <div className="min-w-0">
                <span className="font-semibold text-foreground dark:text-slate-200 leading-tight">
                  {item.menuItemName}
                </span>
                {item.note && (
                  <span className="block text-[11px] text-amber-600 dark:text-amber-300 italic">
                    ↳ {item.note}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* order note */}
        {order.note && (
          <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-500" />
            {order.note}
          </div>
        )}

        {/* footer: elapsed + print info + Print button */}
        <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-border/50 dark:border-slate-800">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className={`flex items-center gap-1 font-semibold ${
              isUrgent ? 'text-rose-400' : isWarning ? 'text-amber-400' : ''
            }`}>
              <Clock className="w-3 h-3" />
              {elapsed(order.createdAt)}
            </span>
            <span className="flex items-center gap-1">
              <Printer className="w-3 h-3" />
              {printCount === 1 ? 'Printed' : `×${printCount}`}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 text-xs font-bold gap-1.5 rounded-lg border-border/80 hover:bg-muted/60"
            onClick={onReprint}
            title="Reprint kitchen ticket"
          >
            <Printer className="w-3 h-3" />
            Print
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── KDS / Print Queue page ────────────────────────────────────────────────────
export default function KDSPage() {
  const [ticketLog, setTicketLog] = useState<TicketLog[]>([]);
  const [filter, setFilter] = useState<'all' | 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'>('all');
  const [loading, setLoading] = useState(true);
  const printedIds = useRef<Set<string>>(new Set());

  // Kitchen station state
  const [stations, setStations] = useState<KitchenStation[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>(() => {
    // Persist the last-selected station across page reloads
    return localStorage.getItem('kds_station') ?? 'all';
  });
  const [stationDropdownOpen, setStationDropdownOpen] = useState(false);

  const restName = (() => {
    try {
      const s = localStorage.getItem('pos_settings');
      return s ? (JSON.parse(s) as any).restaurantName ?? 'Restaurant' : 'Restaurant';
    } catch { return 'Restaurant'; }
  })();

  const selectedStation = stations.find(s => s.id === selectedStationId);

  // Load kitchen stations on mount
  useEffect(() => {
    fetchKitchenStations()
      .then(data => setStations(data.filter(s => s.isActive)))
      .catch(() => {});
  }, []);

  // Join/leave the per-station Socket.IO room whenever the selection changes
  useEffect(() => {
    if (selectedStationId === 'all') return;
    joinStationRoom(selectedStationId);
    return () => {
      leaveStationRoom(selectedStationId);
    };
  }, [selectedStationId]);

  // Load orders based on selected station
  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      let all: any[];
      if (selectedStationId === 'all') {
        all = await fetchActiveOrders();
      } else {
        all = await fetchStationOrders(selectedStationId, true);
      }
      const active = all.filter(o => !['COMPLETED', 'CANCELLED'].includes(o.status));
      setTicketLog(prev => {
        const loggedIds = new Set(prev.map(e => e.order.id));
        const newEntries: TicketLog[] = active
          .filter(o => !loggedIds.has(o.id))
          .map(o => ({ order: normalizeSocketOrder(o), printedAt: new Date(), printCount: 0 }));
        return newEntries.length ? [...newEntries.reverse(), ...prev] : prev;
      });
    } catch (err) {
      console.error('KDS load error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStationId]);

  useEffect(() => {
    setTicketLog([]);
    printedIds.current.clear();
    loadOrders();
  }, [loadOrders]);

  // auto-print helper
  const autoPrint = useCallback((order: Order) => {
    if (printedIds.current.has(order.id)) return; // dedup
    printedIds.current.add(order.id);
    printKitchenTicket(order, {
      restaurantName: restName,
      stationId: selectedStationId === 'all' ? undefined : selectedStationId,
      stationName: selectedStation?.name,
    });
    setTicketLog(prev => {
      const idx = prev.findIndex(e => e.order.id === order.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], printedAt: new Date(), printCount: updated[idx].printCount + 1 };
        return updated;
      }
      return [{ order, printedAt: new Date(), printCount: 1 }, ...prev];
    });
  }, [restName, selectedStationId, selectedStation]);

  void autoPrint; // used via socket

  // Socket: new order → chime + add to queue
  useSocketEvent<any>('order:new', (raw) => {
    const newOrder = normalizeSocketOrder(raw);
    // Check if this order has any items for the currently viewed station
    const stationItems = selectedStationId === 'all'
      ? newOrder.items
      : newOrder.items.filter((i: any) => i.kitchenStationId === selectedStationId);
    if (stationItems.length === 0) return; // nothing for this station
    playChime();
    setTicketLog(prev => {
      if (prev.some(e => e.order.id === newOrder.id)) return prev;
      printedIds.current.add(newOrder.id);
      return [{ order: newOrder, printedAt: new Date(), printCount: 1 }, ...prev];
    });
  });

  // update order data in log on status changes
  useSocketEvent('order:statusChanged', () => loadOrders());
  useSocketEvent('order:updated', () => loadOrders());

  const handleReprint = (entry: TicketLog) => {
    printKitchenTicket(entry.order, {
      restaurantName: restName,
      stationId: selectedStationId === 'all' ? undefined : selectedStationId,
      stationName: selectedStation?.name,
    });
    setTicketLog(prev =>
      prev.map(e => e.order.id === entry.order.id
        ? { ...e, printedAt: new Date(), printCount: e.printCount + 1 }
        : e,
      ),
    );
    toast.success(`Reprinted ticket #${entry.order.orderNumber}`);
  };

  const filtered = filter === 'all'
    ? ticketLog
    : ticketLog.filter(e => e.order.type === filter);

  const counts = {
    all:      ticketLog.length,
    DINE_IN:  ticketLog.filter(e => e.order.type === 'DINE_IN').length,
    TAKEAWAY: ticketLog.filter(e => e.order.type === 'TAKEAWAY').length,
    DELIVERY: ticketLog.filter(e => e.order.type === 'DELIVERY').length,
  };

  const FILTER_TABS = [
    { key: 'all',      label: 'All',      icon: null },
    { key: 'DINE_IN',  label: 'Dine In',  icon: <UtensilsCrossed className="w-3.5 h-3.5" /> },
    { key: 'TAKEAWAY', label: 'Takeaway', icon: <Package className="w-3.5 h-3.5" /> },
    { key: 'DELIVERY', label: 'Delivery', icon: <Bike className="w-3.5 h-3.5" /> },
  ] as const;

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
            <ReceiptText className="h-6 w-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight">Kitchen Tickets</h1>
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Orders auto-print to kitchen on arrival — reprint any ticket below
            </p>
          </div>
        </div>

        {/* Station selector + Filter tabs + refresh */}
        <div className="flex items-center gap-2 flex-wrap">
        {/* Kitchen Station Selector — always shown so staff can pick their station */}
          <div className="relative">
              <button
                id="kds-station-selector"
                onClick={() => setStationDropdownOpen(o => !o)}
                className="flex items-center gap-2 h-9 px-3 rounded-xl border border-border/80 bg-background text-xs font-bold hover:bg-muted/60 transition-colors"
              >
                <Layers className="w-3.5 h-3.5 text-muted-foreground" />
                {selectedStation ? (
                  <>
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: selectedStation.color }}
                    />
                    {selectedStation.name}
                  </>
                ) : (
                  <span>All Kitchens</span>
                )}
                <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
              </button>
              {stationDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setStationDropdownOpen(false)}
                  />
                  <div className="absolute right-0 top-10 z-20 min-w-[200px] bg-card border border-border/80 rounded-xl shadow-xl overflow-hidden py-1">
                    <button
                      onClick={() => { setSelectedStationId('all'); localStorage.setItem('kds_station', 'all'); setStationDropdownOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-left hover:bg-muted/60 transition-colors ${selectedStationId === 'all' ? 'text-primary bg-primary/5' : 'text-foreground'}`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      All Kitchens
                    </button>
                    {stations.length === 0 ? (
                      <p className="px-3 py-2 text-[11px] text-muted-foreground italic">
                        No stations yet — add them in Settings
                      </p>
                    ) : (
                      stations.map(station => (
                        <button
                          key={station.id}
                          onClick={() => { setSelectedStationId(station.id); localStorage.setItem('kds_station', station.id); setStationDropdownOpen(false); }}
                          className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-left hover:bg-muted/60 transition-colors ${selectedStationId === station.id ? 'text-primary bg-primary/5' : 'text-foreground'}`}
                        >
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: station.color }}
                          />
                          {station.name}
                          {station._count && (
                            <span className="ml-auto text-muted-foreground font-mono text-[10px]">
                              {station._count.menuItems} items
                            </span>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

          <div className="flex items-center gap-1 bg-muted/60 rounded-xl p-1">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filter === tab.key
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab.icon}
                {tab.label}
                <span className={`ml-0.5 px-1.5 py-0 rounded-full text-[10px] font-mono font-black ${
                  filter === tab.key ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl shrink-0 border-border/80"
            title="Refresh"
            onClick={() => loadOrders()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ── Active station banner ────────────────────────────────────────────── */}
      {selectedStation && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold"
          style={{
            borderColor: selectedStation.color + '55',
            backgroundColor: selectedStation.color + '11',
            color: selectedStation.color,
          }}
        >
          <span
            className="h-2.5 w-2.5 rounded-full animate-pulse"
            style={{ backgroundColor: selectedStation.color }}
          />
          Viewing: <span className="font-black">{selectedStation.name}</span>
          {selectedStation.description && (
            <span className="text-muted-foreground font-normal ml-1">— {selectedStation.description}</span>
          )}
        </div>
      )}

      {/* ── Info strip ─────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-xl bg-card/70 border border-border/70 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 font-semibold text-foreground">
          <Printer className="w-3.5 h-3.5 text-primary" />
          Auto-Print Mode
        </div>
        <span className="h-3 w-px bg-border/60 hidden sm:block" />
        <span>New orders trigger the system print dialog automatically</span>
        <span className="h-3 w-px bg-border/60 hidden sm:block" />
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-400" /> &lt;10 min
          </span>
          <span className="flex items-center gap-1 text-amber-400 font-semibold">
            <span className="h-2 w-2 rounded-full bg-amber-400" /> &gt;10 min
          </span>
          <span className="flex items-center gap-1 text-rose-400 font-semibold">
            <span className="h-2 w-2 rounded-full bg-rose-400 animate-pulse" /> &gt;20 min urgent
          </span>
        </div>
      </div>

      {/* ── Ticket grid / empty states ──────────────────────────────────────── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-muted-foreground">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-sm font-semibold">Loading tickets...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border border-dashed border-border/60 bg-card/50">
          <div className="h-16 w-16 rounded-2xl bg-muted/50 flex items-center justify-center text-muted-foreground/40 mb-4">
            <ChefHat className="h-8 w-8" />
          </div>
          <h3 className="text-base font-bold text-foreground">No tickets yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs mt-1">
            {selectedStation
              ? `${selectedStation.name} is clear! Orders routed here will appear in real time.`
              : 'Kitchen is clear! New orders will automatically print and appear here in real time.'}
          </p>
          <div className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-primary/8 border border-primary/20 text-xs font-semibold text-primary">
            <Flame className="w-3.5 h-3.5" />
            Waiting for orders…
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3 items-start">
          {filtered.map(entry => (
            <TicketRow
              key={entry.order.id}
              entry={entry}
              stationColor={selectedStation?.color}
              stationId={selectedStation?.id}
              onReprint={() => handleReprint(entry)}
            />
          ))}
        </div>
      )}

      {/* ── Summary footer ──────────────────────────────────────────────────── */}
      {ticketLog.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/30 border border-border/50 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-semibold">
              {ticketLog.reduce((s, e) => s + e.printCount, 0)} ticket{ticketLog.reduce((s, e) => s + e.printCount, 0) !== 1 ? 's' : ''} printed this session
            </span>
          </div>
          <button
            className="text-muted-foreground hover:text-foreground font-semibold underline underline-offset-2 transition-colors"
            onClick={() => { setTicketLog([]); printedIds.current.clear(); }}
          >
            Clear log
          </button>
        </div>
      )}
    </div>
  );
}
