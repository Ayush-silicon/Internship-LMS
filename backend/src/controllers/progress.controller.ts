import { Response } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

export const completeChapter = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chapterId } = req.params;
    const studentId = req.user!.userId;

    const chapterResult = await query(
      'SELECT id, course_id, sequence_order FROM chapters WHERE id = $1',
      [chapterId]
    );

    const chapter = chapterResult.rows[0];

    // Check if student is enrolled in the course
    const enrollmentCheck = await query(
      'SELECT id FROM course_assignments WHERE course_id = $1 AND student_id = $2',
      [chapter.course_id, studentId]
    );

    if (enrollmentCheck.rows.length === 0) {
      res.status(403).json({ error: 'You are not enrolled in this course' });
      return;
    }
    // Check sequential access - previous chapter must be completed
    if (chapter.sequence_order > 1) {
      const previousChapterCheck = await query(
        `SELECT p.completed
         FROM chapters ch
         LEFT JOIN progress p ON ch.id = p.chapter_id AND p.student_id = $1
         WHERE ch.course_id = $2 AND ch.sequence_order = $3`,
        [studentId, chapter.course_id, chapter.sequence_order - 1]
      );

      if (previousChapterCheck.rows.length === 0 || !previousChapterCheck.rows[0].completed) {
        res.status(403).json({ 
          error: 'Cannot complete chapter',
          message: 'You must complete the previous chapter first'
        });
        return;
      }
    }
