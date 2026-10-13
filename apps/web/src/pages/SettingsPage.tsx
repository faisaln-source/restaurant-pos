import { useState } from 'react';
import {
  Settings, User, Lock, Bell, Palette, Store,
  Save, Shield, AlertTriangle, KeyRound,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useAuthStore } from '../store/authStore';
import { changePassword, updateUserProfile } from '../services/auth.service';
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

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
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
        {/* Profile Section */}
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
              <Input
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="Enter your name"
              />
            </div>
          </CardContent>
          <CardFooter className="px-6 py-3 bg-muted/20 border-t border-border/50 flex justify-end">
            <Button
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="gap-2 font-semibold"
            >
              <Save className="w-4 h-4" />
              {savingProfile ? 'Saving...' : 'Save Profile'}
            </Button>
          </CardFooter>
        </Card>

        {/* Restaurant Settings */}
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
              <Input
                className="w-56"
                value={settings.restaurantName}
                onChange={e => updateSetting('restaurantName', e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between py-3.5">
              <div className="space-y-0.5">
                <p className="text-sm font-semibold text-foreground">Default Tax Rate (%)</p>
                <p className="text-xs text-muted-foreground">Standard GST or service tax automatically applied at checkout</p>
              </div>
              <Input
                className="w-28 text-right font-mono"
                type="number"
                min={0}
                max={100}
                step={0.5}
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

        {/* Notifications & System */}
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

        {/* Security / Password Reset */}
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
                <Input
                  type="password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">New Password</label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Re-type password"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="px-6 py-3 bg-rose-500/5 border-t border-rose-500/20 flex justify-end">
            <Button
              variant="destructive"
              onClick={handleChangePassword}
              disabled={changingPassword}
              className="gap-2 font-semibold"
            >
              <KeyRound className="w-4 h-4" />
              {changingPassword ? 'Updating...' : 'Change Password'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

