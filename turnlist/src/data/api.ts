import type {
  AdminAction,
  Application,
  ApplicationStatus,
  BusinessProfile,
  Category,
  ContractorProfile,
  Conversation,
  Job,
  JobPrivateDetails,
  JobStatus,
  Message,
  Notification,
  NotificationPreferences,
  Profile,
  Report,
  Review,
  Role,
  Verification,
  VerificationKind,
} from '@/domain/types';
import type { ApplicationInput, JobInput } from '@/domain/validation';

/**
 * The single contract the UI talks to. Two implementations:
 *  - demoApi: runs entirely in the browser (localStorage) with the same
 *    permission rules as the database policies. Used when Supabase is not configured.
 *  - supabaseApi: Postgres + RLS + RPC functions in supabase/migrations.
 * Every method acts as the signed-in user and throws ApiError on refusal.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    public code: 'unauthenticated' | 'forbidden' | 'not_found' | 'invalid' | 'conflict' | 'unavailable' = 'invalid',
  ) {
    super(message);
  }
}

export interface Session {
  user: Profile;
}

export interface PublicEmployer {
  id: string;
  display_name: string;
  company_name: string | null;
  business_type: BusinessProfile['business_type'] | null;
  avatar_url: string | null;
  member_since: string;
  jobs_posted: number;
  jobs_completed: number;
  badges: VerificationKind[];
  is_demo: boolean;
}

export interface ContractorSummary {
  id: string;
  display_name: string;
  business_name: string | null;
  headline: string | null;
  avatar_url: string | null;
  home_zip: string | null;
  years_experience: number | null;
  category_ids: string[];
  badges: VerificationKind[];
  rating: number | null;
  review_count: number;
  completed_jobs: number;
  is_demo: boolean;
}

export interface ContractorPublic extends ContractorSummary {
  bio: string | null;
  service_radius_miles: number;
  availability: ContractorProfile['availability'];
  insurance_self_reported: boolean;
  licenses: ContractorProfile['licenses'];
  certifications: string[];
  portfolio: ContractorProfile['portfolio'];
  /** Only returned to employers the contractor has applied to, and to admins. */
  contact: { phone: string | null; email: string | null } | null;
  reviews: Array<Review & { reviewer_name: string; job_title: string | null }>;
  member_since: string;
}

export interface JobDetail {
  job: Job;
  employer: PublicEmployer;
  privateDetails: JobPrivateDetails | null;
  myApplication: Application | null;
  isSaved: boolean;
  isOwner: boolean;
}

export interface ApplicationWithJob {
  application: Application;
  job: Job;
  employer_name: string;
}

export interface ApplicationWithContractor {
  application: Application;
  contractor: ContractorSummary;
  job: Pick<Job, 'id' | 'title' | 'status' | 'job_date' | 'category_id' | 'zip'>;
}

export interface ConversationSummary {
  conversation: Conversation;
  other: { id: string; name: string; avatar_url: string | null; role: Role };
  job_title: string | null;
  last_message: Message | null;
  unread: number;
}

export interface MyAccount {
  profile: Profile;
  business: BusinessProfile | null;
  contractor: ContractorProfile | null;
  preferences: NotificationPreferences;
}

export interface Metrics {
  employers: number;
  contractors: number;
  activeListings: number;
  totalListings: number;
  applications: number;
  avgApplicationsPerJob: number;
  filledJobs: number;
  medianHoursToSelection: number | null;
  returningEmployers: number;
  topCategories: { category_id: string; count: number }[];
  noApplicationJobs: number;
  topZips: { zip: string; count: number }[];
  /** Share of legitimate postings (approved, out of their first 72 hours or closed) with at least one qualified applicant. */
  primary: { eligible: number; succeeded: number; rate: number | null };
  pendingModeration: number;
  pendingVerifications: number;
  openReports: number;
  statusCounts: Record<JobStatus, number>;
}

export interface AdminUserRow {
  profile: Profile;
  company_name: string | null;
  jobs: number;
  applications: number;
  open_reports: number;
}

export interface UploadResult {
  /** Public URL for public buckets; storage path for private buckets. */
  url: string;
  path: string;
}

export type UploadBucket = 'job-photos' | 'portfolio' | 'avatars' | 'verification-docs';

export interface DataApi {
  readonly mode: 'demo' | 'supabase';

