import { useId, useState, type FormEvent } from 'react';
import { MapPin, Search } from 'lucide-react';
import { NEIGHBORHOODS, CITIES } from '@/domain/market';
import { cx } from './ui';

/** The primary search: what + where + submit. Stacks into a card on mobile. */
export function SearchBar({ initialQ = '', initialLoc = '', onSearch, size = 'lg' }: { initialQ?: string; initialLoc?: string; onSearch: (q: string, loc: string) => void; size?: 'lg' | 'md' }) {
  const [q, setQ] = useState(initialQ);
  const [loc, setLoc] = useState(initialLoc);
  const listId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSearch(q.trim(), loc.trim());
  };
  const big = size === 'lg';
  return (
    <form role="search" onSubmit={submit} className={cx('flex w-full flex-col gap-1.5 rounded-card border border-line-strong bg-white p-1.5 sm:flex-row sm:items-center sm:gap-0', big ? 'shadow-search' : 'shadow-card')}>
      <label className={cx('flex flex-1 items-center gap-3 rounded-ctl px-3.5 focus-within:bg-canvas-alt/70', big ? 'h-14' : 'h-11')}>
        <Search className="h-[18px] w-[18px] shrink-0 text-ink-muted" aria-hidden />
        <span className="sr-only">What kind of work?</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="What kind of work?" className="h-full w-full min-w-0 bg-transparent text-[15.5px] text-ink placeholder:text-ink-muted focus:outline-none" />
      </label>
      <span aria-hidden className="mx-1 hidden h-8 w-px bg-line sm:block" />
      <div className="mx-3.5 h-px bg-line sm:hidden" aria-hidden />
      <label className={cx('flex flex-1 items-center gap-3 rounded-ctl px-3.5 focus-within:bg-canvas-alt/70', big ? 'h-14' : 'h-11')}>
        <MapPin className="h-[18px] w-[18px] shrink-0 text-ink-muted" aria-hidden />
        <span className="sr-only">Location or ZIP code</span>
        <input value={loc} onChange={(e) => setLoc(e.target.value)} list={listId} placeholder="Location or ZIP code" className="h-full w-full min-w-0 bg-transparent text-[15.5px] text-ink placeholder:text-ink-muted focus:outline-none" />
        <datalist id={listId}>
          {[...CITIES, ...NEIGHBORHOODS.filter((n) => !CITIES.includes(n))].map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </label>
      <button type="submit" className={cx('btn-primary shrink-0 px-6', big ? 'h-12 sm:ml-1.5' : 'h-10 sm:ml-1.5')}>
        Search Jobs
      </button>
    </form>
  );
}
