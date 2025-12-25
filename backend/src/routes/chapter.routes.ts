import { Router } from 'express';
import {
  createChapter,
  getChapters,
  getChapterById,
  updateChapter,
  deleteChapter
} from '../controllers/chapter.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { UserRole } from '../types';

const router = Router();

// Mentor only routes
router.post('/:id/chapters', authenticate, authorize(UserRole.MENTOR), createChapter);
router.put('/:id/chapters/:chapterId', authenticate, authorize(UserRole.MENTOR), updateChapter);
router.delete('/:id/chapters/:chapterId', authenticate, authorize(UserRole.MENTOR), deleteChapter);

// Student & Mentor routes
router.get('/:id/chapters', authenticate, authorize(UserRole.STUDENT, UserRole.MENTOR), getChapters);
router.get('/:id/chapters/:chapterId', authenticate, authorize(UserRole.STUDENT, UserRole.MENTOR), getChapterById);

export default router;