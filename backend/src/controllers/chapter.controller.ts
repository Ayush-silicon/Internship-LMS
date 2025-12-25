import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { sanitizeInput, validateURL } from '../utils/validators.util';
import { UserRole } from '../types';

export const createChapter = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: courseId } = req.params;
    const { title, description, image_url, video_url } = req.body;
    const mentorId = req.user!.userId;

    // Validation
    if (!title) {
      res.status(400).json({ error: 'Title is required' });
      return;
    }

    if (image_url && !validateURL(image_url)) {
      res.status(400).json({ error: 'Invalid image URL' });
      return;
    }

    if (video_url && !validateURL(video_url)) {
      res.status(400).json({ error: 'Invalid video URL' });
      return;
    }

    // Check if course exists and belongs to mentor
    const courseCheck = await query(
      'SELECT id FROM courses WHERE id = $1 AND mentor_id = $2',
      [courseId, mentorId]
    );

    if (courseCheck.rows.length === 0) {
      res.status(404).json({ error: 'Course not found or unauthorized' });
      return;
    }

    // Get next sequence order
    const sequenceResult = await query(
      'SELECT COALESCE(MAX(sequence_order), 0) + 1 as next_sequence FROM chapters WHERE course_id = $1',
      [courseId]
    );

    const nextSequence = sequenceResult.rows[0].next_sequence;

    // Create chapter
    const result = await query(
      `INSERT INTO chapters (course_id, title, description, image_url, video_url, sequence_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        courseId,
        sanitizeInput(title),
        description ? sanitizeInput(description) : null,
        image_url || null,
        video_url || null,
        nextSequence
      ]
    );

    res.status(201).json({
      message: 'Chapter created successfully',
      chapter: result.rows[0]
    });
  } catch (error) {
    console.error('Create chapter error:', error);
    res.status(500).json({ error: 'Failed to create chapter' });
  }
};

export const getChapters = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: courseId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Check access to course
    if (userRole === UserRole.STUDENT) {
      const assignmentCheck = await query(
        'SELECT id FROM course_assignments WHERE course_id = $1 AND student_id = $2',
        [courseId, userId]
      );

      if (assignmentCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not enrolled in this course' });
        return;
      }

      // Get chapters with progress and lock status
      const result = await query(
        `SELECT 
          ch.*,
          p.completed,
          p.completed_at,
          CASE 
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
          END as is_unlocked
         FROM chapters ch
         LEFT JOIN progress p ON ch.id = p.chapter_id AND p.student_id = $2
         WHERE ch.course_id = $1
         ORDER BY ch.sequence_order ASC`,
        [courseId, userId]
      );

      res.status(200).json({ chapters: result.rows });
    } else if (userRole === UserRole.MENTOR) {
      // Check if course belongs to mentor
      const courseCheck = await query(
        'SELECT id FROM courses WHERE id = $1 AND mentor_id = $2',
        [courseId, userId]
      );

      if (courseCheck.rows.length === 0) {
        res.status(403).json({ error: 'Unauthorized access to course' });
        return;
      }

      // Get all chapters for mentor
      const result = await query(
        'SELECT * FROM chapters WHERE course_id = $1 ORDER BY sequence_order ASC',
        [courseId]
      );

      res.status(200).json({ chapters: result.rows });
    } else {
      res.status(403).json({ error: 'Invalid role for this operation' });
    }
  } catch (error) {
    console.error('Get chapters error:', error);
    res.status(500).json({ error: 'Failed to fetch chapters' });
  }
};

export const getChapterById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: courseId, chapterId } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Get chapter
    const chapterResult = await query(
      'SELECT * FROM chapters WHERE id = $1 AND course_id = $2',
      [chapterId, courseId]
    );

    if (chapterResult.rows.length === 0) {
      res.status(404).json({ error: 'Chapter not found' });
      return;
    }

    const chapter = chapterResult.rows[0];

    // Check access
    if (userRole === UserRole.STUDENT) {
      // Check enrollment
      const assignmentCheck = await query(
        'SELECT id FROM course_assignments WHERE course_id = $1 AND student_id = $2',
        [courseId, userId]
      );

      if (assignmentCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not enrolled in this course' });
        return;
      }

      // Check if chapter is unlocked (sequential access)
      if (chapter.sequence_order > 1) {
        const previousChapterCheck = await query(
          `SELECT p.completed
           FROM chapters ch
           LEFT JOIN progress p ON ch.id = p.chapter_id AND p.student_id = $1
           WHERE ch.course_id = $2 AND ch.sequence_order = $3`,
          [userId, courseId, chapter.sequence_order - 1]
        );

        if (previousChapterCheck.rows.length === 0 || !previousChapterCheck.rows[0].completed) {
          res.status(403).json({ 
            error: 'Chapter locked',
            message: 'You must complete the previous chapter first'
          });
          return;
        }
      }

      // Get progress
      const progressResult = await query(
        'SELECT completed, completed_at FROM progress WHERE chapter_id = $1 AND student_id = $2',
        [chapterId, userId]
      );

      const progress = progressResult.rows.length > 0 ? progressResult.rows[0] : null;

      res.status(200).json({ 
        chapter: {
          ...chapter,
          progress
        }
      });
    } else if (userRole === UserRole.MENTOR) {
      // Check if course belongs to mentor
      const courseCheck = await query(
        'SELECT id FROM courses WHERE id = $1 AND mentor_id = $2',
        [courseId, userId]
      );

      if (courseCheck.rows.length === 0) {
        res.status(403).json({ error: 'Unauthorized access to course' });
        return;
      }

      res.status(200).json({ chapter });
    } else {
      res.status(403).json({ error: 'Invalid role for this operation' });
    }
  } catch (error) {
    console.error('Get chapter by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch chapter' });
  }
};

export const updateChapter = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: courseId, chapterId } = req.params;
    const { title, description, image_url, video_url } = req.body;
    const mentorId = req.user!.userId;

    // Validate URLs if provided
    if (image_url && !validateURL(image_url)) {
      res.status(400).json({ error: 'Invalid image URL' });
      return;
    }

    if (video_url && !validateURL(video_url)) {
      res.status(400).json({ error: 'Invalid video URL' });
      return;
    }

    // Check if chapter exists and course belongs to mentor
    const chapterCheck = await query(
      `SELECT ch.id 
       FROM chapters ch
       JOIN courses c ON ch.course_id = c.id
       WHERE ch.id = $1 AND ch.course_id = $2 AND c.mentor_id = $3`,
      [chapterId, courseId, mentorId]
    );

    if (chapterCheck.rows.length === 0) {
      res.status(404).json({ error: 'Chapter not found or unauthorized' });
      return;
    }

    // Update chapter
    const result = await query(
      `UPDATE chapters
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           image_url = COALESCE($3, image_url),
           video_url = COALESCE($4, video_url),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        title ? sanitizeInput(title) : null,
        description ? sanitizeInput(description) : null,
        image_url || null,
        video_url || null,
        chapterId
      ]
    );

    res.status(200).json({
      message: 'Chapter updated successfully',
      chapter: result.rows[0]
    });
  } catch (error) {
    console.error('Update chapter error:', error);
    res.status(500).json({ error: 'Failed to update chapter' });
  }
};

export const deleteChapter = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: courseId, chapterId } = req.params;
    const mentorId = req.user!.userId;

    // Check if chapter exists and course belongs to mentor
    const chapterCheck = await query(
      `SELECT ch.id, ch.sequence_order
       FROM chapters ch
       JOIN courses c ON ch.course_id = c.id
       WHERE ch.id = $1 AND ch.course_id = $2 AND c.mentor_id = $3`,
      [chapterId, courseId, mentorId]
    );

    if (chapterCheck.rows.length === 0) {
      res.status(404).json({ error: 'Chapter not found or unauthorized' });
      return;
    }

    const deletedSequence = chapterCheck.rows[0].sequence_order;

    // Delete chapter
    await query('DELETE FROM chapters WHERE id = $1', [chapterId]);

    // Reorder remaining chapters
    await query(
      `UPDATE chapters
       SET sequence_order = sequence_order - 1
       WHERE course_id = $1 AND sequence_order > $2`,
      [courseId, deletedSequence]
    );

    res.status(200).json({ message: 'Chapter deleted successfully' });
  } catch (error) {
    console.error('Delete chapter error:', error);
    res.status(500).json({ error: 'Failed to delete chapter' });
  }
};