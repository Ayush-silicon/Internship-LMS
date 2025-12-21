import { Router } from 'express';
import {
  createCourse,
  getMyCourses,
  getCourseById,
  updateCourse,
  deleteCourse,
  assignCourse,
  getEnrolledStudents
} from '../controllers/course.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { UserRole } from '../types';

const router = Router();

// Mentor routes
router.post('/', authenticate, authorize(UserRole.MENTOR), createCourse);
router.put('/:id', authenticate, authorize(UserRole.MENTOR), updateCourse);
router.delete('/:id', authenticate, authorize(UserRole.MENTOR), deleteCourse);
router.post('/:id/assign', authenticate, authorize(UserRole.MENTOR), assignCourse);
router.get('/:id/students', authenticate, authorize(UserRole.MENTOR), getEnrolledStudents);

// Student & Mentor routes
router.get('/my', authenticate, authorize(UserRole.STUDENT, UserRole.MENTOR), getMyCourses);
router.get('/:id', authenticate, authorize(UserRole.STUDENT, UserRole.MENTOR), getCourseById);

export default router;