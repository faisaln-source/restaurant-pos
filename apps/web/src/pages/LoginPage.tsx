import { useState, useEffect, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChefHat, Eye, EyeOff, Lock, Mail, KeyRound,
  Sparkles, AlertCircle, Shield, UtensilsCrossed,
  Receipt, ArrowRight, Delete, Clock, CheckCircle2,
} from 'lucide-react';
import { loginWithEmail, loginWithPin } from '../services/auth.service';
import { useAuthStore } from '../store/authStore';
import { connectSocket } from '../lib/socket';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';

interface DemoAccount {
  role: 'Admin' | 'Cashier' | 'Waiter' | 'Kitchen';
  name: string;
  email: string;
  pass: string;
  pin: string;
  icon: typeof Shield;
  desc: string;
  badgeStyle: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    role: 'Admin',
    name: 'Alex Johnson',
    email: 'admin@restaurant.com',
    pass: 'admin123',
    pin: '0000',
    icon: Shield,
    desc: 'Full Access & Settings',
    badgeStyle: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  },
  {
    role: 'Cashier',
    name: 'Sam Rivera',
    email: 'cashier@restaurant.com',
    pass: 'cashier123',
    pin: '1234',
    icon: Receipt,
    desc: 'Orders & POS Checkout',
    badgeStyle: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  },
  {
    role: 'Waiter',
    name: 'Taylor Kim',
    email: 'waiter@restaurant.com',
    pass: 'waiter123',
    pin: '9999',
    icon: UtensilsCrossed,
    desc: 'Table Service & Orders',
    badgeStyle: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  },
  {
    role: 'Kitchen',
    name: 'Chef Marco',
    email: 'kitchen@restaurant.com',
    pass: 'kitchen123',
    pin: '5678',
    icon: ChefHat,
    desc: 'Live Kitchen Display (KDS)',
    badgeStyle: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  },
];

