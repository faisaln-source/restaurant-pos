import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../modules/menu/menu.controller';

const router = Router();

router.use(authenticate);

// ── Categories ─────────────────────────────────────────────────────────────
router.get('/categories', ctrl.listCategories);
router.get('/categories/:id', ctrl.getCategoryById);
router.post('/categories', ctrl.createCategory);
router.patch('/categories/:id', ctrl.updateCategory);
router.delete('/categories/:id', ctrl.deleteCategory);

// ── Menu Items ─────────────────────────────────────────────────────────────
router.get('/items', ctrl.listMenuItems);
router.get('/items/:id', ctrl.getMenuItemById);
router.post('/items', ctrl.createMenuItem);
router.patch('/items/:id', ctrl.updateMenuItem);
router.delete('/items/:id', ctrl.deleteMenuItem);
router.patch('/items/:id/availability', ctrl.toggleAvailability);
router.post('/upload', ctrl.uploadImage);

export default router;
