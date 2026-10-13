import { Request, Response } from 'express';
import * as authService from './auth.service';
import {
  registerSchema,
  loginSchema,
  pinLoginSchema,
  refreshSchema,
  changePasswordSchema,
} from './auth.schema';

export async function register(req: Request, res: Response) {
  const input = registerSchema.parse(req.body);
  const user = await authService.register(input);
  res.status(201).json({ success: true, data: user });
}

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);
  const result = await authService.login(input);
  res.json({ success: true, data: result });
}

export async function pinLogin(req: Request, res: Response) {
  const input = pinLoginSchema.parse(req.body);
  const result = await authService.pinLogin(input);
  res.json({ success: true, data: result });
}

export async function refresh(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  const result = await authService.refreshTokens(refreshToken);
  res.json({ success: true, data: result });
}

export async function logout(req: Request, res: Response) {
  const { refreshToken } = refreshSchema.parse(req.body);
  await authService.logout(refreshToken);
  res.json({ success: true, message: 'Logged out successfully' });
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
  await authService.changePassword(req.user!.userId, currentPassword, newPassword);
  res.json({ success: true, message: 'Password changed successfully' });
}

export async function me(req: Request, res: Response) {
  res.json({ success: true, data: req.user });
}
