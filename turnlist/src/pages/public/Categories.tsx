import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { iconForGroup } from '@/components/categoryIcons';
import { ErrorState, PageHeader, PageLoading } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useAvailableJobs, useCategories } from '@/lib/queries';
import { BROWSE_GROUPS } from '@/domain/categories';
import { isJobAvailable } from '@/domain/status';

export default function Categories() {
  const cats = useCategories();
  const jobs = useAvailableJobs();
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs.data ?? []) if (isJobAvailable(j)) m.set(j.category_id, (m.get(j.category_id) ?? 0) + 1);
    return m;
  }, [jobs.data]);
  if (cats.isLoading) return <PageLoading />;
  if (cats.isError) return <Page><ErrorState error={cats.error} onRetry={() => cats.refetch()} /></Page>;
  return (
    <Page>
      <PageHeader title="Browse Categories" description="Every kind of work listed on Turnlist. Trades that usually require a Nevada contractor license are marked." />
      <div className="grid gap-x-10 gap-y-12 md:grid-cols-2 xl:grid-cols-4">
        {BROWSE_GROUPS.map((g) => {
          const Icon = iconForGroup(g.slug);
          const items = (cats.data ?? []).filter((c) => c.group === g.slug);
          if (!items.length) return null;
          const total = items.reduce((s, c) => s + (counts.get(c.id) ?? 0), 0);
          return (
            <section key={g.slug} aria-labelledby={`g-${g.slug}`}>
              <Link to={`/jobs?group=${g.slug}`} className="group flex items-center gap-3 border-b border-line pb-3">
                <Icon className="h-5 w-5 text-ink-muted group-hover:text-teal" strokeWidth={1.6} aria-hidden />
                <h2 id={`g-${g.slug}`} className="flex-1 text-[16px] group-hover:text-teal-700">
                  {g.name}
                </h2>
                <span className="text-[13px] text-ink-muted tabular">{total}</span>
              </Link>
              <ul className="mt-2">
                {items.map((c) => (
                  <li key={c.id}>
                    <Link to={`/jobs?group=${g.slug}&cats=${c.id}`} className="flex items-center justify-between gap-3 rounded-lg px-1 py-2 text-[14.5px] text-ink hover:text-teal-700">
                      <span className="flex items-center gap-2">
                        {c.name}
                        {c.requires_license && (
                          <span title="License usually required" className="text-ink-muted">
                            <ShieldCheck className="h-3.5 w-3.5" aria-label="License usually required" />
                          </span>
                        )}
                      </span>
                      <span className="text-[13px] text-ink-muted tabular">{counts.get(c.id) ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Page>
  );
}