const NUMPAD_KEYS = [
  { val: '1', letters: '' },
  { val: '2', letters: 'ABC' },
  { val: '3', letters: 'DEF' },
  { val: '4', letters: 'GHI' },
  { val: '5', letters: 'JKL' },
  { val: '6', letters: 'MNO' },
  { val: '7', letters: 'PQRS' },
  { val: '8', letters: 'TUV' },
  { val: '9', letters: 'WXYZ' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'pin' | 'email'>('pin');
  const [email, setEmail] = useState('admin@restaurant.com');
  const [password, setPassword] = useState('admin123');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pin, setPin] = useState(['0', '0', '0', '0']);
  const [selectedRole, setSelectedRole] = useState<string>('Admin');
  const [currentTime, setCurrentTime] = useState('');

  const { setProfile, setAuthenticated } = useAuthStore();

  // Live POS Terminal Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLoginSuccess = (result: { user: { id: string; name: string; email: string; role: string } }) => {
    setProfile({
      id: result.user.id,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role as 'ADMIN' | 'MANAGER' | 'CASHIER' | 'WAITER' | 'KITCHEN',
      isActive: true,
      createdAt: '',
      updatedAt: '',
    });
    setAuthenticated(true);
    connectSocket();
    toast.success(`Signed in as ${result.user.name}`);
    const role = result.user.role;
    if (role === 'KITCHEN') {
      navigate('/kds');
    } else {
      navigate('/dashboard');
    }
  };

  const handleEmailLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await loginWithEmail(email, password);
      handleLoginSuccess(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(
        msg.includes('Invalid') || msg.includes('invalid')
          ? 'Invalid email or password'
          : msg
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePinInput = (val: string, idx: number) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...pin];
    next[idx] = val;
    setPin(next);
    if (val && idx < 3) {
      const nextInput = document.getElementById(`pin-${idx + 1}`);
      (nextInput as HTMLInputElement)?.focus();
    }
    // Auto-submit when all 4 digits entered
    if (val && idx === 3 && next.every(d => d !== '')) {
      submitPin(next.join(''));
    }
  };

  const handlePinKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === 'Backspace' && !pin[idx] && idx > 0) {
      const prev = document.getElementById(`pin-${idx - 1}`);
      (prev as HTMLInputElement)?.focus();
    }
  };

  const handleNumpadPress = (num: string) => {
    const next = [...pin];
    const emptyIdx = next.findIndex(d => d === '');
    if (emptyIdx !== -1) {
      next[emptyIdx] = num;
      setPin(next);
      if (emptyIdx === 3 && next.every(d => d !== '')) {
        submitPin(next.join(''));
      }
    } else {
      // If already full, start fresh with the clicked digit
      setPin([num, '', '', '']);
    }
  };

  const handleNumpadBackspace = () => {
    const next = [...pin];
    for (let i = 3; i >= 0; i--) {
      if (next[i] !== '') {
        next[i] = '';
        setPin(next);
        break;
      }
    }
  };

  const submitPin = async (fullPin: string) => {
    setError('');
    setLoading(true);
    try {
      const result = await loginWithPin(fullPin);
      handleLoginSuccess(result);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid PIN';
      setError(msg);
      setPin(['', '', '', '']);
      (document.getElementById('pin-0') as HTMLInputElement)?.focus();
    } finally {
      setLoading(false);
    }
  };

  const selectDemoAccount = (acc: DemoAccount) => {
    setEmail(acc.email);
    setPassword(acc.pass);
    setPin(acc.pin.split(''));
    setSelectedRole(acc.role);
    setError('');
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center py-8 px-4 sm:px-6 bg-[#0b0c10] selection:bg-primary/20 relative overflow-x-hidden">
      {/* Background Ambient Glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[550px] h-[550px] bg-orange-500/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-10 right-1/4 w-[450px] h-[450px] bg-amber-600/10 rounded-full blur-[140px]" />
      </div>

      <div className="w-full max-w-[860px] relative z-10 flex flex-col gap-3.5">
        {/* Top Kiosk Header Bar */}
        <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-semibold text-foreground/90">POS Terminal #01</span>
            <span className="text-muted-foreground/60 hidden sm:inline">• Counter Main Station</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] text-emerald-400 font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Station Online
            </span>
            <span className="text-muted-foreground/40 hidden sm:inline">|</span>
            <span className="text-[11px] hidden sm:inline font-mono">RestoPOS v2.4</span>
          </div>
        </div>

        {/* Main Kiosk Card */}
        <Card className="border border-white/10 bg-[#13151f]/95 backdrop-blur-2xl shadow-2xl shadow-black/90 rounded-3xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[540px]">
          {/* Left Column: Staff Profiles & Station Status (5 cols) */}
          <div className="md:col-span-5 p-6 sm:p-7 bg-white/[0.02] border-b md:border-b-0 md:border-r border-white/10 flex flex-col justify-between gap-5">
            <div className="flex flex-col gap-4">
              {/* Brand Header */}
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 via-orange-500 to-amber-400 text-white shadow-lg shadow-orange-500/25 ring-2 ring-orange-500/20 shrink-0">
                  <ChefHat className="h-6 w-6 stroke-[2.5]" />
                </div>
                <div>
                  <h1 className="text-xl font-black tracking-tight text-white leading-none">
                    RestoPOS
                  </h1>
                  <p className="text-[11px] text-zinc-400 mt-1">
                    Restaurant POS &amp; KDS
                  </p>
                </div>
              </div>

              {/* Station Clock & Status Pill */}
              <div className="flex items-center justify-between py-2 px-3 rounded-xl bg-white/[0.04] border border-white/10 text-xs">
                <span className="flex items-center gap-2 text-zinc-300 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Terminal Active
                </span>
                <span className="font-mono text-zinc-400 text-[11px] flex items-center gap-1.5">
                  <Clock className="h-3 w-3 text-zinc-400" />
                  {currentTime || '12:00 PM'}
                </span>
              </div>

              {/* Quick Staff Login List */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs px-0.5">
                  <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    Quick Staff Login
                  </span>
                  <span className="text-[10px] text-zinc-400 font-medium">Tap to select</span>
                </div>

                <div className="flex flex-col gap-2">
                  {DEMO_ACCOUNTS.map((acc) => {
                    const Icon = acc.icon;
                    const isSelected = selectedRole === acc.role;
                    return (
                      <button
                        key={acc.role}
                        type="button"
                        onClick={() => selectDemoAccount(acc)}
                        className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-left transition-all duration-150 cursor-pointer ${
                          isSelected
                            ? 'border-primary bg-primary/15 text-white ring-1 ring-primary/40 shadow-xs'
                            : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 text-zinc-400'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-primary text-primary-foreground shadow-xs'
                                : 'bg-white/10 text-zinc-300'
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-zinc-200 leading-tight">
                              {acc.role}
                            </div>
                            <div className="text-[10px] text-zinc-400 truncate">
                              {acc.desc}
                            </div>
                          </div>
                        </div>

                        <Badge
                          variant="outline"
                          className={`font-mono text-[10px] px-2 py-0.5 shrink-0 ${acc.badgeStyle}`}
                        >
                          PIN {acc.pin}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Bottom Status Info with ample padding */}
            <div className="pt-3 border-t border-white/10 text-[11px] text-zinc-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-zinc-300 font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Live PostgreSQL &amp; WS
              </span>
              <span className="font-mono text-[10px] text-zinc-400">Station #01</span>
            </div>
          </div>

          {/* Right Column: Keypad & Auth Tabs (7 cols) */}
          <div className="md:col-span-7 p-6 sm:p-8 flex flex-col justify-between">
            <Tabs
              value={activeTab}
              onValueChange={(v) => {
                setActiveTab(v as 'pin' | 'email');
                setError('');
              }}
              className="w-full flex-1 flex flex-col justify-between gap-4"
            >
              <div className="w-full max-w-[340px] mx-auto flex flex-col gap-4">
                {/* Segmented Mode Switcher */}
                <TabsList className="grid w-full grid-cols-2 h-11 bg-black/40 p-1 rounded-xl border border-white/10">
                  <TabsTrigger
                    value="pin"
                    className="gap-2 text-xs font-bold rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                  >
                    <KeyRound className="h-3.5 w-3.5" /> Staff PIN Keypad
                  </TabsTrigger>
                  <TabsTrigger
                    value="email"
                    className="gap-2 text-xs font-bold rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-xs transition-all cursor-pointer"
                  >
                    <Mail className="h-3.5 w-3.5" /> Email &amp; Password
                  </TabsTrigger>
                </TabsList>

                {/* Error Banner */}
                {error && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-destructive/15 text-destructive text-xs font-medium border border-destructive/20 animate-in fade-in">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              {/* ─── PIN Pad View (Default for POS) ─── */}
              <TabsContent value="pin" className="m-0 focus-visible:outline-none flex-1 flex flex-col justify-center">
                <div className="w-full max-w-[340px] mx-auto flex flex-col items-center gap-3.5">
                  <p className="text-center text-xs text-zinc-400 font-medium">
                    Enter 4-digit staff terminal PIN
                  </p>

                  {/* 4 Distinct PIN Input / Display Boxes */}
                  <div className="flex justify-center items-center gap-3 w-full">
                    {pin.map((digit, i) => (
                      <input
                        key={i}
                        id={`pin-${i}`}
                        type="password"
                        maxLength={1}
                        inputMode="numeric"
                        value={digit}
                        onChange={(e) => handlePinInput(e.target.value, i)}
                        onKeyDown={(e) => handlePinKeyDown(e, i)}
                        className={`h-13 w-13 rounded-2xl border-2 text-center text-2xl font-black transition-all outline-none ${
                          digit
                            ? 'border-primary bg-primary/20 text-primary shadow-lg shadow-primary/25 scale-105'
                            : 'border-white/15 bg-black/40 text-white hover:border-white/30 focus:border-primary/80 focus:ring-2 focus:ring-primary/25'
                        }`}
                      />
                    ))}
                  </div>

                  {/* Tactile On-Screen Touch Numpad with Solid Raised Keycaps */}
                  <div className="grid grid-cols-3 gap-2.5 w-full pt-1">
                    {NUMPAD_KEYS.map((k) => (
                      <button
                        key={k.val}
                        type="button"
                        onClick={() => handleNumpadPress(k.val)}
                        className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] text-white hover:border-primary/80 hover:bg-primary/10 active:scale-95 transition-all duration-150 flex flex-col items-center justify-center cursor-pointer select-none group shadow-xs"
                      >
                        <span className="text-xl font-black leading-none tracking-tight group-hover:text-primary transition-colors">
                          {k.val}
                        </span>
                        {k.letters && (
                          <span className="text-[9px] font-semibold text-zinc-400 tracking-wider mt-0.5">
                            {k.letters}
                          </span>
                        )}
                      </button>
                    ))}

                    {/* Clear Button */}
                    <button
                      type="button"
                      onClick={() => setPin(['', '', '', ''])}
                      className="h-12 w-full rounded-2xl border border-destructive/40 bg-destructive/15 text-destructive hover:bg-destructive/25 text-xs font-black uppercase tracking-wider transition-all duration-150 active:scale-95 flex items-center justify-center cursor-pointer select-none shadow-xs"
                    >
                      Clear
                    </button>

                    {/* 0 Button */}
                    <button
                      type="button"
                      onClick={() => handleNumpadPress('0')}
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] text-white hover:border-primary/80 hover:bg-primary/10 active:scale-95 transition-all duration-150 flex flex-col items-center justify-center cursor-pointer select-none group shadow-xs"
                    >
                      <span className="text-xl font-black leading-none tracking-tight group-hover:text-primary transition-colors">
                        0
                      </span>
                      <span className="text-[9px] font-semibold text-zinc-400 tracking-wider mt-0.5">
                        +
                      </span>
                    </button>

                    {/* Backspace Button */}
                    <button
                      type="button"
                      onClick={handleNumpadBackspace}
                      className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white hover:border-white/20 hover:bg-white/[0.08] active:scale-95 transition-all duration-150 flex items-center justify-center cursor-pointer select-none shadow-xs"
                    >
                      <Delete className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Authorize Terminal Button */}
                  <div className="w-full pt-1">
                    <Button
                      type="button"
                      onClick={() => submitPin(pin.join(''))}
                      className="w-full h-12 rounded-xl font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-orange-500/25 gap-2 cursor-pointer transition-all"
                      disabled={loading || pin.some((d) => d === '')}
                    >
                      {loading ? (
                        <span className="flex items-center gap-2">
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                          Verifying PIN...
                        </span>
                      ) : (
                        <>
                          Authorize Terminal
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* ─── Email & Password View ─── */}
              <TabsContent value="email" className="m-0 focus-visible:outline-none flex-1 flex flex-col justify-center">
                <div className="w-full max-w-[340px] mx-auto flex flex-col justify-center gap-3.5 py-2">
                  <div className="text-center pb-1">
                    <h3 className="text-sm font-bold text-white">Staff Credential Sign In</h3>
                    <p className="text-xs text-zinc-400 mt-0.5">Enter your email and password or tap a profile on the left</p>
                  </div>

                  <form onSubmit={handleEmailLogin} className="flex flex-col gap-3.5">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-zinc-300">
                        Email Address
                      </label>
                      <div className="relative flex items-center">
                        <div className="absolute left-3.5 text-zinc-400 pointer-events-none z-10 flex items-center">
                          <Mail className="h-4 w-4" />
                        </div>
                        <Input
                          type="email"
                          placeholder="admin@restaurant.com"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          style={{ paddingLeft: '2.75rem', paddingRight: '1rem' }}
                          className="h-11 bg-black/40 border-white/15 focus-visible:ring-primary/40 text-sm rounded-xl text-white"
                          required
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-xs font-semibold text-zinc-300">
                        Password
                      </label>
                      <div className="relative flex items-center">
                        <div className="absolute left-3.5 text-zinc-400 pointer-events-none z-10 flex items-center">
                          <Lock className="h-4 w-4" />
                        </div>
                        <Input
                          type={showPass ? 'text' : 'password'}
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          style={{ paddingLeft: '2.75rem', paddingRight: '2.75rem' }}
                          className="h-11 bg-black/40 border-white/15 focus-visible:ring-primary/40 text-sm rounded-xl text-white"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => setShowPass(!showPass)}
                          className="absolute right-3.5 text-zinc-400 hover:text-white transition-colors p-1"
                          tabIndex={-1}
                        >
                          {showPass ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="pt-2">
                      <Button
                        type="submit"
                        className="w-full h-12 rounded-xl font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-orange-500/25 gap-2 cursor-pointer transition-all"
                        disabled={loading}
                      >
                        {loading ? (
                          <span className="flex items-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                            Authenticating...
                          </span>
                        ) : (
                          <>
                            Sign In to Terminal
                            <ArrowRight className="h-4 w-4" />
                          </>
                        )}
                      </Button>
                    </div>

                    <p className="text-center text-[11px] text-zinc-400 pt-1">
                      Tip: Tap any profile on the left to auto-fill credentials.
                    </p>
                  </form>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </Card>

        {/* Footer Note */}
        <p className="text-center text-xs text-zinc-500 pt-1 pb-1">
          RestoPOS Enterprise POS System • Touch &amp; Barcode Terminal Ready
        </p>
      </div>
    </div>
  );
}
