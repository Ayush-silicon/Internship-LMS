import { Response } from 'express';
import { query, getClient } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { sanitizeInput, validateURL } from '../utils/validators.util';
import { UserRole } from '../types';

export const createCourse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { title, description } = req.body;
    const mentorId = req.user!.userId;

    // Validation
    if (!title || !description) {
      res.status(400).json({ error: 'Title and description are required' });
      return;
    }

    // Check if mentor is approved
    const mentorCheck = await query(
      'SELECT is_approved FROM users WHERE id = $1 AND role = $2',
      [mentorId, UserRole.MENTOR]
    );

    if (mentorCheck.rows.length === 0 || !mentorCheck.rows[0].is_approved) {
      res.status(403).json({ error: 'Only approved mentors can create courses' });
      return;
    }

    // Create course
    const result = await query(
      `INSERT INTO courses (title, description, mentor_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [sanitizeInput(title), sanitizeInput(description), mentorId]
    );

    res.status(201).json({
      message: 'Course created successfully',
      course: result.rows[0]
    });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ error: 'Failed to create course' });
  }
};

export const getMyCourses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    let result;

    if (userRole === UserRole.MENTOR) {
      // Get courses created by mentor
      result = await query(
        `SELECT c.*, 
                COUNT(DISTINCT ca.student_id) as enrolled_students,
                COUNT(DISTINCT ch.id) as total_chapters
         FROM courses c
         LEFT JOIN course_assignments ca ON c.id = ca.course_id
         LEFT JOIN chapters ch ON c.id = ch.course_id
         WHERE c.mentor_id = $1
         GROUP BY c.id
         ORDER BY c.created_at DESC`,
        [userId]
      );
    } else if (userRole === UserRole.STUDENT) {
      // Get courses assigned to student
      result = await query(
        `SELECT c.*,
                u.full_name as mentor_name,
                COUNT(DISTINCT ch.id) as total_chapters,
                COUNT(DISTINCT CASE WHEN p.completed = true THEN p.id END) as completed_chapters
         FROM courses c
         INNER JOIN course_assignments ca ON c.id = ca.course_id
         INNER JOIN users u ON c.mentor_id = u.id
         LEFT JOIN chapters ch ON c.id = ch.course_id
         LEFT JOIN progress p ON ch.id = p.chapter_id AND p.student_id = ca.student_id
         WHERE ca.student_id = $1
         GROUP BY c.id, u.full_name
         ORDER BY ca.assigned_at DESC`,
        [userId]
      );
    } else {
      res.status(403).json({ error: 'Invalid role for this operation' });
      return;
    }

    res.status(200).json({ courses: result.rows });
  } catch (error) {
    console.error('Get my courses error:', error);
    res.status(500).json({ error: 'Failed to fetch courses' });
  }
};

export const getCourseById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    // Get course details
    const courseResult = await query(
      `SELECT c.*, u.full_name as mentor_name
       FROM courses c
       JOIN users u ON c.mentor_id = u.id
       WHERE c.id = $1`,
      [id]
    );

    if (courseResult.rows.length === 0) {
      res.status(404).json({ error: 'Course not found' });
      return;
    }

    const course = courseResult.rows[0];

    // Check access permissions
    if (userRole === UserRole.STUDENT) {
      const assignmentCheck = await query(
        'SELECT id FROM course_assignments WHERE course_id = $1 AND student_id = $2',
        [id, userId]
      );

      if (assignmentCheck.rows.length === 0) {
        res.status(403).json({ error: 'You are not enrolled in this course' });
        return;
      }
    } else if (userRole === UserRole.MENTOR) {
      if (course.mentor_id !== userId) {
        res.status(403).json({ error: 'You can only access your own courses' });
        return;
      }
    }

    res.status(200).json({ course });
  } catch (error) {
    console.error('Get course by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch course' });
  }
};

export const updateCourse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;
    const mentorId = req.user!.userId;

    // Check if course exists and belongs to mentor
    const courseCheck = await query(
      'SELECT id FROM courses WHERE id = $1 AND mentor_id = $2',
      [id, mentorId]
    );

    if (courseCheck.rows.length === 0) {
      res.status(404).json({ error: 'Course not found or unauthorized' });
      return;
    }

    // Update course
    const result = await query(
      `UPDATE courses
       SET title = COALESCE($1, title),
           description = COALESCE($2, description),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [title ? sanitizeInput(title) : null, description ? sanitizeInput(description) : null, id]
    );

    res.status(200).json({
      message: 'Course updated successfully',
      course: result.rows[0]
    });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ error: 'Failed to update course' });
  }
};

