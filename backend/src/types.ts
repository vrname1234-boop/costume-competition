export type UserRole = 'student' | 'admin' | 'owner';
export type UserStatus = 'pending' | 'active' | 'disabled';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface UserRow {
  id: string;
  role: UserRole;
  status: UserStatus;
  email: string | null;
  username: string | null;
  password_hash: string | null;
  must_change_password: boolean;
  display_name: string;
  failed_login_count: number;
  locked_until: Date | null;
  last_login_at: Date | null;
  created_by: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SubmissionRow {
  id: string;
  student_id: string;
  full_name: string;
  year_grade: string;
  class_roll_group: string;
  house_id: string | null;
  category_id: string | null;
  costume_name: string;
  costume_description: string;
  status: SubmissionStatus;
  review_note: string | null;
  rejection_code: string | null;
  internal_note: string | null;
  locked: boolean;
  locked_at: Date | null;
  locked_by: string | null;
  unlocked_at: Date | null;
  unlocked_by: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  image_path: string;
  image_mime: string;
  image_bytes: number;
  image_width: number;
  image_height: number;
  image_sha256: string;
  rules_accepted_at: Date;
  submitted_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface CompetitionSettingsRow {
  id: boolean;
  competition_name: string;
  submission_opens_at: Date | null;
  submission_closes_at: Date | null;
  timezone: string;
  submissions_enabled: boolean;
  number_of_winners: number;
  prize_info: string;
  judging_method: string;
  requirements: string;
  max_file_size_mb: number;
  allowed_file_types: string[];
  locked: boolean;
  updated_by: string | null;
  updated_at: Date;
}

export interface HouseRow {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  description: string;
  requirements: string;
  active: boolean;
  sort_order: number;
}

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  status: UserStatus;
  displayName: string;
  mustChangePassword: boolean;
  label: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
