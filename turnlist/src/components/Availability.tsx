import { freshness } from '@/domain/freshness';
import type { Job } from '@/domain/types';
import { cx } from './ui';

/**
 * One line that answers "can I still apply, and for how long?". Teal dot =
 * accepting; amber when fewer than 24 hours remain; gray when closed.
 */
export function AvailabilityLine({ job, applied, className }: { job: Pick<Job, 'created_at' | 'expires_at' | 'status' | 'moderation_status'>; applied?: React.ReactNode; className?: string }) {
  const f = freshness(job);
  return (
    <p className={cx('flex items-center justify-between gap-3 text-[13px]', className)}>
      {applied ? (
        <span className="flex shrink-0 items-center">
          <span className="sr-only">You applied. Status: </span>
          {applied}
        </span>
      ) : (
        <span className={cx('flex items-center gap-1.5 whitespace-nowrap font-semibold', f.accepting ? 'text-ink' : 'text-ink-muted')}>
          <span aria-hidden className={cx('h-2 w-2 shrink-0 rounded-full', !f.accepting ? 'bg-ink-faint' : f.closingSoon ? 'bg-amber' : 'bg-teal')} />
          {f.accepting ? 'Applications open' : f.closedReason}
        </span>
      )}
      {f.closesShort && <span className={cx('min-w-0 truncate', f.closingSoon ? 'font-semibold text-amber-800' : 'text-ink-muted')}>{f.closesShort}</span>}
    </p>
  );
}

/** "New · 3h ago" for the first day, then "Posted 2d ago". */
export function PostedLabel({ createdAt, className }: { createdAt: string; className?: string }) {
  const f = freshness({ created_at: createdAt, expires_at: createdAt, status: 'open', moderation_status: 'approved' });
  return (
    <span className={cx('flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12.5px] text-ink-muted', className)}>
      {f.isNew && <span className="tag h-5 bg-teal-50 px-1.5 text-[11px] text-teal-700">New</span>}
      <time dateTime={createdAt} title={new Date(createdAt).toLocaleString()}>
        {f.isNew ? f.postedAgo : `Posted ${f.postedAgo}`}
      </time>
    </span>
  );
}
