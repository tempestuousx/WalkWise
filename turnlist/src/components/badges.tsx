import { BadgeCheck } from 'lucide-react';
import { APP_STATUS_LABEL, JOB_STATUS_LABEL, URGENCY_LABEL } from '@/domain/status';
import { BADGE_LABEL } from '@/domain/profile';
import type { ApplicationStatus, JobDisplayStatus, ModerationStatus, Urgency, VerificationKind } from '@/domain/types';
import { cx } from './ui';

// Status colors are semantic and limited: teal = positive/active, amber = needs
// attention, navy-tint = neutral progress, gray = closed, red = removed.
const JOB_TONE: Record<JobDisplayStatus, string> = {
  open: 'bg-teal-50 text-teal-700',
  applications_received: 'bg-amber-50 text-amber-800',
  filled: 'bg-navy-50 text-navy',
  in_progress: 'bg-navy-50 text-navy',
  completed: 'bg-canvas-alt text-ink-muted',
  canceled: 'bg-canvas-alt text-ink-muted',
  expired: 'bg-canvas-alt text-ink-muted',
};
export function JobStatusTag({ status }: { status: JobDisplayStatus }) {
  return (
    <span className={cx('tag', JOB_TONE[status])}>
      <Dot status={status} />
      {JOB_STATUS_LABEL[status]}
    </span>
  );
}
function Dot({ status }: { status: JobDisplayStatus }) {
  const c = status === 'open' ? 'bg-teal' : status === 'applications_received' ? 'bg-amber' : status === 'filled' || status === 'in_progress' ? 'bg-navy' : 'bg-ink-faint';
  return <span aria-hidden className={cx('h-1.5 w-1.5 rounded-full', c)} />;
}

const APP_TONE: Record<ApplicationStatus, string> = {
  submitted: 'bg-canvas-alt text-ink',
  viewed: 'bg-navy-50 text-navy',
  shortlisted: 'bg-amber-50 text-amber-800',
  selected: 'bg-teal-50 text-teal-700',
  not_selected: 'bg-canvas-alt text-ink-muted',
  withdrawn: 'bg-canvas-alt text-ink-muted',
};
export function AppStatusTag({ status }: { status: ApplicationStatus }) {
  return <span className={cx('tag', APP_TONE[status])}>{APP_STATUS_LABEL[status]}</span>;
}

export function ModerationTag({ status }: { status: ModerationStatus }) {
  if (status === 'approved') return null;
  const label = { pending: 'Pending review', rejected: 'Not approved', removed: 'Removed' }[status];
  return <span className={cx('tag', status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-danger-50 text-danger')}>{label}</span>;
}

const COMPACT_URGENCY: Record<Urgency, string> = { same_day: 'Same day', within_48_hours: '48 hours', within_7_days: 'This week', flexible: 'Flexible' };

/** Amber is reserved for time pressure. Flexible jobs show nothing. */
export function UrgencyTag({ urgency, compact }: { urgency: Urgency; compact?: boolean }) {
  if (urgency === 'flexible') return null;
  const strong = urgency === 'same_day' || urgency === 'within_48_hours';
  return (
    <span className={cx('tag', strong ? 'bg-amber-50 text-amber-800' : 'bg-canvas-alt text-ink-muted')}>
      <span aria-hidden className={cx('h-1.5 w-1.5 rounded-full', strong ? 'bg-amber' : 'bg-ink-faint')} />
      {compact ? COMPACT_URGENCY[urgency] : URGENCY_LABEL[urgency]}
    </span>
  );
}

export function ExampleTag() {
  return (
    <span className="tag h-5 shrink-0 border border-line-strong bg-white px-1.5 text-[11px] text-ink-muted" title="Demonstration data, not a real opportunity">
      Example
    </span>
  );
}

export function VerifiedBadges({ kinds }: { kinds: VerificationKind[] }) {
  if (!kinds.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Verified by Turnlist">
      {kinds.map((k) => (
        <li key={k} className="tag bg-teal-50 text-teal-700">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          {BADGE_LABEL[k]}
        </li>
      ))}
    </ul>
  );
}
