import PDFDocument from 'pdfkit';
import { query } from '../config/database';

export interface CertificateData {
  student_name: string;
  course_title: string;
  completion_date: Date;
  certificate_id: string;
}

export const generateCertificatePDF = (data: CertificateData): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margins: { top: 50, bottom: 50, left: 72, right: 72 }
      });

      const buffers: Buffer[] = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      // Certificate Design
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;

      // Border
      doc.rect(30, 30, pageWidth - 60, pageHeight - 60)
         .lineWidth(3)
         .stroke('#1e40af');

      doc.rect(35, 35, pageWidth - 70, pageHeight - 70)
         .lineWidth(1)
         .stroke('#3b82f6');

      // Header
      doc.fontSize(48)
         .font('Helvetica-Bold')
         .fillColor('#1e40af')
         .text('Certificate of Completion', 0, 80, {
           align: 'center',
           width: pageWidth
         });

      // Decorative line
      doc.moveTo(pageWidth / 2 - 150, 150)
         .lineTo(pageWidth / 2 + 150, 150)
         .lineWidth(2)
         .stroke('#3b82f6');

      // Body text
      doc.fontSize(16)
         .fillColor('#374151')
         .font('Helvetica')
         .text('This is to certify that', 0, 200, {
           align: 'center',
           width: pageWidth
         });

      // Student name
      doc.fontSize(36)
         .font('Helvetica-Bold')
         .fillColor('#1e40af')
         .text(data.student_name, 0, 240, {
           align: 'center',
           width: pageWidth
         });

      // Course completion text
      doc.fontSize(16)
         .font('Helvetica')
         .fillColor('#374151')
         .text('has successfully completed the course', 0, 300, {
           align: 'center',
           width: pageWidth
         });

      // Course title
      doc.fontSize(28)
         .font('Helvetica-Bold')
         .fillColor('#1e40af')
         .text(data.course_title, 0, 340, {
           align: 'center',
           width: pageWidth
         });

      // Date
      const formattedDate = new Date(data.completion_date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      doc.fontSize(14)
         .font('Helvetica')
         .fillColor('#6b7280')
         .text(`Completed on ${formattedDate}`, 0, 420, {
           align: 'center',
           width: pageWidth
         });

      // Certificate ID
      doc.fontSize(10)
         .fillColor('#9ca3af')
         .text(`Certificate ID: ${data.certificate_id}`, 0, pageHeight - 80, {
           align: 'center',
           width: pageWidth
         });

      // Signature line and platform name
      const signatureY = pageHeight - 140;
      doc.moveTo(pageWidth / 2 - 100, signatureY)
         .lineTo(pageWidth / 2 + 100, signatureY)
         .stroke('#9ca3af');

      doc.fontSize(12)
         .fillColor('#374151')
         .text('Internship LMS Platform', 0, signatureY + 10, {
           align: 'center',
           width: pageWidth
         });

      // Finalize PDF
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

export const checkCertificateEligibility = async (
  studentId: string,
  courseId: string
): Promise<{ eligible: boolean; message?: string; percentage?: number }> => {
  try {
    // Check if student is enrolled
    const enrollmentCheck = await query(
      'SELECT id FROM course_assignments WHERE course_id = $1 AND student_id = $2',
      [courseId, studentId]
    );

    if (enrollmentCheck.rows.length === 0) {
      return { eligible: false, message: 'Not enrolled in this course' };
    }

    // Calculate completion percentage
    const completionResult = await query(
      `SELECT 
        COUNT(*) as total_chapters,
        COUNT(CASE WHEN p.completed = true THEN 1 END) as completed_chapters
       FROM chapters ch
       LEFT JOIN progress p ON ch.id = p.chapter_id AND p.student_id = $1
       WHERE ch.course_id = $2`,
      [studentId, courseId]
    );

    const { total_chapters, completed_chapters } = completionResult.rows[0];
    
    if (parseInt(total_chapters) === 0) {
      return { eligible: false, message: 'Course has no chapters' };
    }

    const percentage = (parseInt(completed_chapters) / parseInt(total_chapters)) * 100;

    if (percentage < 100) {
      return { 
        eligible: false, 
        message: 'Course not fully completed',
        percentage: Math.round(percentage * 100) / 100
      };
    }

    return { eligible: true, percentage: 100 };
  } catch (error) {
    console.error('Certificate eligibility check error:', error);
    throw error;
  }
};