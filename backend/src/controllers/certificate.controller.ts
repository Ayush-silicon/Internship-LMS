import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { generateCertificatePDF, checkCertificateEligibility } from '../services/certificate.service';

export const getCertificate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;
    const studentId = req.user!.userId;

    // Check eligibility
    const eligibility = await checkCertificateEligibility(studentId, courseId);

    if (!eligibility.eligible) {
      res.status(403).json({ 
        error: 'Certificate not available',
        message: eligibility.message,
        completion_percentage: eligibility.percentage
      });
      return;
    }

    // Check if certificate already exists
    let certificateResult = await query(
      'SELECT * FROM certificates WHERE student_id = $1 AND course_id = $2',
      [studentId, courseId]
    );

    let certificate;

    if (certificateResult.rows.length === 0) {
      // Generate new certificate
      certificate = await query(
        `INSERT INTO certificates (student_id, course_id)
         VALUES ($1, $2)
         RETURNING *`,
        [studentId, courseId]
      );
      certificate = certificate.rows[0];
    } else {
      certificate = certificateResult.rows[0];
    }

    // Get student and course details
    const detailsResult = await query(
      `SELECT 
        u.full_name as student_name,
        c.title as course_title
       FROM users u, courses c
       WHERE u.id = $1 AND c.id = $2`,
      [studentId, courseId]
    );

    const { student_name, course_title } = detailsResult.rows[0];

    // Generate PDF
    const pdfBuffer = await generateCertificatePDF({
      student_name,
      course_title,
      completion_date: certificate.issued_at,
      certificate_id: certificate.id
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="certificate-${courseId}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    // Send PDF
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Get certificate error:', error);
    res.status(500).json({ error: 'Failed to generate certificate' });
  }
};

export const checkCertificateStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;
    const studentId = req.user!.userId;

    // Check eligibility
    const eligibility = await checkCertificateEligibility(studentId, courseId);

    // Check if certificate exists
    const certificateResult = await query(
      'SELECT id, issued_at FROM certificates WHERE student_id = $1 AND course_id = $2',
      [studentId, courseId]
    );

    const hasCertificate = certificateResult.rows.length > 0;

    res.status(200).json({
      eligible: eligibility.eligible,
      has_certificate: hasCertificate,
      completion_percentage: eligibility.percentage,
      certificate: hasCertificate ? certificateResult.rows[0] : null,
      message: eligibility.message
    });
  } catch (error) {
    console.error('Check certificate status error:', error);
    res.status(500).json({ error: 'Failed to check certificate status' });
  }
};

export const getMyCertificates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.user!.userId;

    const result = await query(
      `SELECT 
        cert.id,
        cert.issued_at,
        c.id as course_id,
        c.title as course_title,
        c.description as course_description,
        u.full_name as mentor_name
       FROM certificates cert
       JOIN courses c ON cert.course_id = c.id
       JOIN users u ON c.mentor_id = u.id
       WHERE cert.student_id = $1
       ORDER BY cert.issued_at DESC`,
      [studentId]
    );

    res.status(200).json({ certificates: result.rows });
  } catch (error) {
    console.error('Get my certificates error:', error);
    res.status(500).json({ error: 'Failed to fetch certificates' });
  }
};