import { isJobAvailable } from './status';
import { timeAgo } from './format';
import type { Job } from './types';

/** A listing counts as new for its first 24 hours. */
export const NEW_LISTING_HOURS = 24;
/** Closing within this window is called out in amber. */
export const CLOSING_SOON_HOURS = 24;

export interface Freshness {
  /** Posted in the last 24 hours. */
  isNew: boolean;
  /** "3h ago", "2d ago". */
  postedAgo: string;
  /** Accepting applications right now. */
  accepting: boolean;
  /** "Closes today", "Closes tomorrow", "Closes Friday", "Closes Dec 4". Null when not accepting. */
  closesLabel: string | null;
  /** Card-width version: "Closes Fri". */
  closesShort: string | null;
  /** Fewer than 24 hours left to apply. */
  closingSoon: boolean;
  /** Why it is not accepting: "Filled", "Expired", ... Null when accepting. */
  closedReason: string | null;
}

const CLOSED_REASON: Record<Job['status'], string> = {
  open: 'No longer accepting applications',
  filled: 'Filled',
  in_progress: 'Filled',
  completed: 'Completed',
  canceled: 'Canceled',
  expired: 'Expired',
};

function dayStart(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Applications close at expires_at, which is midnight after the finish-by
 * date (or the date needed). Labels use the last day applications are open.
 */
export function closesLabel(expiresAt: string, now = new Date(), short = false): string {
  const lastDay = dayStart(new Date(new Date(expiresAt).getTime() - 1));
  const diff = Math.round((lastDay.getTime() - dayStart(now).getTime()) / 86_400_000);
  const hoursLeft = (new Date(expiresAt).getTime() - now.getTime()) / 3_600_000;
  if (hoursLeft < 1) return short ? 'Closes in <1h' : 'Closes within the hour';
  if (diff <= 0) return 'Closes today';
  if (diff === 1) return 'Closes tomorrow';
  if (diff < 7) return `Closes ${lastDay.toLocaleDateString('en-US', { weekday: short ? 'short' : 'long' })}`;
  return `Closes ${lastDay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

export function freshness(job: Pick<Job, 'created_at' | 'expires_at' | 'status' | 'moderation_status'>, now = new Date()): Freshness {
  const ageHours = (now.getTime() - new Date(job.created_at).getTime()) / 3_600_000;
  const accepting = isJobAvailable(job, now);
  const hoursLeft = (new Date(job.expires_at).getTime() - now.getTime()) / 3_600_000;
  let closedReason: string | null = null;
  if (!accepting) {
    if (job.moderation_status === 'pending') closedReason = 'Awaiting review';
    else if (job.moderation_status !== 'approved') closedReason = 'Removed';
    else if (job.status === 'open') closedReason = CLOSED_REASON.expired;
    else closedReason = CLOSED_REASON[job.status];
  }
  return {
    isNew: ageHours < NEW_LISTING_HOURS,
    postedAgo: timeAgo(job.created_at, now),
    accepting,
    closesLabel: accepting ? closesLabel(job.expires_at, now) : null,
    closesShort: accepting ? closesLabel(job.expires_at, now, true) : null,
    closingSoon: accepting && hoursLeft < CLOSING_SOON_HOURS,
    closedReason,
  };
}

/** Full sentence for the job page: "Applications close Thursday, Nov 26." */
export function closesSentence(expiresAt: string): string {
  const lastDay = new Date(new Date(expiresAt).getTime() - 1);
  return `Applications close at the end of ${lastDay.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`;
}

