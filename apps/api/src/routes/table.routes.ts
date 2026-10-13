import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../modules/table/table.controller';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.listTables);
router.get('/sections', ctrl.getFloorSections);
router.get('/:id', ctrl.getTableById);
router.post('/', ctrl.createTable);
router.patch('/:id', ctrl.updateTable);
router.patch('/:id/status', ctrl.updateTableStatus);
router.delete('/:id', ctrl.deleteTable);

export default router;
