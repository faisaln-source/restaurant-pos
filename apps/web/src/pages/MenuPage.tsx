import { useState, useEffect, useRef } from 'react';
import {
  Plus, Pencil, Trash2, Search, Upload, ToggleLeft, ToggleRight,
  Database, Clock, MoreVertical,
  Calendar, TrendingUp, Eye, ChefHat,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  subscribeToCategories, subscribeToMenuItems,
  fetchCategories, fetchMenuItems,
  createCategory, updateCategory, deleteCategory,
  createMenuItem, updateMenuItem, deleteMenuItem,
  toggleItemAvailability, uploadMenuImage, seedMenu,
} from '../services/menu.service';
import { fetchKitchenStations } from '../services/kitchen-station.service';
import { useSocketEvent } from '../lib/socket';
import type { MenuCategory, MenuItem, KitchenStation } from '../lib/types';
import { useAuthStore } from '../store/authStore';
import DailyPriceBoardModal from '../components/DailyPriceBoardModal';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const EMOJI_OPTS = ['🥗', '🍽️', '🍕', '🍝', '🍰', '🥤', '🍔', '🌮', '🍣', '☕', '🍺', '🍦'];

const DAYS_LIST = [
  { key: 'monday', label: 'Mon' },
  { key: 'tuesday', label: 'Tue' },
  { key: 'wednesday', label: 'Wed' },
  { key: 'thursday', label: 'Thu' },
  { key: 'friday', label: 'Fri' },
  { key: 'saturday', label: 'Sat' },
  { key: 'sunday', label: 'Sun' },
];

