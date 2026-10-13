import bcrypt from 'bcryptjs';
import prisma from '../../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../lib/jwt';
import { badRequest, unauthorized, conflict } from '../../lib/errors';
import { RegisterInput, LoginInput, PinLoginInput } from './auth.schema';

const SALT_ROUNDS = 12;

export async function register(input: RegisterInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw conflict('Email already registered');

  const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);
  let pinHash: string | undefined;
  if (input.pin) {
    pinHash = await bcrypt.hash(input.pin, SALT_ROUNDS);
  }

  const user = await prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      passwordHash,
      pin: pinHash,
      role: input.role ?? 'WAITER',
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return user;
}

export async function login(input: LoginInput) {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.isActive) throw unauthorized('Invalid email or password');

  const valid = await bcrypt.compare(input.password, user.passwordHash);
  if (!valid) throw unauthorized('Invalid email or password');

  return _issueTokens(user);
}

export async function pinLogin(input: PinLoginInput) {
  // Fetch only fields needed for comparison + token issuance.
  // NOTE: True O(1) lookup requires a deterministic PIN hash column (schema change).
  // For now this is bounded by the number of active staff, which is always small.
  const users = await prisma.user.findMany({
    where: { isActive: true, pin: { not: null } },
    select: { id: true, name: true, email: true, role: true, pin: true },
  });

  for (const user of users) {
    if (user.pin && (await bcrypt.compare(input.pin, user.pin))) {
      return _issueTokens(user);
    }
  }

  throw unauthorized('Invalid PIN');
}

export async function refreshTokens(token: string) {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw unauthorized('Invalid or expired refresh token');
  }

  const stored = await prisma.refreshToken.findUnique({ where: { token } });

  if (!stored) {
    // Token not found — could be a reuse attack (token was already rotated).
    // Wipe ALL tokens for this user as a security measure.
    await prisma.refreshToken.deleteMany({ where: { userId: payload.userId } });
    throw unauthorized('Refresh token reuse detected — please log in again');
  }

  if (stored.expiresAt < new Date()) {
    await prisma.refreshToken.deleteMany({ where: { token } });
    throw unauthorized('Refresh token expired');
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.isActive) throw unauthorized('User not found or inactive');

  // Issue new tokens FIRST, then delete the old one.
  // This prevents a race where the client gets a 401, tries to refresh, gets
  // new tokens, but a concurrent refresh attempt deletes the new token before
  // the client has a chance to save it.
  const result = await _issueTokens(user);
  await prisma.refreshToken.deleteMany({ where: { token } });
  return result;
}

export async function logout(token: string) {
  await prisma.refreshToken.deleteMany({ where: { token } });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw badRequest('User not found');

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw badRequest('Current password is incorrect');

  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });

  // Invalidate all refresh tokens
  await prisma.refreshToken.deleteMany({ where: { userId } });
}

// ── Private helper ──────────────────────────────────────────────────────────
async function _issueTokens(user: { id: string; email: string; role: string; name: string }) {
  const payload = { userId: user.id, email: user.email, role: user.role };

  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await prisma.refreshToken.create({
    data: { token: refreshToken, userId: user.id, expiresAt },
  });

  return {
    accessToken,
    refreshToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}
