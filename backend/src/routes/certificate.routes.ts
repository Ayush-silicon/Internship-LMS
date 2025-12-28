import { Router } from 'express';
import {
  getCertificate,
  checkCertificateStatus,
  getMyCertificates
} from '../controllers/certificate.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authorize } from '../middleware/rbac.middleware';
import { UserRole } from '../types';

const router = Router();

// Student only routes
router.get('/my', authenticate, authorize(UserRole.STUDENT), getMyCertificates);
router.get('/:courseId', authenticate, authorize(UserRole.STUDENT), getCertificate);
router.get('/:courseId/status', authenticate, authorize(UserRole.STUDENT), checkCertificateStatus);

export default router;