export const deleteCourse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const mentorId = req.user!.userId;

    // Check if course exists and belongs to mentor
    const courseCheck = await query(
      'SELECT id FROM courses WHERE id = $1 AND mentor_id = $2',
      [id, mentorId]
    );

    if (courseCheck.rows.length === 0) {
      res.status(404).json({ error: 'Course not found or unauthorized' });
      return;
    }

    // Delete course (cascade will handle related records)
    await query('DELETE FROM courses WHERE id = $1', [id]);

    res.status(200).json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ error: 'Failed to delete course' });
  }
};

export const assignCourse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { student_ids } = req.body;
    const mentorId = req.user!.userId;

    // Validation
    if (!Array.isArray(student_ids) || student_ids.length === 0) {
      res.status(400).json({ error: 'student_ids must be a non-empty array' });
      return;
    }

    // Check if course exists and belongs to mentor
    const courseCheck = await query(
      'SELECT id FROM courses WHERE id = $1 AND mentor_id = $2',
      [id, mentorId]
    );

    if (courseCheck.rows.length === 0) {
      res.status(404).json({ error: 'Course not found or unauthorized' });
      return;
    }

    const client = await getClient();

    try {
      await client.query('BEGIN');

      const assignments = [];
      const errors = [];

      for (const studentId of student_ids) {
        // Check if student exists
        const studentCheck = await client.query(
          'SELECT id FROM users WHERE id = $1 AND role = $2',
          [studentId, UserRole.STUDENT]
        );

        if (studentCheck.rows.length === 0) {
          errors.push({ student_id: studentId, error: 'Student not found' });
          continue;
        }

        // Check if already assigned
        const existingAssignment = await client.query(
          'SELECT id FROM course_assignments WHERE course_id = $1 AND student_id = $2',
          [id, studentId]
        );

        if (existingAssignment.rows.length > 0) {
          errors.push({ student_id: studentId, error: 'Already assigned' });
          continue;
        }

        // Create assignment
        const result = await client.query(
          `INSERT INTO course_assignments (course_id, student_id)
           VALUES ($1, $2)
           RETURNING *`,
          [id, studentId]
        );

        assignments.push(result.rows[0]);
      }

      await client.query('COMMIT');

      res.status(200).json({
        message: 'Course assignment completed',
        successful: assignments.length,
        failed: errors.length,
        assignments,
        errors
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Assign course error:', error);
    res.status(500).json({ error: 'Failed to assign course' });
  }
};

export const getEnrolledStudents = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const mentorId = req.user!.userId;

    // Check if course belongs to mentor
    const courseCheck = await query(
      'SELECT id FROM courses WHERE id = $1 AND mentor_id = $2',
      [id, mentorId]
    );

    if (courseCheck.rows.length === 0) {
      res.status(404).json({ error: 'Course not found or unauthorized' });
      return;
    }

    // Get enrolled students with progress
    const result = await query(
      `SELECT 
        u.id,
        u.email,
        u.full_name,
        ca.assigned_at,
        COUNT(ch.id) as total_chapters,
        COUNT(CASE WHEN p.completed = true THEN 1 END) as completed_chapters,
        ROUND(
          (COUNT(CASE WHEN p.completed = true THEN 1 END)::NUMERIC / 
           NULLIF(COUNT(ch.id), 0) * 100), 2
        ) as completion_percentage
       FROM users u
       INNER JOIN course_assignments ca ON u.id = ca.student_id
       LEFT JOIN chapters ch ON ca.course_id = ch.course_id
       LEFT JOIN progress p ON ch.id = p.chapter_id AND u.id = p.student_id
       WHERE ca.course_id = $1
       GROUP BY u.id, u.email, u.full_name, ca.assigned_at
       ORDER BY ca.assigned_at DESC`,
      [id]
    );

    res.status(200).json({ students: result.rows });
  } catch (error) {
    console.error('Get enrolled students error:', error);
    res.status(500).json({ error: 'Failed to fetch enrolled students' });
  }
};