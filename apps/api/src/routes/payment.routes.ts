import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../modules/payment/payment.controller';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.listPayments);
router.get('/today', ctrl.getTodayPayments);
// ── Specific named sub-paths before /:id to avoid shadowing ───────────────
router.get('/order/:orderId', ctrl.getPaymentByOrderId);
router.get('/razorpay/config', ctrl.getRazorpayConfig);
router.post('/razorpay/order', ctrl.createRazorpayOrder);
router.post('/razorpay/verify', ctrl.verifyRazorpayPayment);
router.post('/qr/generate', ctrl.generateDynamicQR);
router.get('/qr/:orderId/status', ctrl.checkQRPaymentStatus);
router.post('/', ctrl.processPayment);
router.get('/:id', ctrl.getPaymentById);
router.post('/:id/refund', ctrl.refundPayment);

export default router;