// ── Category Dialog ──────────────────────────────────────────────────────────
function CategoryDialog({
  open,
  category,
  onClose,
}: {
  open: boolean;
  category: MenuCategory | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('🍽️');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? '');
      setIcon(category?.icon ?? '🍽️');
    }
  }, [open, category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      if (category) {
        await updateCategory(category.id, { name: name.trim(), icon });
        toast.success('Category updated');
      } else {
        await createCategory({ name: name.trim(), icon, displayOrder: 99 });
        toast.success('Category created');
      }
      onClose();
    } catch {
      toast.error('Failed to save category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{category ? 'Edit Category' : 'New Category'}</DialogTitle>
          <DialogDescription>
            Categories organize items on your POS screen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Category Name *</label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Starters, Main Course"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Category Icon</label>
            <div className="flex flex-wrap gap-2 pt-1">
              {EMOJI_OPTS.map(e => (
                <button
                  key={e}
                  type="button"
                  className={`h-9 w-9 rounded-lg text-lg flex items-center justify-center border transition-all ${
                    icon === e
                      ? 'border-primary bg-primary/15 scale-110 shadow-xs'
                      : 'border-border bg-card hover:bg-muted'
                  }`}
                  onClick={() => setIcon(e)}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Category'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Item Form Dialog ─────────────────────────────────────────────────────────
function ItemDialog({
  open,
  item,
  categories,
  activeCategoryId,
  kitchenStations,
  onClose,
  onOpenCategoryDialog,
}: {
  open: boolean;
  item: MenuItem | null;
  categories: MenuCategory[];
  activeCategoryId: string;
  kitchenStations: KitchenStation[];
  onClose: () => void;
  onOpenCategoryDialog?: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    description: '',
    price: '',
    categoryId: '',
    preparationTime: '10',
    isVeg: true,
    displayOrder: '1',
  });
  const [kitchenStationId, setKitchenStationId] = useState<string>('');
  const [isVariablePrice, setIsVariablePrice] = useState(false);
  const [dailyPrice, setDailyPrice] = useState('');
  const [dayPrices, setDayPrices] = useState<Record<string, string>>({
    monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: '',
  });

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setForm({
        name: item?.name ?? '',
        description: item?.description ?? '',
        price: item?.price?.toString() ?? '',
        categoryId: item?.categoryId ?? (activeCategoryId !== 'all' ? activeCategoryId : categories[0]?.id ?? ''),
        preparationTime: item?.preparationTime?.toString() ?? '10',
        isVeg: item?.isVeg ?? true,
        displayOrder: item?.displayOrder?.toString() ?? '1',
      });
      setKitchenStationId(item?.kitchenStationId ?? '');
      setIsVariablePrice(Boolean(item?.isVariablePrice));
      setDailyPrice(item?.dailyPrice != null ? String(item.dailyPrice) : '');

      const initialDayPrices: Record<string, string> = {
        monday: '', tuesday: '', wednesday: '', thursday: '', friday: '', saturday: '', sunday: '',
      };
      if (item?.dayPrices && typeof item.dayPrices === 'object') {
        Object.entries(item.dayPrices).forEach(([k, v]) => {
          if (v !== undefined && v !== null) initialDayPrices[k] = String(v);
        });
      }
      setDayPrices(initialDayPrices);

      setImageFile(null);
      setImagePreview(item?.imageUrl ?? '');
      setUploadProgress(null);
    }
  }, [open, item, categories, activeCategoryId]);

  const set = (k: string, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));

  const copyBasePriceToAllDays = () => {
    if (!form.price) return;
    const next: Record<string, string> = {};
    DAYS_LIST.forEach(({ key }) => {
      next[key] = form.price;
    });
    setDayPrices(next);
  };

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const clearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    setImageFile(null);
    setImagePreview('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryId) {
      toast.error('Please select or create a category first');
      return;
    }
    setLoading(true);
    setUploadProgress(null);
    try {
      const cat = categories.find(c => c.id === form.categoryId);
      let imageUrl = imagePreview ? (item?.imageUrl ?? '') : '';

      if (imageFile) {
        setUploadProgress(10);
        imageUrl = await uploadMenuImage(
          imageFile,
          item ? item.id : `dish_${Date.now()}`,
          (pct) => setUploadProgress(pct)
        );
      }

      const parsedDayPrices: Record<string, number> = {};
      if (isVariablePrice) {
        DAYS_LIST.forEach(({ key }) => {
          const val = parseFloat(dayPrices[key]);
          if (!isNaN(val) && val > 0) {
            parsedDayPrices[key] = val;
          }
        });
      }

      const data = {
        name: form.name.trim(),
        description: form.description.trim(),
        price: parseFloat(form.price),
        isVariablePrice,
        dailyPrice: isVariablePrice && dailyPrice ? parseFloat(dailyPrice) : null,
        dayPrices: isVariablePrice ? parsedDayPrices : null,
        categoryId: form.categoryId,
        categoryName: cat?.name ?? '',
        preparationTime: parseInt(form.preparationTime) || 10,
        isVeg: form.isVeg,
        isAvailable: item?.isAvailable ?? true,
        displayOrder: parseInt(form.displayOrder) || 1,
        imageUrl,
        kitchenStationId: kitchenStationId || null,
      };

      if (item) {
        await updateMenuItem(item.id, { ...data, imageUrl });
        toast.success('Dish updated');
      } else {
        await createMenuItem({ ...data, imageUrl });
        toast.success('Dish created');
      }
      onClose();
    } catch {
      toast.error('Failed to save item');
    } finally {
      setLoading(false);
      setUploadProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{item ? 'Edit Menu Item' : 'New Menu Item'}</DialogTitle>
          <DialogDescription>
            Set dish details, pricing, kitchen preparation time, and photo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Image Upload Area */}
          <div className="space-y-2">
            <div
              onClick={() => fileRef.current?.click()}
              className="relative h-32 rounded-xl border-2 border-dashed border-border hover:border-primary/50 transition-colors flex flex-col items-center justify-center cursor-pointer overflow-hidden bg-muted/30 group"
            >
              {imagePreview ? (
                <div className="relative h-full w-full">
                  <img src={imagePreview} alt="preview" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={clearImage}
                    title="Remove image"
                    className="absolute top-2 right-2 bg-background/80 hover:bg-destructive hover:text-white p-1.5 rounded-full transition-colors shadow-sm"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="absolute bottom-2 left-2 bg-background/80 px-2 py-0.5 rounded text-[10px] font-semibold">
                    Click to change photo
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground group-hover:text-foreground">
                  <Upload size={22} />
                  <span className="text-xs font-semibold">Click to upload dish photo</span>
                  <span className="text-[10px] text-muted-foreground">Real-time sync to Cloud / POS</span>
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImage} />
            </div>

            {uploadProgress !== null && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-bold text-primary">
                  <span>
                    {uploadProgress >= 40 && uploadProgress < 100
                      ? 'Saving to server...'
                      : uploadProgress === 100
                      ? 'Upload complete!'
                      : 'Uploading...'}
                  </span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-foreground">Dish Name *</label>
              <Input
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. Truffle Mushroom Risotto"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5 col-span-2">
              <label className="text-xs font-medium text-foreground">Description</label>
              <Input
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Brief ingredients or dish description..."
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Category *</label>
                {onOpenCategoryDialog && (
                  <button
                    type="button"
                    onClick={onOpenCategoryDialog}
                    className="text-xs text-primary hover:underline font-semibold"
                  >
                    + Add New Category
                  </button>
                )}
              </div>
              {categories.length === 0 ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-md text-xs text-amber-400 flex items-center justify-between">
                  <span>No categories found yet. Please create a category first.</span>
                  {onOpenCategoryDialog && (
                    <Button type="button" size="sm" variant="outline" onClick={onOpenCategoryDialog} className="h-7 text-xs ml-2">
                      + Add Category
                    </Button>
                  )}
                </div>
              ) : (
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={form.categoryId}
                  onChange={e => set('categoryId', e.target.value)}
                  required
                >
                  <option value="" disabled>Select a category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
                </select>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <ChefHat size={13} className="text-orange-400" /> Kitchen Station
              </label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={kitchenStationId}
                onChange={e => setKitchenStationId(e.target.value)}
              >
                <option value="">— No station (unrouted) —</option>
                {kitchenStations.filter(s => s.isActive).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-muted-foreground">Orders with this item will be sent to the selected kitchen station</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Price (₹) *</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Prep Time (minutes)</label>
              <Input
                type="number"
                min="1"
                value={form.preparationTime}
                onChange={e => set('preparationTime', e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Food Type</label>
              <div className="grid grid-cols-2 gap-2 h-10">
                <Button
                  type="button"
                  variant={form.isVeg ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => set('isVeg', true)}
                  className={`h-full text-xs font-semibold ${form.isVeg ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                >
                  🟢 Veg
                </Button>
                <Button
                  type="button"
                  variant={!form.isVeg ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => set('isVeg', false)}
                  className={`h-full text-xs font-semibold ${!form.isVeg ? 'bg-red-600 hover:bg-red-700 text-white' : ''}`}
                >
                  🔴 Non-Veg
                </Button>
              </div>
            </div>

            {/* Variable Day-Wise Pricing Section */}
            <div className="col-span-2 p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <TrendingUp size={14} className="text-primary" />
                    Variable Price on Different Days
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Enable day-specific rates (e.g. weekend surges or daily market catch)
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={isVariablePrice ? 'default' : 'outline'}
                  onClick={() => setIsVariablePrice(!isVariablePrice)}
                  className={`h-7 px-3 text-xs font-bold cursor-pointer ${
                    isVariablePrice ? 'bg-primary text-primary-foreground' : ''
                  }`}
                >
                  {isVariablePrice ? 'Enabled' : 'Disabled'}
                </Button>
              </div>

              {isVariablePrice && (
                <div className="space-y-3 pt-2 border-t border-border/50">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                      Day-of-Week Schedule (₹)
                    </span>
                    <button
                      type="button"
                      onClick={copyBasePriceToAllDays}
                      className="text-[11px] text-primary hover:underline cursor-pointer font-medium"
                    >
                      Copy Base Price ({form.price ? `₹${form.price}` : '₹0'}) to All Days
                    </button>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                    {DAYS_LIST.map(({ key, label }) => (
                      <div key={key} className="space-y-1 text-center">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">
                          {label}
                        </label>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          value={dayPrices[key] || ''}
                          onChange={(e) => setDayPrices((prev) => ({ ...prev, [key]: e.target.value }))}
                          placeholder={form.price || '0'}
                          className="h-8 text-xs font-mono text-center px-1"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Quick Daily Override for Today */}
                  <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-3">
                    <div className="text-[11px]">
                      <span className="font-bold text-foreground">Today's Override Rate:</span>
                      <span className="text-muted-foreground ml-1.5">
                        (Leave empty to use day schedule)
                      </span>
                    </div>
                    <div className="relative w-28 shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                        ₹
                      </span>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={dailyPrice}
                        onChange={(e) => setDailyPrice(e.target.value)}
                        placeholder="Optional"
                        className="h-8 pl-6 text-xs font-mono text-right"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>


          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Saving...' : 'Save Dish'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Menu Page ──────────────────────────────────────────────────────────
export default function MenuPage() {
  const { profile } = useAuthStore();
  const isAdmin = profile?.role === 'ADMIN' || profile?.role === 'MANAGER';

  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCatId, setActiveCatId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [selectedCat, setSelectedCat] = useState<MenuCategory | null>(null);
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [dailyBoardOpen, setDailyBoardOpen] = useState(false);
  const [kitchenStations, setKitchenStations] = useState<KitchenStation[]>([]);

  const variableItemsCount = items.filter(i => i.isVariablePrice).length;

  useEffect(() => {
    const unsub1 = subscribeToCategories((cats) => {
      setCategories(cats);
    });
    const unsub2 = subscribeToMenuItems(setItems);
    fetchKitchenStations().then(setKitchenStations).catch(() => {});
    return () => { unsub1(); unsub2(); };
  }, []);

  useSocketEvent('menu:updated', () => {
    fetchCategories().then(setCategories).catch(console.error);
    fetchMenuItems().then(setItems).catch(console.error);
  });

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedMenu();
      toast.success('Sample menu loaded!');
    } catch {
      toast.error('Seed failed');
    } finally {
      setSeeding(false);
    }
  };

  const handleDeleteCategory = async (cat: MenuCategory) => {
    const count = items.filter(i => i.categoryId === cat.id).length;
    if (count > 0) {
      toast.error(`Cannot delete category with ${count} items`);
      return;
    }
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await deleteCategory(cat.id);
      toast.success('Category deleted');
      if (activeCatId === cat.id) setActiveCatId('all');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleDeleteItem = async (item: MenuItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    try {
      await deleteMenuItem(item.id);
      toast.success('Item deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      await toggleItemAvailability(item.id, !item.isAvailable);
      toast.success(item.isAvailable ? 'Marked unavailable' : 'Marked available');
    } catch {
      toast.error('Failed to update');
    }
  };

  const filteredItems = items.filter(i => {
    const matchesCat = activeCatId === 'all' || i.categoryId === activeCatId;
    const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Read-only notice for non-admin roles */}
      {!isAdmin && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl border border-amber-500/30 bg-amber-500/8 text-amber-400 text-xs font-semibold">
          <Eye size={14} className="shrink-0" />
          <span>You are viewing the menu in <strong>read-only</strong> mode. Contact an Admin or Manager to make changes.</span>
        </div>
      )}
    <div className="flex flex-col lg:flex-row gap-5">
      {/* Categories Left Sidebar Card */}
      <Card className="w-full lg:w-[270px] flex-shrink-0 flex flex-col border-border/80 bg-card/70 shadow-sm rounded-2xl" style={{ alignSelf: 'flex-start', position: 'sticky', top: 0, maxHeight: 'calc(100vh - 120px)', overflow: 'hidden' }}>
        <div className="p-4 border-b border-border/80 flex items-center justify-between">
          <h3 className="font-extrabold text-sm text-foreground uppercase tracking-wider">Categories</h3>
          {isAdmin && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 rounded-xl text-primary hover:bg-primary/10"
              onClick={() => { setSelectedCat(null); setCatDialogOpen(true); }}
              title="Add Category"
            >
              <Plus size={18} />
            </Button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
          <div className={`group flex items-center justify-between px-3.5 py-3 rounded-xl text-sm font-bold transition-all ${
            activeCatId === 'all'
              ? 'bg-primary/15 text-primary shadow-xs'
              : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}>
            <button
              onClick={() => setActiveCatId('all')}
              className="flex items-center gap-2.5 flex-1 text-left"
            >
              <span>🍽️ All Items</span>
            </button>
            <div className="flex items-center gap-1.5 shrink-0">
              <Badge variant="secondary" className="text-xs py-0.5 px-2 h-5 font-mono font-bold">
                {items.length}
              </Badge>
              {isAdmin && (
                <button
                  title="Add new item"
                  onClick={(e) => { e.stopPropagation(); setActiveCatId('all'); setSelectedItem(null); setItemDialogOpen(true); }}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-primary/15 hover:text-primary transition-all"
                >
                  <Plus size={14} />
                </button>
              )}
            </div>
          </div>

          {categories.map(cat => {
            const itemCount = items.filter(i => i.categoryId === cat.id).length;
            const active = activeCatId === cat.id;
            return (
              <div
                key={cat.id}
                className={`group flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  active
                    ? 'bg-primary/15 text-primary font-bold shadow-xs'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                }`}
              >
                <button
                  onClick={() => setActiveCatId(cat.id)}
                  className="flex items-center gap-2.5 flex-1 text-left truncate mr-2"
                >
                  <span className="text-base">{cat.icon}</span>
                  <span className="truncate">{cat.name}</span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs opacity-75 font-mono font-bold">{itemCount}</span>
                  {isAdmin && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-foreground rounded-lg transition-opacity">
                          <MoreVertical size={14} />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem
                          onClick={() => { setSelectedCat(cat); setCatDialogOpen(true); }}
                          className="text-xs cursor-pointer py-2"
                        >
                          <Pencil size={14} className="mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => handleDeleteCategory(cat)}
                          className="text-xs text-destructive focus:text-destructive cursor-pointer py-2"
                        >
                          <Trash2 size={14} className="mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {isAdmin && categories.length === 0 && (
          <div className="p-3.5 border-t border-border/60">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSeed}
              disabled={seeding}
              className="w-full text-xs h-10 font-bold gap-2 rounded-xl"
            >
              <Database size={14} /> {seeding ? 'Loading...' : 'Load Sample Menu'}
            </Button>
          </div>
        )}
      </Card>

      {/* Main Dishes Grid */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Top Search & Actions Bar */}
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search dishes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-10 h-11 bg-card/60 text-sm rounded-xl border-border/80"
            />
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDailyBoardOpen(true)}
                className="h-11 px-3.5 gap-2 font-bold text-xs sm:text-sm border-primary/30 text-primary hover:bg-primary/10 rounded-xl cursor-pointer"
                title="Quickly set or adjust today's prices for variable dishes"
              >
                <Calendar size={16} />
                <span className="hidden sm:inline">Daily Price Board</span>
                <span className="sm:hidden">Daily Rates</span>
                {variableItemsCount > 0 && (
                  <Badge className="bg-primary text-primary-foreground h-5 px-1.5 text-[10px] font-bold">
                    {variableItemsCount}
                  </Badge>
                )}
              </Button>

              <Button
                size="sm"
                onClick={() => { setSelectedItem(null); setItemDialogOpen(true); }}
                className="h-11 px-5 gap-2 font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-md shadow-orange-500/20 cursor-pointer"
              >
                <Plus size={16} /> Add Item
              </Button>
            </div>
          )}
        </div>

        {/* Food Items Grid */}
        {filteredItems.length === 0 ? (
          <Card className="flex-1 flex flex-col items-center justify-center border-dashed p-12 text-center text-muted-foreground rounded-2xl">
            <span className="text-5xl mb-3">🍽️</span>
            <p className="text-base font-bold text-foreground">
              {search ? 'No items match your search' : 'No items in this category yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              {isAdmin
                ? 'Add your first dish to this category to display it on the POS menu.'
                : 'No dishes are available here yet.'}
            </p>
            {isAdmin && (
              <Button
                size="sm"
                className="mt-5 h-11 px-5 font-bold rounded-xl gap-2 bg-primary text-primary-foreground"
                onClick={() => { setSelectedItem(null); setItemDialogOpen(true); }}
              >
                <Plus size={16} /> Add First Item
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5 pb-6">
            {filteredItems.map(item => (
              <Card
                key={item.id}
                className={`overflow-hidden border-border/80 bg-card/80 hover:border-primary/50 transition-all hover:-translate-y-1 hover:shadow-lg flex flex-col group rounded-2xl ${
                  !item.isAvailable ? 'opacity-60' : ''
                }`}
              >
                {/* Image & Veg badge */}
                <div className="relative h-36 sm:h-40 bg-muted/40 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover transition-transform group-hover:scale-105 duration-200" />
                  ) : (
                    <span className="text-5xl opacity-40">🍽️</span>
                  )}
                  <Badge
                    variant="outline"
                    className={`absolute top-2.5 left-2.5 text-[10px] font-extrabold py-0.5 px-2 border-none shadow-sm rounded-md ${
                      item.isVeg ? 'bg-emerald-500/95 text-white' : 'bg-red-500/95 text-white'
                    }`}
                  >
                    {item.isVeg ? 'VEG' : 'NON-VEG'}
                  </Badge>

                  {item.isVariablePrice && (
                    <Badge
                      className="absolute top-2.5 right-2.5 text-[9px] font-extrabold py-0.5 px-2 bg-amber-500/90 text-black border-none shadow-sm rounded-md"
                    >
                      VARIABLE RATE
                    </Badge>
                  )}

                  {!item.isAvailable && (
                    <div className="absolute inset-0 bg-background/85 backdrop-blur-2xs flex items-center justify-center text-xs font-black text-destructive uppercase tracking-widest">
                      Unavailable
                    </div>
                  )}
                </div>

                {/* Content */}
                <CardContent className="p-4 flex flex-col justify-between gap-3">
                  <div>
                    <span className="text-[11px] font-bold text-primary uppercase tracking-wider block">
                      {item.categoryName}
                    </span>
                    {item.kitchenStationId && (() => {
                      const station = kitchenStations.find(s => s.id === item.kitchenStationId);
                      return station ? (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-md mt-0.5"
                          style={{ backgroundColor: station.color + '25', color: station.color }}
                        >
                          <ChefHat size={9} /> {station.name}
                        </span>
                      ) : null;
                    })()}
                    <h4 className="text-base font-bold text-foreground line-clamp-1 mt-0.5">{item.name}</h4>
                    {item.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{item.description}</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/50">
                    <div className="flex flex-col">
                      <span className="text-xl font-black text-foreground">₹{item.price.toFixed(2)}</span>
                      {item.isVariablePrice && (
                        <span className="text-[10px] font-bold text-primary flex items-center gap-1 mt-0.5">
                          <TrendingUp size={11} /> Today: ₹{(item.effectivePrice ?? item.price).toFixed(2)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold">
                      <Clock size={13} />
                      <span>{item.preparationTime}m</span>
                    </div>
                  </div>
                </CardContent>

                {/* Card Actions Footer */}
                <div className="px-4 py-2.5 bg-muted/25 border-t border-border/60 flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs font-semibold gap-1.5 text-muted-foreground hover:text-foreground"
                    title={item.isAvailable ? 'Mark unavailable' : 'Mark available'}
                    onClick={() => handleToggleAvailability(item)}
                  >
                    {item.isAvailable ? (
                      <>
                        <ToggleRight size={18} className="text-emerald-500" />
                        <span className="text-emerald-400 font-bold">Active</span>
                      </>
                    ) : (
                      <>
                        <ToggleLeft size={18} className="text-muted-foreground" />
                        <span>Off</span>
                      </>
                    )}
                  </Button>

                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground rounded-lg"
                      onClick={() => { setSelectedItem(item); setItemDialogOpen(true); }}
                      title="Edit dish details & day rates"
                    >
                      <Pencil size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"
                      onClick={() => handleDeleteItem(item)}
                      title="Delete dish"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <>
        {/* Category Dialog */}
        <CategoryDialog
          open={catDialogOpen}
          category={selectedCat}
          onClose={() => { setCatDialogOpen(false); setSelectedCat(null); }}
        />

        {/* Item Dialog */}
        <ItemDialog
          open={itemDialogOpen}
          item={selectedItem}
          categories={categories}
          activeCategoryId={activeCatId}
          kitchenStations={kitchenStations}
          onClose={() => { setItemDialogOpen(false); setSelectedItem(null); }}
          onOpenCategoryDialog={() => { setItemDialogOpen(false); setSelectedCat(null); setCatDialogOpen(true); }}
        />

        {/* Daily Price Board Modal */}
        <DailyPriceBoardModal
          open={dailyBoardOpen}
          onClose={() => setDailyBoardOpen(false)}
          onPricesUpdated={() => fetchMenuItems().then(setItems).catch(console.error)}
        />
      </>
    </div>
    </div>
  );
}
