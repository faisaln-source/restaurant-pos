import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import { notFoundError, badRequest, conflict } from '../../lib/errors';
import type { CreateStaffInput, UpdateStaffInput } from './staff.schema';

const SALT_ROUNDS = 12;

// ── List staff ─────────────────────────────────────────────────────────────

export async function listStaff(activeOnly?: boolean) {
  const where = activeOnly ? { isActive: true } : {};
  return prisma.user.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// ── Get staff by ID ────────────────────────────────────────────────────────

export async function getStaffById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      avatarUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw notFoundError('Staff member not found');
  return user;
}

// ── Create staff ───────────────────────────────────────────────────────────

export async function createStaff(input: CreateStaffInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('Email already registered');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  let pinHash: string | undefined;
  if (input.pin) {
    pinHash = await bcrypt.hash(input.pin, SALT_ROUNDS);
  }

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      pin: pinHash,
      role: input.role,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });
}

// ── Update staff ───────────────────────────────────────────────────────────

export async function updateStaff(id: string, input: UpdateStaffInput) {
  await _ensureStaffExists(id);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.role !== undefined) data.role = input.role;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.pin !== undefined) {
    data.pin = input.pin ? await bcrypt.hash(input.pin, SALT_ROUNDS) : null;
  }

  return prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

// ── Delete staff ───────────────────────────────────────────────────────────

export async function deleteStaff(id: string) {
  await _ensureStaffExists(id);
  // Soft-delete: just deactivate
  return prisma.user.update({
    where: { id },
    data: { isActive: false },
    select: { id: true, name: true, isActive: true },
  });
}

// ── Clock in ───────────────────────────────────────────────────────────────

export async function clockIn(userId: string, note?: string) {
  await _ensureStaffExists(userId);

  // Check if already clocked in today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const existing = await prisma.shift.findFirst({
    where: {
      userId,
      clockOut: null,
      date: { gte: today, lt: tomorrow },
    },
  });
  if (existing) throw badRequest('Already clocked in today. Clock out first.');

  return prisma.shift.create({
    data: {
      userId,
      clockIn: new Date(),
      date: today,
      note: note ?? null,
    },
    include: { user: { select: { id: true, name: true, role: true } } },
  });
}

// ── Clock out ──────────────────────────────────────────────────────────────

export async function clockOut(shiftId: string, note?: string) {
  const shift = await prisma.shift.findUnique({ where: { id: shiftId } });
  if (!shift) throw notFoundError('Shift not found');
  if (shift.clockOut) throw badRequest('Shift already ended');

  return prisma.shift.update({
    where: { id: shiftId },
    data: {
      clockOut: new Date(),
      ...(note && { note }),
    },
    include: { user: { select: { id: true, name: true, role: true } } },
  });
}

// ── Get shifts ─────────────────────────────────────────────────────────────

export async function getShifts(filters?: {
  userId?: string;
  from?: Date;
  to?: Date;
  date?: Date;
}) {
  const where: Record<string, unknown> = {};

  if (filters?.userId) where.userId = filters.userId;
  if (filters?.date) {
    const next = new Date(filters.date);
    next.setDate(next.getDate() + 1);
    where.date = { gte: filters.date, lt: next };
  } else if (filters?.from || filters?.to) {
    where.date = {
      ...(filters?.from && { gte: filters.from }),
      ...(filters?.to && { lte: filters.to }),
    };
  }

  return prisma.shift.findMany({
    where,
    orderBy: { clockIn: 'desc' },
    include: { user: { select: { id: true, name: true, role: true } } },
  });
}

export async function getTodayShifts() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getShifts({ date: today });
}

// ── Private helpers ────────────────────────────────────────────────────────

async function _ensureStaffExists(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw notFoundError('Staff member not found');
  return user;
}
