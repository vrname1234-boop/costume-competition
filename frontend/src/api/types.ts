export type Role = 'student' | 'admin' | 'owner';
export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface SessionUser {
  id: string;
  role: Role;
  displayName: string;
  email: string | null;
  username: string | null;
  mustChangePassword: boolean;
}

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
}

export interface SubmissionWindow {
  open: boolean;
  reason: 'open' | 'not_yet_open' | 'closed' | 'disabled';
  opensAt: string | null;
  closesAt: string | null;
  message: string;
}

export interface SiteData {
  environment: 'development' | 'staging' | 'production';
  content: Record<string, string | boolean>;
  competition: {
    name: string;
    opensAt: string | null;
    closesAt: string | null;
    timezone: string;
    numberOfWinners: number;
    prizeInfo: string;
    requirements: string;
    maxFileSizeMb: number;
    allowedFileTypes: string[];
  };
  submissionWindow: SubmissionWindow;
  houses: { id: string; name: string }[];
  categories: { id: string; name: string; description: string; requirements: string }[];
}

export interface StudentSubmission {
  id: string;
  fullName: string;
  yearGrade: string;
  classRollGroup: string;
  house: string | null;
  houseId: string | null;
  category: string | null;
  categoryId: string | null;
  costumeName: string;
  costumeDescription: string;
  status: SubmissionStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  updatedAt: string;
  photoUrl: string;
}

export interface AdminSubmission {
  id: string;
  studentId: string;
  studentEmail: string | null;
  fullName: string;
  yearGrade: string;
  classRollGroup: string;
  house: string | null;
  category: string | null;
  costumeName: string;
  costumeDescription: string;
  status: SubmissionStatus;
  reviewNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  submittedAt: string;
  updatedAt: string;
}

export interface AdminSubmissionDetail extends AdminSubmission {
  photoUrl: string;
  image: { mime: string; bytes: number; width: number; height: number };
  previousPhotos: { replacedAt: string; photoUrl: string }[];
}

export interface AdminStats {
  totals: { total: number; pending: number; approved: number; rejected: number };
  competition: { name: string; closesAt: string | null; timezone: string };
  submissionWindow: SubmissionWindow;
}

export interface AdminAccount {
  id: string;
  username: string;
  displayName: string;
  status: 'pending' | 'active' | 'disabled';
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface OwnerStats {
  students: number;
  admins: number;
  disabledAdmins: number;
  submissions: number;
  pendingSubmissions: number;
  maintenanceMode: boolean;
  submissionsEnabled: boolean;
  competitionLocked: boolean;
  recentActivity: { id: string; actor_label: string; action: string; created_at: string }[];
}

export interface CompetitionSettings {
  competition_name: string;
  submission_opens_at: string | null;
  submission_closes_at: string | null;
  timezone: string;
  submissions_enabled: boolean;
  number_of_winners: number;
  prize_info: string;
  judging_method: string;
  requirements: string;
  max_file_size_mb: number;
  allowed_file_types: string[];
  locked: boolean;
}

export interface House {
  id: string;
  name: string;
  active: boolean;
  sort_order: number;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  requirements: string;
  active: boolean;
  sort_order: number;
}

export interface AuditLogEntry {
  id: string;
  actor_label: string;
  actor_role: Role | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}
