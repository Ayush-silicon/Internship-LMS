import { Response } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

export const completeChapter = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { chapterId } = req.params;
    const studentId = req.user!.userId;

    // Get chapter details
    const chapterResult = await query(
      'SELECT id, course_id, sequence_order FROM chapters WHERE id = $1',
      [chapterId]
    );

    if (chapterResult.rows.length === 0) {
      res.status(404).json({ error: 'Chapter not found' });
      return;
    }

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

    // Check if already completed
    const existingProgress = await query(
      'SELECT id, completed FROM progress WHERE chapter_id = $1 AND student_id = $2',
      [chapterId, studentId]
    );

    if (existingProgress.rows.length > 0 && existingProgress.rows[0].completed) {
      res.status(400).json({ error: 'Chapter already completed' });
      return;
    }

    // Create or update progress
    const progressResult = await query(
      `INSERT INTO progress (student_id, chapter_id, course_id, completed, completed_at)
       VALUES ($1, $2, $3, true, NOW())
       ON CONFLICT (student_id, chapter_id)
       DO UPDATE SET completed = true, completed_at = NOW(), updated_at = NOW()
       RETURNING *`,
      [studentId, chapterId, chapter.course_id]
    );

    // Calculate course completion percentage
    const completionResult = await query(
      `SELECT 
        COUNT(*) as total_chapters,
        COUNT(CASE WHEN p.completed = true THEN 1 END) as completed_chapters
       FROM chapters ch
       LEFT JOIN progress p ON ch.id = p.chapter_id AND p.student_id = $1
       WHERE ch.course_id = $2`,
      [studentId, chapter.course_id]
    );

    const { total_chapters, completed_chapters } = completionResult.rows[0];
    const completionPercentage = (parseInt(completed_chapters) / parseInt(total_chapters)) * 100;

    res.status(200).json({
      message: 'Chapter completed successfully',
      progress: progressResult.rows[0],
      completion: {
        total_chapters: parseInt(total_chapters),
        completed_chapters: parseInt(completed_chapters),
        percentage: Math.round(completionPercentage * 100) / 100
      }
    });
  } catch (error) {
    console.error('Complete chapter error:', error);
    res.status(500).json({ error: 'Failed to complete chapter' });
  }
};

