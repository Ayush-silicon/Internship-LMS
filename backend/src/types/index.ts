export enum UserRole {
  STUDENT = 'student',
  MENTOR = 'mentor',
  ADMIN = 'admin'
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: UserRole;
  is_approved: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  mentor_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface Chapter {
  id: string;
  course_id: string;
  title: string;
  description: string;
  image_url: string;
  video_url: string;
  sequence_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface CourseAssignment {
  id: string;
  course_id: string;
  student_id: string;
  assigned_at: Date;
}

export interface Progress {
  id: string;
  student_id: string;
  chapter_id: string;
  course_id: string;
  completed: boolean;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Certificate {
  id: string;
  student_id: string;
  course_id: string;
  issued_at: Date;
  certificate_url: string;
}

export interface JWTPayload {
  userId: string;
  role: UserRole;
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}