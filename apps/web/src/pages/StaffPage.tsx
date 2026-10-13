import { useState, useEffect } from 'react';
import {
  Users, Plus, Search, Shield, ChefHat, CreditCard,
  ConciergeBell, Edit2, Trash2, UserCheck,
  UserX, Clock, Calendar, MoreVertical, KeyRound,
} from 'lucide-react';
import {
  subscribeToStaff, addStaffMember, updateStaffMember,
  toggleStaffActive, deleteStaffMember, subscribeToTodayShifts,
} from '../services/staff.service';
import type { UserProfile, Shift } from '../lib/types';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import toast from 'react-hot-toast';

const ROLE_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string; bg: string }> = {
  ADMIN:   { label: 'Admin',   icon: Shield,        color: '#f87171', bg: 'rgba(248,113,113,0.12)' },
  MANAGER: { label: 'Manager', icon: Shield,        color: '#a78bfa', bg: 'rgba(167,139,250,0.12)' },
  CASHIER: { label: 'Cashier', icon: CreditCard,    color: '#60a5fa', bg: 'rgba(96,165,250,0.12)' },
  WAITER:  { label: 'Waiter',  icon: ConciergeBell, color: '#4ade80', bg: 'rgba(74,222,128,0.12)' },
  KITCHEN: { label: 'Kitchen', icon: ChefHat,       color: '#fbbf24', bg: 'rgba(251,191,36,0.12)' },
};

const AVATAR_COLORS = ['#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#22c55e', '#3b82f6'];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface StaffFormData {
  name: string;
  email: string;
  role: UserProfile['role'];
  pin: string;
}

const EMPTY_FORM: StaffFormData = { name: '', email: '', role: 'WAITER', pin: '' };

