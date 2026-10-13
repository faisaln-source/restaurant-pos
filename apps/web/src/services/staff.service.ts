/**
 * Staff service — CRUD via Express API.
 */
import api from '../lib/api';
import type { UserProfile, Shift } from '../lib/types';

// ── Get all staff members ──────────────────────────────────────────────────
export async function fetchAllStaff(): Promise<UserProfile[]> {
  return api.get<UserProfile[]>('/api/staff');
}

export function subscribeToStaff(cb: (staff: UserProfile[]) => void): () => void {
  let cancelled = false;
  fetchAllStaff().then((staff) => {
    if (!cancelled) cb(staff);
  }).catch(console.error);
  return () => { cancelled = true; };
}

// ── Add staff member ───────────────────────────────────────────────────────
export async function addStaffMember(data: {
  name: string;
  email: string;
  role: UserProfile['role'];
  pin?: string;
}): Promise<string> {
  const result = await api.post<UserProfile>('/api/staff', {
    name: data.name,
    email: data.email,
    role: data.role,
    pin: data.pin,
    password: 'Staff1234!', // default password for staff
  });
  return result.id;
}

// ── Update staff member ────────────────────────────────────────────────────
export async function updateStaffMember(
  id: string,
  data: Partial<Pick<UserProfile, 'name' | 'role' | 'pin' | 'isActive'>>,
): Promise<void> {
  await api.patch(`/api/staff/${id}`, data);
}

// ── Toggle active status ───────────────────────────────────────────────────
export async function toggleStaffActive(id: string, isActive: boolean): Promise<void> {
  await api.patch(`/api/staff/${id}`, { isActive });
}

// ── Delete staff member ────────────────────────────────────────────────────
export async function deleteStaffMember(id: string): Promise<void> {
  await api.delete(`/api/staff/${id}`);
}

// ── Shifts ─────────────────────────────────────────────────────────────────
export async function clockIn(userId: string, _userName: string): Promise<string> {
  const result = await api.post<Shift>(`/api/staff/${userId}/clock-in`);
  return result.id;
}

export async function clockOut(shiftId: string, note?: string): Promise<void> {
  await api.post(`/api/staff/shifts/${shiftId}/clock-out`, { note });
}

export async function fetchTodayShifts(): Promise<Shift[]> {
  return api.get<Shift[]>('/api/staff/shifts/today');
}

export function subscribeToTodayShifts(cb: (shifts: Shift[]) => void): () => void {
  let cancelled = false;
  fetchTodayShifts().then((shifts) => {
    if (!cancelled) cb(shifts);
  }).catch(console.error);
  return () => { cancelled = true; };
}

export async function getShiftsForRange(from: Date, to: Date): Promise<Shift[]> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return api.get<Shift[]>(`/api/staff/shifts?${params}`);
}