export const getMyProgress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.user!.userId;
    const { courseId } = req.query;

    let progressQuery: string;
    let queryParams: any[];

    if (courseId) {
      // Get progress for specific course
      progressQuery = `
        SELECT 
          c.id as course_id,
          c.title as course_title,
          c.description as course_description,
          COUNT(ch.id) as total_chapters,
          COUNT(CASE WHEN p.completed = true THEN 1 END) as completed_chapters,
          ROUND(
            (COUNT(CASE WHEN p.completed = true THEN 1 END)::NUMERIC / 
             NULLIF(COUNT(ch.id), 0) * 100), 2
          ) as completion_percentage,
          json_agg(
            json_build_object(
              'chapter_id', ch.id,
              'chapter_title', ch.title,
              'sequence_order', ch.sequence_order,
              'completed', COALESCE(p.completed, false),
              'completed_at', p.completed_at
            ) ORDER BY ch.sequence_order
          ) as chapters
        FROM courses c
        INNER JOIN course_assignments ca ON c.id = ca.course_id
        LEFT JOIN chapters ch ON c.id = ch.course_id
        LEFT JOIN progress p ON ch.id = p.chapter_id AND p.student_id = ca.student_id
        WHERE ca.student_id = $1 AND c.id = $2
        GROUP BY c.id, c.title, c.description
      `;
      queryParams = [studentId, courseId];
    } else {
      // Get progress for all enrolled courses
      progressQuery = `
        SELECT 
          c.id as course_id,
          c.title as course_title,
          c.description as course_description,
          u.full_name as mentor_name,
          COUNT(ch.id) as total_chapters,
          COUNT(CASE WHEN p.completed = true THEN 1 END) as completed_chapters,
          ROUND(
            (COUNT(CASE WHEN p.completed = true THEN 1 END)::NUMERIC / 
             NULLIF(COUNT(ch.id), 0) * 100), 2
          ) as completion_percentage,
          ca.assigned_at
        FROM courses c
        INNER JOIN course_assignments ca ON c.id = ca.course_id
        INNER JOIN users u ON c.mentor_id = u.id
        LEFT JOIN chapters ch ON c.id = ch.course_id
        LEFT JOIN progress p ON ch.id = p.chapter_id AND p.student_id = ca.student_id
        WHERE ca.student_id = $1
        GROUP BY c.id, c.title, c.description, u.full_name, ca.assigned_at
        ORDER BY ca.assigned_at DESC
      `;
      queryParams = [studentId];
    }

    const result = await query(progressQuery, queryParams);

    if (courseId) {
      if (result.rows.length === 0) {
        res.status(404).json({ error: 'Course not found or not enrolled' });
        return;
      }
      res.status(200).json({ progress: result.rows[0] });
    } else {
      res.status(200).json({ progress: result.rows });
    }
  } catch (error) {
    console.error('Get my progress error:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
};

export const getCourseProgress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;
    const studentId = req.user!.userId;

    // Check enrollment
    const enrollmentCheck = await query(
      'SELECT id FROM course_assignments WHERE course_id = $1 AND student_id = $2',
      [courseId, studentId]
    );

    if (enrollmentCheck.rows.length === 0) {
      res.status(403).json({ error: 'You are not enrolled in this course' });
      return;
    }

    // Get detailed progress
    const result = await query(
      `SELECT 
        c.id as course_id,
        c.title as course_title,
        c.description as course_description,
        COUNT(ch.id) as total_chapters,
        COUNT(CASE WHEN p.completed = true THEN 1 END) as completed_chapters,
        ROUND(
          (COUNT(CASE WHEN p.completed = true THEN 1 END)::NUMERIC / 
           NULLIF(COUNT(ch.id), 0) * 100), 2
        ) as completion_percentage,
        json_agg(
          json_build_object(
            'chapter_id', ch.id,
            'chapter_title', ch.title,
            'chapter_description', ch.description,
            'sequence_order', ch.sequence_order,
            'completed', COALESCE(p.completed, false),
            'completed_at', p.completed_at,
            'is_unlocked', CASE 
              WHEN ch.sequence_order = 1 THEN true
              WHEN EXISTS (
                SELECT 1 FROM progress prev_p
                JOIN chapters prev_ch ON prev_p.chapter_id = prev_ch.id
                WHERE prev_ch.course_id = ch.course_id
                AND prev_ch.sequence_order = ch.sequence_order - 1
                AND prev_p.student_id = $2
                AND prev_p.completed = true
              ) THEN true
              ELSE false
            END
          ) ORDER BY ch.sequence_order
        ) as chapters
       FROM courses c
       LEFT JOIN chapters ch ON c.id = ch.course_id
       LEFT JOIN progress p ON ch.id = p.chapter_id AND p.student_id = $2
       WHERE c.id = $1
       GROUP BY c.id, c.title, c.description`,
      [courseId, studentId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    res.status(200).json({ progress: result.rows[0] });
  } catch (error) {
    console.error('Get course progress error:', error);
    res.status(500).json({ error: 'Failed to fetch course progress' });
  }
};

export const resetProgress = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { courseId } = req.params;
    const studentId = req.user!.userId;

    // Check enrollment
    const enrollmentCheck = await query(
      'SELECT id FROM course_assignments WHERE course_id = $1 AND student_id = $2',
      [courseId, studentId]
    );

    if (enrollmentCheck.rows.length === 0) {
      res.status(403).json({ error: 'You are not enrolled in this course' });
      return;
    }

    // Delete all progress for this course
    await query(
      'DELETE FROM progress WHERE student_id = $1 AND course_id = $2',
      [studentId, courseId]
    );

    res.status(200).json({ message: 'Progress reset successfully' });
  } catch (error) {
    console.error('Reset progress error:', error);
    res.status(500).json({ error: 'Failed to reset progress' });
  }
};