export default function StaffPage() {
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<StaffFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub1 = subscribeToStaff(setStaff);
    const unsub2 = subscribeToTodayShifts(setShifts);
    return () => { unsub1(); unsub2(); };
  }, []);

  const filtered = staff.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.email.toLowerCase().includes(search.toLowerCase()) ||
    s.role.toLowerCase().includes(search.toLowerCase())
  );

  const activeCount = staff.filter(s => s.isActive).length;

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (member: UserProfile) => {
    setEditing(member);
    setForm({
      name: member.name,
      email: member.email,
      role: member.role,
      pin: '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    if (!form.email.trim()) { toast.error('Email is required'); return; }

    setSaving(true);
    try {
      if (editing) {
        await updateStaffMember(editing.id, {
          name: form.name.trim(),
          role: form.role,
          pin: form.pin || undefined,
        });
        toast.success('Staff member updated');
      } else {
        await addStaffMember({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          pin: form.pin || undefined,
        });
        toast.success('Staff member added');
      }
      closeModal();
    } catch {
      toast.error('Failed to save staff member');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (member: UserProfile) => {
    try {
      await toggleStaffActive(member.id, !member.isActive);
      toast.success(member.isActive ? 'Staff deactivated' : 'Staff activated');
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async (member: UserProfile) => {
    if (!confirm(`Delete ${member.name}? This cannot be undone.`)) return;
    try {
      await deleteStaffMember(member.id);
      toast.success('Staff member deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Search & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search staff by name, email, or role..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10 h-11 bg-card/60 text-sm rounded-xl border-border/80"
          />
        </div>

        <Button
          size="sm"
          onClick={openCreate}
          className="h-11 px-5 gap-2 font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl shadow-md shadow-orange-500/20"
        >
          <Plus size={16} /> Add Staff
        </Button>
      </div>

      {/* Staff Statistics Cards */}
      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {[
          { label: 'Total Team', value: staff.length, icon: Users, color: 'text-indigo-400', bg: 'bg-indigo-500/15 ring-1 ring-indigo-500/20' },
          { label: 'Active Staff', value: activeCount, icon: UserCheck, color: 'text-emerald-400', bg: 'bg-emerald-500/15 ring-1 ring-emerald-500/20' },
          { label: 'On Shift Today', value: shifts.filter(s => !s.clockOut).length, icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/15 ring-1 ring-amber-500/20' },
          { label: 'Inactive', value: staff.length - activeCount, icon: UserX, color: 'text-rose-400', bg: 'bg-rose-500/15 ring-1 ring-rose-500/20' },
        ].map(s => (
          <Card key={s.label} className="border-border/80 bg-card/90 shadow-sm rounded-2xl">
            <CardContent className="p-4 sm:p-5 flex items-center gap-3.5">
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${s.bg} ${s.color}`}>
                <s.icon size={22} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block">{s.label}</span>
                <p className="text-2xl font-black tracking-tight text-foreground mt-0.5">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Staff Cards Grid */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filtered.map(member => {
          const roleCfg = ROLE_CONFIG[member.role] ?? ROLE_CONFIG.WAITER;
          const RoleIcon = roleCfg.icon;
          const bg = avatarColor(member.name);
          return (
            <Card
              key={member.id}
              className={`border-border/70 bg-card/70 hover:border-primary/40 transition-all hover:shadow-md group flex flex-col justify-between ${
                !member.isActive ? 'opacity-60' : ''
              }`}
            >
              <CardContent className="p-4 space-y-3.5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-11 w-11 text-white font-bold text-sm shadow-xs" style={{ backgroundColor: bg }}>
                      <AvatarFallback className="text-white" style={{ backgroundColor: bg }}>
                        {member.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-foreground truncate">{member.name}</h4>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                        <MoreVertical size={14} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem onClick={() => openEdit(member)} className="text-xs cursor-pointer">
                        <Edit2 size={13} className="mr-2" /> Edit Details
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleToggleActive(member)} className="text-xs cursor-pointer">
                        {member.isActive ? (
                          <>
                            <UserX size={13} className="mr-2 text-rose-400" /> Deactivate
                          </>
                        ) : (
                          <>
                            <UserCheck size={13} className="mr-2 text-emerald-400" /> Activate
                          </>
                        )}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => handleDelete(member)}
                        className="text-xs text-destructive focus:text-destructive cursor-pointer"
                      >
                        <Trash2 size={13} className="mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                  <Badge
                    variant="outline"
                    className="gap-1 text-[11px] font-semibold border-none"
                    style={{ backgroundColor: roleCfg.bg, color: roleCfg.color }}
                  >
                    <RoleIcon size={11} /> {roleCfg.label}
                  </Badge>

                  <Badge
                    variant={member.isActive ? 'default' : 'secondary'}
                    className={`text-[10px] font-bold ${
                      member.isActive
                        ? 'bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20 border-none'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {member.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </Badge>
                </div>
              </CardContent>

              <div className="px-4 py-2.5 bg-muted/20 border-t border-border/50 text-[11px] text-muted-foreground flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar size={11} />
                  {member.createdAt ? new Date(member.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Registered'}
                </span>
                <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                  ID: {member.id.slice(-4)}
                </span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Staff Create / Edit Dialog */}
      <Dialog open={showModal} onOpenChange={v => !v && closeModal()}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Staff Member' : 'Add New Staff'}</DialogTitle>
            <DialogDescription>
              Assign role, system access, and terminal login PIN.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Full Name *</label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. John Doe"
                required
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Email Address *</label>
              <Input
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="john@restaurant.com"
                required
                disabled={!!editing}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Role *</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value as UserProfile['role'] }))}
              >
                <option value="WAITER">Waiter</option>
                <option value="CASHIER">Cashier</option>
                <option value="KITCHEN">Kitchen Staff</option>
                <option value="MANAGER">Manager</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-foreground">Terminal PIN (4 Digits)</label>
              <div className="relative">
                <KeyRound size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="password"
                  maxLength={4}
                  value={form.pin}
                  onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
                  placeholder={editing ? 'Leave blank to keep current' : '4-digit PIN'}
                  className="pl-9 font-mono"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Staff'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
