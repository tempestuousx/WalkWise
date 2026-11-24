import { BROWSE_GROUPS } from '@/domain/categories';
import { iconForGroup } from './categoryIcons';
import { cx } from './ui';

/**
 * Horizontal category browser. A single bordered rail with hairline
 * dividers; the selected group gets a teal underline and icon. Scrolls
 * horizontally on narrow screens instead of wrapping.
 */
export function CategoryStrip({ value, onChange, counts }: { value: string | null; onChange: (g: string | null) => void; counts?: Record<string, number> }) {
  return (
    <nav aria-label="Browse by category" className="-mx-4 sm:mx-0">
      <ul className="scrollbar-none flex snap-x overflow-x-auto border-y border-line bg-white px-2 sm:rounded-card sm:border sm:px-0 xl:overflow-visible">
        {BROWSE_GROUPS.map((g, i) => {
          const Icon = iconForGroup(g.slug);
          const active = value === g.slug;
          const n = counts?.[g.slug];
          return (
            <li key={g.slug} className={cx('relative min-w-[112px] flex-1 xl:min-w-0 snap-start', i > 0 && 'before:absolute before:inset-y-4 before:left-0 before:w-px before:bg-line')}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? null : g.slug)}
                className={cx(
                  'group relative flex w-full flex-col items-center gap-2 px-2 pb-3.5 pt-4 text-center transition-colors focus-visible:outline-offset-[-2px]',
                  active ? 'text-teal-700' : 'text-ink hover:text-navy',
                )}
              >
                <Icon className={cx('h-[22px] w-[22px] transition-colors', active ? 'text-teal' : 'text-ink-muted group-hover:text-navy')} strokeWidth={1.6} aria-hidden />
                <span className="whitespace-nowrap text-[13px] font-semibold leading-tight">{g.name}</span>
                <span className="text-[12px] leading-none text-ink-muted tabular">{n === undefined ? ' ' : n === 0 ? 'No jobs' : `${n} ${n === 1 ? 'job' : 'jobs'}`}</span>
                <span aria-hidden className={cx('absolute inset-x-5 bottom-0 h-[2px] rounded-full transition-colors', active ? 'bg-teal' : 'bg-transparent')} />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