  // auth
  getSession(): Promise<Session | null>;
  onAuthChange(cb: (s: Session | null) => void): () => void;
  signIn(email: string, password: string): Promise<Session>;
  signUp(input: { role: 'employer' | 'contractor'; display_name: string; email: string; password: string }): Promise<Session | { confirmEmail: true }>;
  signOut(): Promise<void>;

  // reference data
  listCategories(opts?: { includeInactive?: boolean }): Promise<Category[]>;

  // jobs
  listAvailableJobs(): Promise<Job[]>;
  getJob(id: string): Promise<JobDetail>;
  createJob(input: JobInput): Promise<Job>;
  updateJob(id: string, input: JobInput): Promise<Job>;
  setJobStatus(id: string, status: JobStatus, reason?: string): Promise<Job>;
  listMyJobs(): Promise<Job[]>;
  shareAddress(jobId: string, contractorId: string): Promise<void>;
  reportJob(jobId: string, reason: string): Promise<void>;

  // applications
  applyToJob(jobId: string, input: ApplicationInput): Promise<Application>;
  withdrawApplication(id: string): Promise<Application>;
  listMyApplications(): Promise<ApplicationWithJob[]>;
  listApplicantsForEmployer(jobId?: string): Promise<ApplicationWithContractor[]>;
  setApplicationStatus(id: string, status: Exclude<ApplicationStatus, 'selected' | 'withdrawn'>): Promise<Application>;
  selectApplication(id: string): Promise<Job>;

  // saved items
  listSavedJobIds(): Promise<string[]>;
  toggleSaveJob(jobId: string): Promise<boolean>;
  listSavedContractors(): Promise<Array<{ contractor: ContractorSummary; note: string | null; saved_at: string }>>;
  toggleSaveContractor(contractorId: string, note?: string | null): Promise<boolean>;

  // profiles
  getMyAccount(): Promise<MyAccount>;
  updateMyProfile(patch: { display_name?: string; avatar_url?: string | null }): Promise<Profile>;
  saveBusinessProfile(input: Omit<BusinessProfile, 'user_id' | 'plan' | 'free_listings_used' | 'updated_at'>): Promise<BusinessProfile>;
  saveContractorProfile(input: Omit<ContractorProfile, 'user_id' | 'updated_at'>): Promise<ContractorProfile>;
  getContractor(id: string): Promise<ContractorPublic>;
  getEmployer(id: string): Promise<PublicEmployer>;
  savePreferences(prefs: NotificationPreferences): Promise<void>;
  upload(bucket: UploadBucket, file: File): Promise<UploadResult>;

  // reviews
  createReview(jobId: string, rating: number, body: string | null): Promise<Review>;
  listReviewsForJob(jobId: string): Promise<Review[]>;

  // messages
  listConversations(): Promise<ConversationSummary[]>;
  getMessages(conversationId: string): Promise<{ summary: ConversationSummary; messages: Message[] }>;
  startConversation(otherUserId: string, jobId: string | null): Promise<string>;
  sendMessage(conversationId: string, body: string): Promise<Message>;

  // notifications
  listNotifications(): Promise<Notification[]>;
  markNotificationsRead(ids: string[] | 'all'): Promise<void>;

  // verification
  listMyVerifications(): Promise<Verification[]>;
  submitVerification(input: { kind: VerificationKind; file: File | null; details: string }): Promise<Verification>;

  // admin
  adminMetrics(): Promise<Metrics>;
  adminListJobs(): Promise<Array<Job & { employer_name: string; report_count: number }>>;
  adminModerateJob(id: string, decision: 'approve' | 'reject' | 'remove', reason: string | null): Promise<void>;
  adminListUsers(): Promise<AdminUserRow[]>;
  adminSetUserStatus(id: string, status: Profile['status'], reason: string | null): Promise<void>;
  adminSetTrust(id: string, trust: Profile['trust_level']): Promise<void>;
  adminListVerifications(): Promise<Array<Verification & { user_name: string; user_role: Role }>>;
  adminReviewVerification(id: string, decision: 'approved' | 'rejected', note: string | null, expires_on: string | null): Promise<void>;
  adminVerificationDocumentUrl(id: string): Promise<string | null>;
  adminSaveCategory(input: Partial<Category> & { name: string; group: string }): Promise<Category>;
  adminListActions(): Promise<Array<AdminAction & { admin_name: string }>>;
  adminListReports(): Promise<Array<Report & { reporter_name: string; target_label: string }>>;
  adminResolveReport(id: string, status: 'resolved' | 'dismissed'): Promise<void>;
}
