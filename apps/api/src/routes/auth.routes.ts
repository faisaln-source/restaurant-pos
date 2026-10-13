import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../modules/auth/auth.controller';

const router = Router();

// Public routes
router.post('/register', ctrl.register);
router.post('/login', ctrl.login);
router.post('/pin-login', ctrl.pinLogin);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);

// Protected routes
router.get('/me', authenticate, ctrl.me);
router.patch('/change-password', authenticate, ctrl.changePassword);

export default router;
