import type { Application, ApplicationStatus, Job, JobDisplayStatus, JobStatus, Role, Urgency } from './types';

/**
 * Job lifecycle. Mirrored by the trigger public.enforce_job_transition() in SQL.
 *
 *   open ──select──▶ filled ──start──▶ in_progress ──▶ completed
 *    │ ╲               │  ╲ (contractor backs out: reopen)
 *    │  expire         │   ▶ open
 *    ▼                 ▼
 *  canceled          canceled
 *
 * "applications_received" is not stored: it is an open job with at least one
 * active application, so it can never drift out of sync with the data.
 */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  open: ['filled', 'canceled', 'expired'],
  filled: ['in_progress', 'completed', 'canceled', 'open'],
  in_progress: ['completed', 'canceled'],
  completed: [],
  canceled: [],
  expired: ['open'],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

export function isJobExpired(job: Pick<Job, 'status' | 'expires_at'>, now = new Date()): boolean {
  return job.status === 'expired' || (job.status === 'open' && new Date(job.expires_at) < now);
}

export function jobDisplayStatus(job: Pick<Job, 'status' | 'expires_at' | 'application_count'>, now = new Date()): JobDisplayStatus {
  if (isJobExpired(job, now)) return 'expired';
  if (job.status === 'open' && job.application_count > 0) return 'applications_received';
  return job.status;
}

/** A job is shown to contractors as available only when all of these hold. */
export function isJobAvailable(job: Pick<Job, 'status' | 'moderation_status' | 'expires_at'>, now = new Date()): boolean {
  return job.status === 'open' && job.moderation_status === 'approved' && new Date(job.expires_at) >= now;
}

export const JOB_STATUS_LABEL: Record<JobDisplayStatus, string> = {
  open: 'Open',
  applications_received: 'Applications received',
  filled: 'Filled',
  in_progress: 'In progress',
  completed: 'Completed',
  canceled: 'Canceled',
  expired: 'Expired',
};

/**
 * Application lifecycle. Employers move submitted → viewed → shortlisted →
 * selected / not_selected. Contractors can only withdraw while undecided.
 */
const EMPLOYER_APP_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['viewed', 'shortlisted', 'selected', 'not_selected'],
  viewed: ['shortlisted', 'selected', 'not_selected'],
  shortlisted: ['viewed', 'selected', 'not_selected'],
  selected: ['not_selected'],
  not_selected: ['shortlisted'],
  withdrawn: [],
};
const CONTRACTOR_APP_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  submitted: ['withdrawn'],
  viewed: ['withdrawn'],
  shortlisted: ['withdrawn'],
  selected: ['withdrawn'],
  not_selected: [],
  withdrawn: [],
};

export function canTransitionApplication(actor: Role, from: ApplicationStatus, to: ApplicationStatus): boolean {
  if (actor === 'admin') return from !== to;
  const table = actor === 'employer' ? EMPLOYER_APP_TRANSITIONS : CONTRACTOR_APP_TRANSITIONS;
  return table[from].includes(to);
}

export const APP_STATUS_LABEL: Record<ApplicationStatus, string> = {
  submitted: 'Submitted',
  viewed: 'Viewed',
  shortlisted: 'Shortlisted',
  selected: 'Selected',
  not_selected: 'Not selected',
  withdrawn: 'Withdrawn',
};

/** Plain-language explanation shown to contractors. Never implies a guarantee of work. */
export const APP_STATUS_HELP: Record<ApplicationStatus, string> = {
  submitted: 'Sent. The business has not opened it yet.',
  viewed: 'The business has looked at your application.',
  shortlisted: 'You are on the shortlist. The business may still choose someone else.',
  selected: 'The business selected you. Confirm the details with them in Messages.',
  not_selected: 'The business went with someone else for this job.',
  withdrawn: 'You withdrew this application.',
};

export const isActiveApplication = (a: Pick<Application, 'status'>) => a.status !== 'withdrawn' && a.status !== 'not_selected';

export const URGENCY_LABEL: Record<Urgency, string> = {
  flexible: 'Flexible',
  within_7_days: 'Within 7 days',
  within_48_hours: 'Within 48 hours',
  same_day: 'Same day',
};
export const URGENCY_RANK: Record<Urgency, number> = { same_day: 3, within_48_hours: 2, within_7_days: 1, flexible: 0 };
