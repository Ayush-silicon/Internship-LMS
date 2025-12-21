import { Router } from 'express';
import {
  getAllUsers,
  getUserById,
  approveMentor,
  rejectMentor,
  deleteUser,
  getPlatformAnalytics
} from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { UserRole } from '../types';

const router = Router();

// Admin only routes
router.get('/', authenticate, authorize(UserRole.ADMIN), getAllUsers);
router.get('/analytics', authenticate, authorize(UserRole.ADMIN), getPlatformAnalytics);
router.get('/:id', authenticate, authorize(UserRole.ADMIN), getUserById);
router.put('/:id/approve-mentor', authenticate, authorize(UserRole.ADMIN), approveMentor);
router.put('/:id/reject-mentor', authenticate, authorize(UserRole.ADMIN), rejectMentor);
router.delete('/:id', authenticate, authorize(UserRole.ADMIN), deleteUser);

export default router;