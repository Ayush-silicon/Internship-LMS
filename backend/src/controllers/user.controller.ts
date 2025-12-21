import { Response } from 'express';
import { query } from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { UserRole } from '../types';

export const getAllUsers = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      `SELECT id, email, full_name, role, is_approved, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`
    );

    res.status(200).json({ users: result.rows });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

export const getUserById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const result = await query(
      `SELECT id, email, full_name, role, is_approved, created_at, updated_at
       FROM users
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.status(200).json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user by ID error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
};

export const approveMentor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if user exists and is a mentor
    const userCheck = await query(
      'SELECT id, role, is_approved FROM users WHERE id = $1',
      [id]
    );

    if (userCheck.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userCheck.rows[0];

    if (user.role !== UserRole.MENTOR) {
      res.status(400).json({ error: 'User is not a mentor' });
      return;
    }

    if (user.is_approved) {
      res.status(400).json({ error: 'Mentor is already approved' });
      return;
    }

    // Approve mentor
    const result = await query(
      `UPDATE users 
       SET is_approved = true, updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, full_name, role, is_approved`,
      [id]
    );

    res.status(200).json({
      message: 'Mentor approved successfully',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('Approve mentor error:', error);
    res.status(500).json({ error: 'Failed to approve mentor' });
  }
};

export const rejectMentor = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if user exists and is a mentor
    const userCheck = await query(
      'SELECT id, role FROM users WHERE id = $1',
      [id]
    );

    if (userCheck.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userCheck.rows[0];

    if (user.role !== UserRole.MENTOR) {
      res.status(400).json({ error: 'User is not a mentor' });
      return;
    }

    // Delete mentor (rejection)
    await query('DELETE FROM users WHERE id = $1', [id]);

    res.status(200).json({ message: 'Mentor rejected and removed successfully' });
  } catch (error) {
    console.error('Reject mentor error:', error);
    res.status(500).json({ error: 'Failed to reject mentor' });
  }
};

export const deleteUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Check if user exists
    const userCheck = await query('SELECT id FROM users WHERE id = $1', [id]);

    if (userCheck.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Delete user (cascade will handle related records)
    await query('DELETE FROM users WHERE id = $1', [id]);

    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

export const getPlatformAnalytics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Get total counts
    const usersResult = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE role = 'student') as total_students,
        COUNT(*) FILTER (WHERE role = 'mentor' AND is_approved = true) as total_mentors,
        COUNT(*) FILTER (WHERE role = 'mentor' AND is_approved = false) as pending_mentors
       FROM users`
    );

    const coursesResult = await query('SELECT COUNT(*) as total_courses FROM courses');
    
    const certificatesResult = await query('SELECT COUNT(*) as total_certificates FROM certificates');

    const completionStats = await query(
      `SELECT 
        c.id,
        c.title,
        COUNT(DISTINCT ca.student_id) as enrolled_students,
        COUNT(DISTINCT cert.student_id) as completed_students
       FROM courses c
       LEFT JOIN course_assignments ca ON c.id = ca.course_id
       LEFT JOIN certificates cert ON c.id = cert.course_id
       GROUP BY c.id, c.title
       ORDER BY enrolled_students DESC
       LIMIT 10`
    );

    res.status(200).json({
      analytics: {
        users: {
          total_students: parseInt(usersResult.rows[0].total_students),
          total_mentors: parseInt(usersResult.rows[0].total_mentors),
          pending_mentors: parseInt(usersResult.rows[0].pending_mentors)
        },
        courses: {
          total_courses: parseInt(coursesResult.rows[0].total_courses)
        },
        certificates: {
          total_certificates: parseInt(certificatesResult.rows[0].total_certificates)
        },
        top_courses: completionStats.rows
      }
    });
  } catch (error) {
    console.error('Get platform analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};
