import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark, BookmarkCheck, Calendar, Clock, MapPin, Repeat } from 'lucide-react';
import { areaForZip } from '@/domain/market';
import { formatDuration, formatNeededDay, formatPay, payQualifier, timeAgo } from '@/domain/format';
import type { Application, Category, Job } from '@/domain/types';
import { AppStatusTag, ExampleTag, UrgencyTag } from './badges';
import { cx } from './ui';

interface Props {
  job: Job;
  category?: Category;
  distance?: number | null;
  application?: Application | null;
  saved?: boolean;
  onToggleSave?: () => void;
  headingLevel?: 'h2' | 'h3';
}

/**
 * The listing card. Text-first: an image appears only when the employer
 * uploaded one. The title link stretches over the whole card so it is one
 * click/tap target, while Save stays independently focusable.
 */
export function JobCard({ job, category, distance, application, saved, onToggleSave, headingLevel = 'h3' }: Props) {
  const H = headingLevel;
  const area = areaForZip(job.zip);
  const duration = formatDuration(job.duration_hours);
  return (
    <article className="group relative flex flex-col rounded-card border border-line bg-white shadow-card transition-[box-shadow,border-color] duration-150 focus-within:border-teal hover:border-line-strong hover:shadow-lift">
      {job.photos[0] && (
        <div className="aspect-[16/10] overflow-hidden rounded-t-card border-b border-line bg-canvas-alt">
          <img src={job.photos[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex min-h-6 items-center justify-between gap-2">
          <span className="truncate text-[12.5px] font-semibold text-ink-muted">{category?.name ?? 'General'}</span>
          <UrgencyTag urgency={job.urgency} compact />
        </div>

        <H className="text-[16.5px] font-semibold leading-snug text-navy">
          <Link to={`/jobs/${job.id}`} className="outline-none after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:underline">
            {job.title}
          </Link>
        </H>
        <p className="mt-1.5 flex items-center gap-1.5 text-[13.5px] text-ink-muted">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">
            {job.neighborhood}
            {area && area.city !== job.neighborhood ? `, ${area.city}` : ''}
            {distance != null && <span className="tabular"> · {distance < 1 ? '<1' : Math.round(distance)} mi</span>}
          </span>
        </p>

        <p className="mt-4 flex items-baseline gap-1.5">
          <span className="text-[20px] font-bold tracking-tight text-ink tabular">{formatPay(job)}</span>
          <span className="text-[13px] text-ink-muted">{payQualifier(job)}</span>
        </p>

        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13.5px] text-ink">
          <li className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
            Needed {formatNeededDay(job.job_date).replace(/^(Today|Tomorrow)$/, (m) => m.toLowerCase())}
          </li>
          {duration && (
            <li className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
              {duration}
            </li>
          )}
          {job.is_recurring && (
            <li className="flex items-center gap-1.5">
              <Repeat className="h-3.5 w-3.5 text-ink-muted" aria-hidden />
              Recurring
            </li>
          )}
        </ul>

        <p className="mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink-muted">{job.description}</p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <div className="flex min-w-0 items-center gap-2 text-[12.5px] text-ink-muted">
            {job.is_demo && <ExampleTag />}
            {application ? <AppStatusTag status={application.status} /> : <span className="whitespace-nowrap">{job.is_demo ? '' : 'Posted '}{timeAgo(job.created_at)}</span>}
          </div>
          <div className="flex items-center gap-1">
            {onToggleSave && (
              <button
                type="button"
                onClick={onToggleSave}
                aria-pressed={saved}
                aria-label={saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`}
                className={cx('relative z-10 rounded-lg p-2 transition-colors hover:bg-canvas-alt', saved ? 'text-teal-700' : 'text-ink-muted hover:text-navy')}
              >
                {saved ? <BookmarkCheck className="h-[18px] w-[18px]" /> : <Bookmark className="h-[18px] w-[18px]" />}
              </button>
            )}
            <span aria-hidden className="flex items-center gap-1 whitespace-nowrap text-[13.5px] font-semibold text-teal-700">
              View Details
              <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function JobCardSkeleton() {
  return (
    <div className="rounded-card border border-line bg-white p-5" aria-hidden>
      <div className="mb-4 h-3 w-24 animate-pulse rounded bg-canvas-tint" />
      <div className="h-4 w-4/5 animate-pulse rounded bg-canvas-tint" />
      <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-canvas-tint/70" />
      <div className="mt-5 h-5 w-20 animate-pulse rounded bg-canvas-tint" />
      <div className="mt-3 h-3 w-2/3 animate-pulse rounded bg-canvas-tint/70" />
      <div className="mt-4 h-3 w-full animate-pulse rounded bg-canvas-tint/60" />
    </div>
  );
}

export function JobGrid({ children, columns = 4 }: { children: React.ReactNode; columns?: 3 | 4 }) {
  return <div className={cx('grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5', columns === 4 ? 'lg:grid-cols-3 xl:grid-cols-4' : 'xl:grid-cols-3')}>{children}</div>;
}
