import { useState, useEffect, useMemo } from 'react';
import {
  Calendar, Check, RefreshCw, Sparkles, TrendingUp, Settings2,
  Plus, Minus, Search, ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  fetchDailyPriceBoard,
  updateDailyPriceBoard,
  fetchMenuItems,
  toggleVariablePrice,
} from '../services/menu.service';
import type { MenuItem } from '../lib/types';
import {
  Dialog, DialogContent, DialogDescription,
  DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

type Tab = 'prices' | 'manage';

interface DailyPriceBoardModalProps {
  open: boolean;
  onClose: () => void;
  onPricesUpdated?: () => void;
}

export default function DailyPriceBoardModal({
  open,
  onClose,
  onPricesUpdated,
}: DailyPriceBoardModalProps) {
  const [tab, setTab] = useState<Tab>('prices');

  // ── Prices tab state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [boardDate, setBoardDate] = useState('');
  const [dayName, setDayName] = useState('');
  const [items, setItems] = useState<MenuItem[]>([]);
  const [priceMap, setPriceMap] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');

  // ── Manage tab state
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [manageSearch, setManageSearch] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);
  const [manageLoading, setManageLoading] = useState(false);

  const loadBoard = async () => {
    setLoading(true);
    try {
      const data = await fetchDailyPriceBoard();
      setBoardDate(data.date);
      setDayName(data.dayName);
      setItems(data.items);

      const initialMap: Record<string, string> = {};
      data.items.forEach((item) => {
        const active = item.effectivePrice ?? item.dailyPrice ?? item.price;
        initialMap[item.id] = String(active);
      });
      setPriceMap(initialMap);
    } catch {
      toast.error('Failed to load daily price board');
    } finally {
      setLoading(false);
    }
  };

  const loadAllItems = async () => {
    setManageLoading(true);
    try {
      const data = await fetchMenuItems();
      setAllItems(data);
    } catch {
      toast.error('Failed to load menu items');
    } finally {
      setManageLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setTab('prices');
      setSearch('');
      setManageSearch('');
      loadBoard();
      loadAllItems();
    }
  }, [open]);

  const handlePriceChange = (id: string, val: string) => {
    setPriceMap((prev) => ({ ...prev, [id]: val }));
  };

  const resetAllToDayDefault = () => {
    const nextMap: Record<string, string> = {};
    items.forEach((item) => {
      const dayDefault = item.todayDefaultPrice ?? item.price;
      nextMap[item.id] = String(dayDefault);
    });
    setPriceMap(nextMap);
    toast.success(`Reset all ${items.length} items to ${dayName.toUpperCase()} scheduled rates`);
  };

  const handleSave = async () => {
    const updates: { id: string; dailyPrice: number }[] = [];

    for (const item of items) {
      const valStr = priceMap[item.id];
      const val = parseFloat(valStr);
      if (isNaN(val) || val <= 0) {
        toast.error(`Please enter a valid price for "${item.name}"`);
        return;
      }
      updates.push({ id: item.id, dailyPrice: val });
    }

    if (updates.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      await updateDailyPriceBoard(updates);
      toast.success(`✅ Saved today's rates for ${updates.length} items! Broadcasted to all POS screens.`);
      if (onPricesUpdated) onPricesUpdated();
      onClose();
    } catch {
      toast.error('Failed to update daily prices');
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Manage tab derived state
  const handleToggleVariable = async (item: MenuItem) => {
    const next = !item.isVariablePrice;
    setToggling(item.id);
    try {
      await toggleVariablePrice(item.id, next);
      setAllItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isVariablePrice: next } : i))
      );
      await loadBoard();
      toast.success(
        next
          ? `"${item.name}" added to Daily Price Board`
          : `"${item.name}" removed from Daily Price Board`
      );
    } catch {
      toast.error('Failed to update variable price flag');
    } finally {
      setToggling(null);
    }
  };

  const manageFiltered = useMemo(
    () => allItems.filter((i) => i.name.toLowerCase().includes(manageSearch.toLowerCase())),
    [allItems, manageSearch]
  );

  const variableCount = allItems.filter((i) => i.isVariablePrice).length;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[700px] max-h-[88vh] flex flex-col p-0 overflow-hidden">

        {/* ── Header ── */}
        <div className="p-6 pb-0 border-b border-border bg-gradient-to-r from-card via-card to-primary/5">
          <div className="flex items-center justify-between gap-3 pb-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Calendar size={20} />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold flex items-center gap-2">
                  Daily Price Board
                  <Badge variant="outline" className="capitalize bg-primary/10 text-primary border-primary/20 text-xs">
                    {dayName || 'Today'}
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Manage variable-price dishes and set today's rates for all POS terminals.
                </DialogDescription>
              </div>
            </div>
            {boardDate && (
              <Badge variant="secondary" className="font-mono text-xs px-2.5 py-1 hidden sm:inline-flex">
                {boardDate}
              </Badge>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-0 -mb-px">
            <button
              onClick={() => setTab('prices')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                tab === 'prices'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <TrendingUp size={13} />
              Set Today's Prices
              {items.length > 0 && (
                <span className="ml-1 bg-primary/15 text-primary rounded-full px-1.5 py-0 text-[10px] font-bold">
                  {items.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('manage')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                tab === 'manage'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Settings2 size={13} />
              Manage Variable Items
              {variableCount > 0 && (
                <span className="ml-1 bg-muted text-muted-foreground rounded-full px-1.5 py-0 text-[10px] font-bold">
                  {variableCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ── TAB: SET TODAY'S PRICES ── */}
        {tab === 'prices' && (
          <>
            {items.length > 0 && (
              <div className="px-6 pt-4 pb-0 flex items-center justify-between gap-3">
                <Input
                  placeholder="Search variable dishes..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="h-9 max-w-[260px] text-xs bg-muted/40"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={resetAllToDayDefault}
                  className="h-9 text-xs gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground"
                  title={`Reset to ${dayName} defaults`}
                >
                  <RefreshCw size={13} />
                  <span>Reset to Day Defaults</span>
                </Button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6 space-y-3 min-h-[250px]">
              {loading ? (
                <div className="py-16 text-center text-muted-foreground space-y-2">
                  <RefreshCw size={24} className="animate-spin mx-auto text-primary" />
                  <p className="text-sm">Loading daily price board...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="py-12 text-center space-y-3 px-4">
                  <div className="h-12 w-12 rounded-2xl bg-muted/60 text-muted-foreground flex items-center justify-center mx-auto">
                    <TrendingUp size={24} />
                  </div>
                  <h3 className="font-bold text-base text-foreground">No Variable Price Dishes</h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    No menu items are marked for variable day pricing yet.{' '}
                    <button
                      onClick={() => setTab('manage')}
                      className="text-primary underline underline-offset-2 hover:no-underline cursor-pointer"
                    >
                      Switch to Manage tab
                    </button>{' '}
                    to pick which dishes should have variable pricing.
                  </p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  No dishes match "{search}"
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredItems.map((item) => {
                    const dayDefault = item.todayDefaultPrice ?? item.price;
                    const currentVal = priceMap[item.id] ?? '';
                    const isDifferentFromDefault = parseFloat(currentVal) !== dayDefault;

                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-4 p-3.5 rounded-xl border border-border/70 bg-card hover:border-primary/40 transition-all shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="h-11 w-11 rounded-lg overflow-hidden bg-muted flex items-center justify-center text-xl shrink-0 border border-border/50">
                            {item.imageUrl ? (
                              <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                            ) : (
                              <span>{item.isVeg ? '🥗' : '🍗'}</span>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="font-bold text-sm text-foreground truncate">{item.name}</h4>
                              {item.categoryName && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 hidden sm:inline-flex">
                                  {item.categoryName}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                              <span>Base: ₹{item.price.toFixed(2)}</span>
                              <span>•</span>
                              <span className="text-primary/90 font-medium capitalize">
                                {dayName} Sched: ₹{dayDefault.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="relative flex items-center">
                            <span className="absolute left-2.5 text-xs font-bold text-muted-foreground">₹</span>
                            <Input
                              type="number"
                              step="0.5"
                              min="0"
                              value={currentVal}
                              onChange={(e) => handlePriceChange(item.id, e.target.value)}
                              className={`w-28 pl-6 h-9 font-mono font-bold text-sm text-right ${
                                isDifferentFromDefault
                                  ? 'border-amber-500/80 bg-amber-500/5 text-amber-300'
                                  : 'bg-card'
                              }`}
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePriceChange(item.id, String(dayDefault))}
                            disabled={!isDifferentFromDefault}
                            className="h-9 px-2 text-xs text-muted-foreground hover:text-foreground cursor-pointer disabled:opacity-30"
                            title="Revert to day default"
                          >
                            <RefreshCw size={12} />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <DialogFooter className="p-4 border-t border-border bg-muted/20 flex sm:justify-between items-center gap-2">
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                {items.length} variable dish{items.length === 1 ? '' : 'es'} configured
              </p>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button variant="outline" size="sm" onClick={onClose} disabled={saving} className="cursor-pointer">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving || items.length === 0}
                  className="gap-1.5 cursor-pointer bg-primary text-primary-foreground font-bold"
                >
                  {saving ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check size={14} />
                      Save &amp; Apply Today's Rates
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </>
        )}

        {/* ── TAB: MANAGE VARIABLE ITEMS ── */}
        {tab === 'manage' && (
          <>
            <div className="px-6 pt-4 pb-2">
              <p className="text-xs text-muted-foreground mb-3">
                Toggle which menu items have <strong>variable pricing</strong>. Enabled items appear in the
                "Set Today's Prices" tab every day.
              </p>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search all menu items..."
                  value={manageSearch}
                  onChange={(e) => setManageSearch(e.target.value)}
                  className="h-9 pl-8 text-xs bg-muted/40"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-3 min-h-[250px]">
              {manageLoading ? (
                <div className="py-16 text-center text-muted-foreground space-y-2">
                  <RefreshCw size={24} className="animate-spin mx-auto text-primary" />
                  <p className="text-sm">Loading menu items...</p>
                </div>
              ) : manageFiltered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-xs">
                  {manageSearch ? `No items match "${manageSearch}"` : 'No menu items found'}
                </div>
              ) : (
                <>
                  {manageFiltered.some((i) => i.isVariablePrice) && (
                    <div className="mb-4">
                      <p className="text-[10px] font-semibold text-primary uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Sparkles size={10} />
                        Variable Pricing Enabled
                      </p>
                      {manageFiltered
                        .filter((i) => i.isVariablePrice)
                        .map((item) => (
                          <ManageItemRow
                            key={item.id}
                            item={item}
                            isVariable
                            isToggling={toggling === item.id}
                            onToggle={handleToggleVariable}
                          />
                        ))}
                    </div>
                  )}
                  {manageFiltered.some((i) => !i.isVariablePrice) && (
                    <div>
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                        Fixed Price Items
                      </p>
                      {manageFiltered
                        .filter((i) => !i.isVariablePrice)
                        .map((item) => (
                          <ManageItemRow
                            key={item.id}
                            item={item}
                            isVariable={false}
                            isToggling={toggling === item.id}
                            onToggle={handleToggleVariable}
                          />
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>

            <DialogFooter className="p-4 border-t border-border bg-muted/20 flex sm:justify-between items-center gap-2">
              <p className="text-[11px] text-muted-foreground hidden sm:block">
                {variableCount} of {allItems.length} items have variable pricing
              </p>
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button variant="outline" size="sm" onClick={onClose} className="cursor-pointer">
                  Close
                </Button>
                <Button size="sm" onClick={() => setTab('prices')} className="gap-1.5 cursor-pointer">
                  <ChevronRight size={14} />
                  Go to Set Prices
                </Button>
              </div>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Sub-component ──────────────────────────────────────────────────────────

function ManageItemRow({
  item,
  isVariable,
  isToggling,
  onToggle,
}: {
  item: MenuItem;
  isVariable: boolean;
  isToggling: boolean;
  onToggle: (item: MenuItem) => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all mb-2 ${
        isVariable
          ? 'border-primary/30 bg-primary/5'
          : 'border-border/60 bg-card hover:border-border'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="h-9 w-9 rounded-lg overflow-hidden bg-muted flex items-center justify-center text-base shrink-0 border border-border/40">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <span>{item.isVeg ? '🥗' : '🍗'}</span>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-sm text-foreground truncate">{item.name}</span>
            {item.categoryName && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 hidden sm:inline-flex">
                {item.categoryName}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">Base price: ₹{Number(item.price).toFixed(2)}</p>
        </div>
      </div>

      <Button
        size="sm"
        variant={isVariable ? 'destructive' : 'outline'}
        onClick={() => onToggle(item)}
        disabled={isToggling}
        className={`h-8 px-3 text-xs gap-1.5 cursor-pointer shrink-0 ${
          isVariable
            ? 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20'
            : 'hover:border-primary/50 hover:text-primary'
        }`}
      >
        {isToggling ? (
          <RefreshCw size={12} className="animate-spin" />
        ) : isVariable ? (
          <>
            <Minus size={12} />
            Remove
          </>
        ) : (
          <>
            <Plus size={12} />
            Add to Board
          </>
        )}
      </Button>
    </div>
  );
}
