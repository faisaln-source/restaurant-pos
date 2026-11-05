import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import * as ctrl from '../modules/kitchen-station/kitchen-station.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// List all stations — available to ADMIN, MANAGER, KITCHEN
router.get('/', ctrl.listStations);

// Get single station
router.get('/:id', ctrl.getStation);

// Get orders for a specific station (for per-kitchen KDS view)
router.get('/:id/orders', ctrl.getStationOrders);

// Mutating routes — ADMIN and MANAGER only
router.post('/', authorize('ADMIN', 'MANAGER'), ctrl.createStation);
router.patch('/:id', authorize('ADMIN', 'MANAGER'), ctrl.updateStation);
router.delete('/:id', authorize('ADMIN', 'MANAGER'), ctrl.deleteStation);

export default router;
