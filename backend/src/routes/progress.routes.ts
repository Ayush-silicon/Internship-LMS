import { Router } from 'express';
import {
  completeChapter,
  getMyProgress,
  getCourseProgress,
  resetProgress
} from '../controllers/progress.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { UserRole } from '../types';

const router = Router();

// Student only routes
router.post('/:chapterId/complete', authenticate, authorize(UserRole.STUDENT), completeChapter);
router.get('/my', authenticate, authorize(UserRole.STUDENT), getMyProgress);
router.get('/course/:courseId', authenticate, authorize(UserRole.STUDENT), getCourseProgress);
router.delete('/course/:courseId/reset', authenticate, authorize(UserRole.STUDENT), resetProgress);

export default router;