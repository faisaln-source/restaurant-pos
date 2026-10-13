import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../modules/order/order.controller';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.listOrders);
router.get('/today', ctrl.getTodayOrders);
router.get('/:id', ctrl.getOrderById);
router.post('/', ctrl.createOrder);
router.post('/:id/items', ctrl.addItems);
router.patch('/:id/status', ctrl.updateOrderStatus);
router.patch('/:orderId/items/:itemId/status', ctrl.updateItemStatus);
router.post('/:id/void', ctrl.voidOrder);

export default router;
