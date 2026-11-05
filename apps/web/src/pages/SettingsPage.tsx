import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Settings, User, Lock, Bell, Store,
  Save, Shield, KeyRound, PlusCircle, Trash2, Building2, Percent,
  ChefHat, Pencil, Check, X, UtensilsCrossed, ChevronDown, ChevronRight, Search,
  Upload, AlertTriangle, FileSpreadsheet, RefreshCw, Smartphone, Server, ShieldCheck,
} from 'lucide-react';
import { isCapacitor, getApiBaseUrl } from '../lib/capacitor';
import { isTauri, getLicenseInfo, LicensePayload } from '../lib/tauri';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '../store/authStore';
import { changePassword, updateUserProfile } from '../services/auth.service';
import api from '../lib/api';
import { fetchFloorSections } from '../services/table.service';
import {
  fetchKitchenStations,
  createKitchenStation,
  updateKitchenStation,
  deleteKitchenStation,
} from '../services/kitchen-station.service';
import { fetchMenuItems, updateMenuItem } from '../services/menu.service';
import type { KitchenStation, MenuItem } from '../lib/types';
import toast from 'react-hot-toast';


interface RestaurantSettings {
  restaurantName: string;
  taxRate: number;
  currency: string;
  enableNotifications: boolean;
  enableSounds: boolean;
  autoConfirmOrders: boolean;
  showPrepTime: boolean;
  darkMode: boolean;
}

const DEFAULT_SETTINGS: RestaurantSettings = {
  restaurantName: 'RestoPOS',
  taxRate: 5,
  currency: '₹',
  enableNotifications: true,
  enableSounds: true,
  autoConfirmOrders: false,
  showPrepTime: true,
  darkMode: true,
};

const STATION_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6',
  '#a855f7', '#ec4899', '#14b8a6', '#f97316', '#64748b',
];

