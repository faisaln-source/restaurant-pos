import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as ctrl from '../modules/report/report.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN', 'MANAGER'));

router.get('/dashboard', ctrl.getDashboard);
router.get('/revenue', ctrl.getRevenueReport);
router.get('/top-items', ctrl.getTopSellingItems);
router.get('/staff', ctrl.getStaffReport);

export default router;
