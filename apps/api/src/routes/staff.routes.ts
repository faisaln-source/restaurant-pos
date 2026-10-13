import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as ctrl from '../modules/staff/staff.controller';

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN', 'MANAGER'));

// Staff CRUD
router.get('/', ctrl.listStaff);
router.get('/:id', ctrl.getStaffById);
router.post('/', ctrl.createStaff);
router.patch('/:id', ctrl.updateStaff);
router.delete('/:id', ctrl.deleteStaff);

// Shifts
router.get('/shifts/today', ctrl.getTodayShifts);
router.get('/shifts', ctrl.getShifts);
router.post('/:id/clock-in', ctrl.clockIn);
router.post('/shifts/:shiftId/clock-out', ctrl.clockOut);

export default router;