// ── Toggle switch ────────────────────────────────────────────────────────────
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        checked ? 'bg-primary' : 'bg-muted'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const { profile } = useAuthStore();
  const [settings, setSettings] = useState<RestaurantSettings>(() => {
    const saved = localStorage.getItem('pos_settings');
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });

  const [profileName, setProfileName] = useState(profile?.name ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const updateSetting = <K extends keyof RestaurantSettings>(key: K, value: RestaurantSettings[K]) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem('pos_settings', JSON.stringify(next));
      return next;
    });
  };

  const handleSaveProfile = async () => {
    if (!profileName.trim()) { toast.error('Name cannot be empty'); return; }
    if (!profile) return;
    setSavingProfile(true);
    try {
      await updateUserProfile(profile.id, { name: profileName });
      toast.success('Profile updated');
    } catch {
      toast.error('Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) { toast.error('Fill in all fields'); return; }
    if (newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { toast.error('Passwords do not match'); return; }
    setChangingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  // ── Section Charges ─────────────────────────────────────────────────────────
  interface SectionCharge {
    id: string;
    floorSection: string;
    label: string;
    amount: number;
    isPercent: boolean;
    isActive: boolean;
    displayOrder: number;
  }

  const [sectionCharges, setSectionCharges] = useState<SectionCharge[]>([]);
  const [loadingCharges, setLoadingCharges] = useState(true);
  const [newCharge, setNewCharge] = useState({ floorSection: '', label: '', amount: '', isPercent: false });
  const [savingCharge, setSavingCharge] = useState(false);
  const [floorSections, setFloorSections] = useState<string[]>([]);

  useEffect(() => {
    api.get<SectionCharge[]>('/api/section-charges')
      .then(d => setSectionCharges(d))
      .catch(() => {})
      .finally(() => setLoadingCharges(false));

    fetchFloorSections()
      .then(sections => {
        setFloorSections(sections);
        if (sections.length > 0) {
          setNewCharge(p => ({ ...p, floorSection: sections[0] }));
        }
      })
      .catch(() => {});
  }, []);

  const handleAddCharge = async () => {
    if (!newCharge.floorSection.trim()) { toast.error('Enter a floor section name'); return; }
    if (!newCharge.label.trim()) { toast.error('Enter a charge label'); return; }
    const amt = parseFloat(newCharge.amount);
    if (isNaN(amt) || amt <= 0) { toast.error('Enter a valid positive amount'); return; }
    setSavingCharge(true);
    try {
      const created = await api.post<SectionCharge>('/api/section-charges', {
        floorSection: newCharge.floorSection.trim(),
        label: newCharge.label.trim(),
        amount: amt,
        isPercent: newCharge.isPercent,
      });
      setSectionCharges(prev => [...prev, created]);
      setNewCharge({ floorSection: '', label: '', amount: '', isPercent: false });
      toast.success('Charge added');
    } catch { toast.error('Failed to add charge'); }
    finally { setSavingCharge(false); }
  };

  const handleDeleteCharge = async (id: string) => {
    try {
      await api.delete(`/api/section-charges/${id}`);
      setSectionCharges(prev => prev.filter(c => c.id !== id));
      toast.success('Charge removed');
    } catch { toast.error('Failed to remove charge'); }
  };

  const handleToggleCharge = async (charge: SectionCharge) => {
    try {
      const updated = await api.patch<SectionCharge>(`/api/section-charges/${charge.id}`, { isActive: !charge.isActive });
      setSectionCharges(prev => prev.map(c => c.id === charge.id ? updated : c));
    } catch { toast.error('Failed to update'); }
  };

  const chargesBySection = sectionCharges.reduce<Record<string, SectionCharge[]>>((acc, c) => {
    if (!acc[c.floorSection]) acc[c.floorSection] = [];
    acc[c.floorSection].push(c);
    return acc;
  }, {});

  // ── Kitchen Stations ────────────────────────────────────────────────────────
  const [kitchenStations, setKitchenStations] = useState<KitchenStation[]>([]);
  const [loadingStations, setLoadingStations] = useState(true);
  const [newStation, setNewStation] = useState({ name: '', description: '', color: '#6366f1' });
  const [savingStation, setSavingStation] = useState(false);
  const [editingStationId, setEditingStationId] = useState<string | null>(null);
  const [editStationData, setEditStationData] = useState({ name: '', description: '', color: '' });

  // Item assignment state
  const [expandedStationId, setExpandedStationId] = useState<string | null>(null);
  const [allMenuItems, setAllMenuItems] = useState<MenuItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [itemSearch, setItemSearch] = useState('');
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  useEffect(() => {
    fetchKitchenStations()
      .then(d => setKitchenStations(d))
      .catch(() => {})
      .finally(() => setLoadingStations(false));
  }, []);

  // Load menu items once when first station is expanded
  const loadMenuItems = async () => {
    if (allMenuItems.length > 0) return;
    setLoadingItems(true);
    try {
      const items = await fetchMenuItems();
      setAllMenuItems(items);
    } catch { toast.error('Failed to load menu items'); }
    finally { setLoadingItems(false); }
  };

  const handleToggleExpand = async (stationId: string) => {
    if (expandedStationId === stationId) {
      setExpandedStationId(null);
    } else {
      setExpandedStationId(stationId);
      setItemSearch('');
      await loadMenuItems();
    }
  };

  const handleAddStation = async () => {
    if (!newStation.name.trim()) { toast.error('Enter a station name'); return; }
    setSavingStation(true);
    try {
      const created = await createKitchenStation({
        name: newStation.name.trim(),
        description: newStation.description.trim() || undefined,
        color: newStation.color,
        displayOrder: kitchenStations.length,
      });
      setKitchenStations(prev => [...prev, created]);
      setNewStation({ name: '', description: '', color: '#6366f1' });
      toast.success('Kitchen station added');
    } catch { toast.error('Failed to add station'); }
    finally { setSavingStation(false); }
  };

  const handleUpdateStation = async (id: string) => {
    try {
      const updated = await updateKitchenStation(id, {
        name: editStationData.name.trim(),
        description: editStationData.description.trim() || undefined,
        color: editStationData.color,
      });
      setKitchenStations(prev => prev.map(s => s.id === id ? updated : s));
      setEditingStationId(null);
      toast.success('Station updated');
    } catch { toast.error('Failed to update station'); }
  };

  const handleToggleStation = async (station: KitchenStation) => {
    try {
      const updated = await updateKitchenStation(station.id, { isActive: !station.isActive });
      setKitchenStations(prev => prev.map(s => s.id === station.id ? updated : s));
    } catch { toast.error('Failed to update'); }
  };

  const handleDeleteStation = async (id: string) => {
    try {
      await deleteKitchenStation(id);
      setKitchenStations(prev => prev.filter(s => s.id !== id));
      if (expandedStationId === id) setExpandedStationId(null);
      toast.success('Station removed');
    } catch { toast.error('Failed to remove station'); }
  };

  const startEditStation = (station: KitchenStation) => {
    setEditingStationId(station.id);
    setEditStationData({ name: station.name, description: station.description ?? '', color: station.color });
  };

  // Assign / unassign an item to/from this station
  const handleAssignItem = async (item: MenuItem, stationId: string | null) => {
    setSavingItemId(item.id);
    try {
      const updated = await updateMenuItem(item.id, { kitchenStationId: stationId });
      setAllMenuItems(prev => prev.map(i => i.id === item.id ? { ...i, kitchenStationId: updated.kitchenStationId } : i));
      toast.success(stationId ? 'Item assigned to station' : 'Item unassigned');
    } catch { toast.error('Failed to update item'); }
    finally { setSavingItemId(null); }
  };

  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    return allMenuItems.filter(i =>
      !q || i.name.toLowerCase().includes(q) || (i.categoryName ?? '').toLowerCase().includes(q)
    );
  }, [allMenuItems, itemSearch]);

  // Group filtered items by category
  const itemsByCategory = useMemo(() =>
    filteredItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
      const cat = item.categoryName ?? 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {}),
  [filteredItems]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
          <Settings className="w-6 h-6 text-primary" /> Settings
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure restaurant parameters, regional details, alerts, and account security
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6">

        {/* ── Profile ─────────────────────────────────────────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
                <User className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">User Profile</CardTitle>
                <CardDescription className="text-xs">Your personal account details and access level</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 border-2 border-primary/20">
                <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
                  {profile?.name?.charAt(0).toUpperCase() ?? '?'}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-foreground text-lg">{profile?.name ?? 'User'}</h3>
                  <Badge variant="outline" className="font-semibold text-xs border-primary/30 text-primary gap-1">
                    <Shield className="w-3 h-3" /> {profile?.role ?? 'STAFF'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{profile?.email ?? '—'}</p>
              </div>
            </div>
            <div className="space-y-2 max-w-sm">
              <label className="text-xs font-semibold text-foreground">Display Name</label>
              <Input value={profileName} onChange={e => setProfileName(e.target.value)} placeholder="Enter your name" />
            </div>
          </CardContent>
          <CardFooter className="px-6 py-3 bg-muted/20 border-t border-border/50 flex justify-end">
            <Button onClick={handleSaveProfile} disabled={savingProfile} className="gap-2 font-semibold">
              <Save className="w-4 h-4" />
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardFooter>
        </Card>

        {/* ── Restaurant Preferences ───────────────────────────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">Restaurant Preferences</CardTitle>
                <CardDescription className="text-xs">Store branding, tax rates, and checkout behavior</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 divide-y divide-border/40">
            <div className="flex items-center justify-between py-3.5 first:pt-0">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Restaurant Name</p>
                <p className="text-xs text-muted-foreground">Displayed on the top header, sidebar, and print receipts</p>
              </div>
              <Input className="w-56" value={settings.restaurantName} onChange={e => updateSetting('restaurantName', e.target.value)} />
            </div>
            <div className="flex items-center justify-between py-3.5">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Default Tax Rate (%)</p>
                <p className="text-xs text-muted-foreground">Standard GST or service tax automatically applied at checkout</p>
              </div>
              <Input
                className="w-28 text-right font-mono"
                type="number" min={0} max={100} step={0.5}
                value={settings.taxRate}
                onChange={e => updateSetting('taxRate', Number(e.target.value))}
              />
            </div>
            <div className="flex items-center justify-between py-3.5">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Auto-confirm New Orders</p>
                <p className="text-xs text-muted-foreground">Bypass manual review and immediately transmit orders to kitchen display</p>
              </div>
              <Toggle checked={settings.autoConfirmOrders} onChange={v => updateSetting('autoConfirmOrders', v)} />
            </div>
            <div className="flex items-center justify-between py-3.5 last:pb-0">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Show Preparation Time</p>
                <p className="text-xs text-muted-foreground">Display estimated preparation durations on customer tickets</p>
              </div>
              <Toggle checked={settings.showPrepTime} onChange={v => updateSetting('showPrepTime', v)} />
            </div>
          </CardContent>
        </Card>

        {/* ── Notifications & Sound ────────────────────────────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">Notifications & Sound</CardTitle>
                <CardDescription className="text-xs">Audio chimes and live browser push triggers</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 divide-y divide-border/40">
            <div className="flex items-center justify-between py-3.5 first:pt-0">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Order Notifications</p>
                <p className="text-xs text-muted-foreground">Receive real-time toast alerts when new orders are created or updated</p>
              </div>
              <Toggle checked={settings.enableNotifications} onChange={v => updateSetting('enableNotifications', v)} />
            </div>
            <div className="flex items-center justify-between py-3.5 last:pb-0">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Kitchen Chime Sounds</p>
                <p className="text-xs text-muted-foreground">Play bell notification chime when kitchen orders are marked ready</p>
              </div>
              <Toggle checked={settings.enableSounds} onChange={v => updateSetting('enableSounds', v)} />
            </div>
          </CardContent>
        </Card>

        {/* ── Security ─────────────────────────────────────────────────────── */}
        <Card className="border-rose-500/30 bg-rose-950/5">
          <CardHeader className="pb-4 border-b border-rose-500/20">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-rose-500/10 text-rose-400 flex items-center justify-center">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-rose-400">Security & Credentials</CardTitle>
                <CardDescription className="text-xs">Update your sign-in password to protect your terminal</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Current Password</label>
                <Input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} placeholder="••••••••" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">New Password</label>
                <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
                <Input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Re-type password" />
              </div>
            </div>
          </CardContent>
          <CardFooter className="px-6 py-3 bg-rose-500/5 border-t border-rose-500/20 flex justify-end">
            <Button variant="destructive" onClick={handleChangePassword} disabled={changingPassword} className="gap-2 font-semibold">
              <KeyRound className="w-4 h-4" />
              {changingPassword ? 'Updating...' : 'Change Password'}
            </Button>
          </CardFooter>
        </Card>

        {/* ── Kitchen Stations ─────────────────────────────────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center">
                <ChefHat className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">Kitchen Stations</CardTitle>
                <CardDescription className="text-xs">
                  Define kitchen stations (e.g. Juice Bar, Grill, Bakery) and assign menu items to each.
                  Orders are automatically routed to the correct station.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">

            {/* Existing stations */}
            {loadingStations ? (
              <div className="text-xs text-muted-foreground">Loading stations...</div>
            ) : kitchenStations.length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-4 text-center border border-dashed border-border rounded-xl">
                No kitchen stations yet. Add one below.
              </div>
            ) : (
              <div className="space-y-3">
                {kitchenStations.map(station => {
                  const isEditing = editingStationId === station.id;
                  const isExpanded = expandedStationId === station.id;
                  const assignedCount = allMenuItems.filter(i => i.kitchenStationId === station.id).length;

                  return (
                    <div
                      key={station.id}
                      className="rounded-xl border border-border/60 overflow-hidden"
                    >
                      {/* Station header row */}
                      <div className="flex items-center gap-3 p-3 bg-muted/20">
                        {/* Color dot */}
                        <span
                          className="h-3.5 w-3.5 rounded-full shrink-0 ring-2 ring-offset-1 ring-offset-background"
                          style={{ backgroundColor: station.color }}
                        />

                        {isEditing ? (
                          /* ── Edit mode ── */
                          <div className="flex-1 flex items-center gap-2 flex-wrap">
                            <Input
                              value={editStationData.name}
                              onChange={e => setEditStationData(p => ({ ...p, name: e.target.value }))}
                              className="h-7 text-xs w-36"
                              placeholder="Station name"
                            />
                            <Input
                              value={editStationData.description}
                              onChange={e => setEditStationData(p => ({ ...p, description: e.target.value }))}
                              className="h-7 text-xs w-44"
                              placeholder="Description (optional)"
                            />
                            <div className="flex gap-1">
                              {STATION_COLORS.map(c => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setEditStationData(p => ({ ...p, color: c }))}
                                  className="h-5 w-5 rounded-full border-2 cursor-pointer transition-transform hover:scale-110"
                                  style={{
                                    backgroundColor: c,
                                    borderColor: editStationData.color === c ? 'white' : 'transparent',
                                  }}
                                />
                              ))}
                            </div>
                            <div className="flex gap-1 ml-auto">
                              <button
                                type="button"
                                onClick={() => handleUpdateStation(station.id)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer"
                              >
                                <Check size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingStationId(null)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:bg-muted/80 cursor-pointer"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* ── View mode ── */
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-bold text-foreground">{station.name}</span>
                                {!station.isActive && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-muted-foreground">Inactive</Badge>
                                )}
                                {allMenuItems.length > 0 && (
                                  <span className="text-[10px] text-muted-foreground font-mono">
                                    {assignedCount} item{assignedCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                              </div>
                              {station.description && (
                                <p className="text-[11px] text-muted-foreground mt-0.5">{station.description}</p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {/* Assign items toggle */}
                              <button
                                type="button"
                                onClick={() => handleToggleExpand(station.id)}
                                className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-bold border border-orange-500/30 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 cursor-pointer transition-colors"
                              >
                                <UtensilsCrossed size={11} />
                                Items
                                {isExpanded
                                  ? <ChevronDown size={11} />
                                  : <ChevronRight size={11} />
                                }
                              </button>
                              {/* Active toggle */}
                              <Toggle checked={station.isActive} onChange={() => handleToggleStation(station)} />
                              {/* Edit */}
                              <button
                                type="button"
                                onClick={() => startEditStation(station)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer"
                              >
                                <Pencil size={13} />
                              </button>
                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => handleDeleteStation(station.id)}
                                className="h-7 w-7 flex items-center justify-center rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      {/* ── Item assignment panel ── */}
                      {isExpanded && (
                        <div className="border-t border-border/50 p-4 space-y-3 bg-background/50">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                              <UtensilsCrossed size={13} className="text-orange-400" />
                              Assign Menu Items to <span style={{ color: station.color }}>{station.name}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              Checked items will be routed here on orders
                            </p>
                          </div>

                          {/* Search */}
                          <div className="relative">
                            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              value={itemSearch}
                              onChange={e => setItemSearch(e.target.value)}
                              placeholder="Search items or categories..."
                              className="h-8 text-xs pl-8"
                            />
                          </div>

                          {loadingItems ? (
                            <div className="text-xs text-muted-foreground py-4 text-center">Loading menu items...</div>
                          ) : filteredItems.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-4 text-center">No items found</div>
                          ) : (
                            <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                              {Object.entries(itemsByCategory).map(([cat, items]) => (
                                <div key={cat}>
                                  <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1.5">{cat}</p>
                                  <div className="space-y-1">
                                    {items.map(item => {
                                      const isAssignedHere = item.kitchenStationId === station.id;
                                      const isAssignedElsewhere = item.kitchenStationId && item.kitchenStationId !== station.id;
                                      const otherStation = isAssignedElsewhere
                                        ? kitchenStations.find(s => s.id === item.kitchenStationId)
                                        : null;
                                      const isSaving = savingItemId === item.id;

                                      return (
                                        <div
                                          key={item.id}
                                          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-all ${
                                            isAssignedHere
                                              ? 'border-orange-500/30 bg-orange-500/8'
                                              : 'border-border/40 hover:border-border/80 hover:bg-muted/30'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2 min-w-0">
                                            {/* Checkbox */}
                                            <button
                                              type="button"
                                              disabled={isSaving}
                                              onClick={() =>
                                                handleAssignItem(item, isAssignedHere ? null : station.id)
                                              }
                                              className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                                                isAssignedHere
                                                  ? 'bg-orange-500 border-orange-500 text-white'
                                                  : 'border-border bg-background hover:border-orange-400'
                                              }`}
                                            >
                                              {isAssignedHere && <Check size={10} />}
                                            </button>
                                            <span className="font-medium text-foreground truncate">{item.name}</span>
                                            <span className={`text-[10px] px-1 rounded font-bold ${item.isVeg ? 'text-emerald-400' : 'text-rose-400'}`}>
                                              {item.isVeg ? 'VEG' : 'NON'}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-2 shrink-0">
                                            {isSaving && (
                                              <span className="h-3 w-3 animate-spin rounded-full border border-orange-400 border-t-transparent" />
                                            )}
                                            {isAssignedElsewhere && otherStation && (
                                              <span
                                                className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                                                style={{ backgroundColor: otherStation.color + '25', color: otherStation.color }}
                                              >
                                                {otherStation.name}
                                              </span>
                                            )}
                                            {!item.kitchenStationId && (
                                              <span className="text-[10px] text-muted-foreground">Unassigned</span>
                                            )}
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Separator className="bg-border/50" />

            {/* Add new station */}
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-foreground">Add New Kitchen Station</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Station Name</label>
                  <Input
                    placeholder="e.g. Juice Bar"
                    value={newStation.name}
                    onChange={e => setNewStation(p => ({ ...p, name: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
                  <Input
                    placeholder="e.g. Handles all beverages"
                    value={newStation.description}
                    onChange={e => setNewStation(p => ({ ...p, description: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Color</label>
                  <div className="flex gap-1.5 items-center h-8">
                    {STATION_COLORS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewStation(p => ({ ...p, color: c }))}
                        className="h-5 w-5 rounded-full border-2 cursor-pointer transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c,
                          borderColor: newStation.color === c ? 'white' : 'transparent',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full ring-2 ring-offset-1 ring-offset-background" style={{ backgroundColor: newStation.color }} />
                <Button
                  onClick={handleAddStation}
                  disabled={savingStation}
                  size="sm"
                  className="gap-2 font-bold"
                  style={{ backgroundColor: newStation.color }}
                >
                  <PlusCircle size={14} />
                  {savingStation ? 'Adding...' : 'Add Station'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Floor Section Charges ────────────────────────────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-4 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-violet-500/10 text-violet-400 flex items-center justify-center">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <CardTitle className="text-base font-bold">Floor Section Charges</CardTitle>
                <CardDescription className="text-xs">
                  Automatic surcharges applied when a dine-in table order is created — per floor section (e.g. Bar, Terrace).
                  Any section with no charges listed (e.g. Ground Floor) gets none automatically.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {loadingCharges ? (
              <div className="text-xs text-muted-foreground">Loading...</div>
            ) : Object.keys(chargesBySection).length === 0 ? (
              <div className="text-xs text-muted-foreground italic py-4 text-center border border-dashed border-border rounded-xl">
                No section charges configured yet. Add one below.
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(chargesBySection).map(([section, charges]) => (
                  <div key={section} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Building2 size={13} className="text-violet-400" />
                      <span className="text-xs font-black uppercase tracking-wider text-violet-300">{section}</span>
                      <span className="text-[10px] text-muted-foreground">({charges.length} charge{charges.length !== 1 ? 's' : ''})</span>
                    </div>
                    <div className="space-y-1.5 pl-5">
                      {charges.map(c => (
                        <div
                          key={c.id}
                          className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border text-xs transition-all ${
                            c.isActive
                              ? 'border-violet-500/30 bg-violet-500/5'
                              : 'border-border/40 bg-muted/20 opacity-60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <PlusCircle size={12} className={c.isActive ? 'text-violet-400' : 'text-muted-foreground'} />
                            <span className="font-semibold text-foreground truncate">{c.label}</span>
                            {c.isPercent && <Percent size={10} className="text-muted-foreground shrink-0" />}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-mono font-bold text-violet-300">
                              {c.isPercent ? `${c.amount}%` : `₹${Number(c.amount).toFixed(2)}`}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleCharge(c)}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                                c.isActive
                                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                                  : 'bg-muted border-border text-muted-foreground hover:bg-muted/80'
                              }`}
                            >
                              {c.isActive ? 'Active' : 'Disabled'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCharge(c.id)}
                              className="h-6 w-6 flex items-center justify-center rounded-lg text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                              title="Delete charge"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Separator className="bg-border/50" />

            {/* Add new charge form */}
            <div className="space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-foreground">Add New Charge</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Floor Section</label>
                  {floorSections.length > 0 ? (
                    <select
                      value={newCharge.floorSection}
                      onChange={e => setNewCharge(p => ({ ...p, floorSection: e.target.value }))}
                      className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs font-medium text-foreground shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 cursor-pointer"
                    >
                      {floorSections.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : (
                    <Input
                      placeholder="e.g. Bar"
                      value={newCharge.floorSection}
                      onChange={e => setNewCharge(p => ({ ...p, floorSection: e.target.value }))}
                      className="h-8 text-xs"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Charge Label</label>
                  <Input
                    placeholder="e.g. Cover Charge"
                    value={newCharge.label}
                    onChange={e => setNewCharge(p => ({ ...p, label: e.target.value }))}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Amount ({newCharge.isPercent ? '%' : '₹'})
                  </label>
                  <Input
                    type="number" min="0" step="0.5" placeholder="50"
                    value={newCharge.amount}
                    onChange={e => setNewCharge(p => ({ ...p, amount: e.target.value }))}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Type</label>
                  <div className="flex gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewCharge(p => ({ ...p, isPercent: false }))}
                      className={`flex-1 h-8 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                        !newCharge.isPercent
                          ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      ₹ Fixed
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewCharge(p => ({ ...p, isPercent: true }))}
                      className={`flex-1 h-8 rounded-lg text-xs font-bold border cursor-pointer transition-all ${
                        newCharge.isPercent
                          ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                          : 'border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      % Rate
                    </button>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleAddCharge}
                disabled={savingCharge}
                size="sm"
                className="gap-2 font-bold bg-violet-600 hover:bg-violet-500 text-white cursor-pointer"
              >
                <PlusCircle size={14} />
                {savingCharge ? 'Adding...' : 'Add Charge'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Menu Data Management ────────────────────────────────────────── */}
        <MenuDataCard />

        {/* ── Mobile / Desktop App Settings ───────────────────────────────── */}
        <MobileServerCard />

        {/* ── License Information ──────────────────────────────────────────── */}
        <LicenseInfoCard />

      </div>
    </div>
  );
}


// ── Menu Data Management Card ───────────────────────────────────────────────
function MenuDataCard() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [importResult, setImportResult] = useState<{ categoriesCreated: number; itemsCreated: number } | null>(null);
  const [importError, setImportError] = useState('');

  /** Parse a CSV file → array of row objects */
  const parseCSV = (text: string): Record<string, string>[] => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
    return lines.slice(1).map(line => {
      // Handle quoted fields with commas inside
      const cols: string[] = [];
      let cur = '';
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { cols.push(cur); cur = ''; }
        else { cur += ch; }
      }
      cols.push(cur);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => { row[h] = (cols[i] ?? '').trim().replace(/^"|"$/g, ''); });
      return row;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError('');
    setImportResult(null);
    setImporting(true);

    try {
      const text = await file.text();
      const rows = parseCSV(text);
      if (rows.length === 0) { setImportError('CSV is empty or has no data rows.'); return; }

      // Validate required columns
      const first = rows[0];
      if (!('category' in first) || !('name' in first) || !('price' in first)) {
        setImportError('CSV must have columns: category, name, price  (optional: description, isveg, preparationtime)');
        return;
      }

      const payload = rows
        .filter(r => r.name && r.price)
        .map(r => ({
          category: r.category || 'General',
          name: r.name,
          price: parseFloat(r.price),
          description: r.description || undefined,
          isVeg: r.isveg === 'true' || r.isveg === '1' || r.isVeg === 'true',
          preparationTime: r.preparationtime ? parseInt(r.preparationtime) : undefined,
        }));

      const res = await api.post<{ categoriesCreated: number; itemsCreated: number }>(
        '/api/menu/import',
        { rows: payload }
      );
      setImportResult(res);
      toast.success(`Imported ${res.itemsCreated} items across ${res.categoriesCreated} categories!`);
    } catch (err: any) {
      setImportError(err?.response?.data?.message || 'Import failed');
      toast.error('Menu import failed');
    } finally {
      setImporting(false);
      // Reset input so same file can be re-uploaded
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReset = async () => {
    if (!confirmReset) { setConfirmReset(true); return; }
    setResetting(true);
    try {
      await api.delete('/api/menu/reset');
      toast.success('All demo menu data cleared. Ready for your real menu!');
      setConfirmReset(false);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Reset failed');
    } finally {
      setResetting(false);
    }
  };

  return (
    <Card className="border-dashed border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
            <FileSpreadsheet className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <CardTitle className="text-base font-black text-foreground">Menu Data Management</CardTitle>
            <CardDescription className="text-xs">
              Import your real menu from a CSV file, or clear all demo items before going live.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* CSV Import */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Bulk Import from CSV</span>
          </div>

          <div className="p-3 rounded-xl bg-muted/40 border border-border text-xs text-muted-foreground space-y-1">
            <p className="font-bold text-foreground">Required CSV columns:</p>
            <code className="block font-mono text-[11px] text-primary">
              category, name, price, description, isveg, preparationtime
            </code>
            <p className="text-[10px]">
              <span className="font-bold">category</span>, <span className="font-bold">name</span>, and{' '}
              <span className="font-bold">price</span> are required. Others are optional.{' '}
              isveg: true/false. preparationtime: minutes (default 10).
            </p>
          </div>

          {importError && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {importError}
            </div>
          )}

          {importResult && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400">
              <Check className="h-4 w-4 shrink-0" />
              ✅ {importResult.itemsCreated} items imported across {importResult.categoriesCreated} categories.
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="gap-2 font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer"
          >
            {importing
              ? <><RefreshCw className="h-4 w-4 animate-spin" /> Importing...</>
              : <><Upload className="h-4 w-4" /> Choose CSV File & Import</>
            }
          </Button>
        </div>

        <div className="border-t border-border" />

        {/* Reset */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-400" />
            <span className="text-sm font-bold text-foreground">Reset Demo Menu</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Permanently deletes <span className="font-bold text-foreground">all menu items and categories</span>.
            Orders, payments, and table data are kept. Use this before going live with your real menu.
          </p>

          {confirmReset && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              This will delete ALL menu items permanently. Click again to confirm.
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={resetting}
              className="gap-2 font-bold cursor-pointer"
            >
              {resetting
                ? <><RefreshCw className="h-4 w-4 animate-spin" /> Clearing...</>
                : <><Trash2 className="h-4 w-4" /> {confirmReset ? '⚠️ Confirm — Delete All Menu Data' : 'Reset All Demo Menu Data'}</>
              }
            </Button>
            {confirmReset && !resetting && (
              <Button
                variant="outline"
                onClick={() => setConfirmReset(false)}
                className="cursor-pointer"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


// ── Mobile / Desktop Server URL Card ────────────────────────────────────────
function MobileServerCard() {
  const [serverUrl, setServerUrl] = useState(() => localStorage.getItem('pos_server_url') ?? '');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const url = serverUrl.trim().replace(/\/$/, '');
    if (url) {
      localStorage.setItem('pos_server_url', url);
    } else {
      localStorage.removeItem('pos_server_url');
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Only show on mobile (Capacitor) or if user explicitly has a custom URL set
  if (!isCapacitor() && !serverUrl) return null;

  return (
    <Card className="border-border/80">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-sky-500/15 ring-1 ring-sky-500/25 flex items-center justify-center">
            <Smartphone size={18} className="text-sky-400" />
          </div>
          <div>
            <CardTitle className="text-base font-bold">App Server Connection</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Configure the API server URL for this device
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <Server size={12} /> API Server URL
          </label>
          <div className="flex gap-2">
            <Input
              value={serverUrl}
              onChange={e => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.100:4000"
              className="font-mono text-sm"
            />
            <Button onClick={handleSave} className="gap-2 font-bold shrink-0 cursor-pointer">
              {saved ? <Check size={14} /> : <Save size={14} />}
              {saved ? 'Saved!' : 'Save'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Current: <span className="font-mono font-semibold">{getApiBaseUrl()}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            Leave blank to use the default. For Android emulator use <span className="font-mono">http://10.0.2.2:4000</span>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ── License Information Card ─────────────────────────────────────────────────
function LicenseInfoCard() {
  const [license, setLicense] = useState<LicensePayload | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isTauri()) { setLoading(false); return; }
    getLicenseInfo().then(result => {
      if (result?.valid && result.payload) {
        setLicense(result.payload);
        setDaysRemaining(result.daysRemaining ?? null);
      }
    }).finally(() => setLoading(false));
  }, []);

  // Only show in Tauri desktop mode
  if (!isTauri()) return null;
  if (loading) return null;

  return (
    <Card className="border-border/80">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25 flex items-center justify-center">
            <ShieldCheck size={18} className="text-emerald-400" />
          </div>
          <div>
            <CardTitle className="text-base font-bold">License Information</CardTitle>
            <CardDescription className="text-xs mt-0.5">Your software license details</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {license ? (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2">
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Restaurant</p>
                <p className="font-semibold mt-0.5">{license.restaurantName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">License ID</p>
                <p className="font-mono font-semibold mt-0.5">{license.licenseId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Expires</p>
                <p className="font-semibold mt-0.5">
                  {license.expiresAt
                    ? `${license.expiresAt} (${daysRemaining ?? '?'} days left)`
                    : 'Lifetime'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Terminals</p>
                <p className="font-semibold mt-0.5">{license.maxDevices}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-1.5">Features</p>
              <div className="flex flex-wrap gap-1.5">
                {license.features.map(f => (
                  <span key={f} className="text-xs bg-primary/15 text-primary px-2.5 py-1 rounded-lg font-bold capitalize">
                    {f}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No valid license found.</p>
        )}
      </CardContent>
    </Card>
  );
}
