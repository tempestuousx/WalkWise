import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bookmark, Star } from 'lucide-react';
import { VerifiedBadges } from '@/components/badges';
import { Avatar, Button, EmptyState, ErrorState, PageHeader, PageLoading } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useAuth } from '@/lib/auth';
import { useAction, useCategories } from '@/lib/queries';
import { api } from '@/data';
import { areaForZip } from '@/domain/market';

export default function SavedContractors() {
  const { session } = useAuth();
  const saved = useQuery({ queryKey: ['savedContractors', session?.user.id], queryFn: () => api.listSavedContractors() });
  const cats = useCategories();
  const remove = useAction((id: string) => api.toggleSaveContractor(id), { success: 'Removed from saved contractors' });
  if (saved.isLoading) return <PageLoading />;
  if (saved.isError) return <Page><ErrorState error={saved.error} onRetry={() => saved.refetch()} /></Page>;
  const rows = saved.data ?? [];
  return (
    <Page>
      <PageHeader title="Saved Contractors" description="People you would hire again. Message them about new work, or point them to a listing." />
      {rows.length === 0 ? (
        <EmptyState icon={<Bookmark />} title="No saved contractors yet" action={<Link to="/employer/applicants" className="btn-secondary">Review applicants</Link>}>
          Use “Save contractor” on any applicant to keep them here.
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th scope="col">Contractor</th>
                <th scope="col">Services</th>
                <th scope="col">Based in</th>
                <th scope="col">Record</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ contractor: c, note }) => (
                <tr key={c.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={c.display_name} src={c.avatar_url} size={36} />
                      <div className="min-w-0">
                        <Link to={`/contractors/${c.id}`} className="font-semibold text-navy hover:text-teal-700">
                          {c.display_name}
                        </Link>
                        {note && <p className="max-w-[240px] truncate text-[12.5px] text-ink-muted">{note}</p>}
                        <div className="mt-1">
                          <VerifiedBadges kinds={c.badges} />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[220px] text-[13.5px] text-ink-muted">
                    {c.category_ids
                      .map((id) => cats.data?.find((x) => x.id === id)?.name)
                      .filter(Boolean)
                      .slice(0, 3)
                      .join(', ')}
                  </td>
                  <td className="whitespace-nowrap text-[13.5px]">{areaForZip(c.home_zip)?.neighborhood ?? '—'}</td>
                  <td className="whitespace-nowrap text-[13.5px]">
                    {c.rating !== null ? (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-amber text-amber" aria-hidden /> {c.rating.toFixed(1)}
                      </span>
                    ) : (
                      'No reviews'
                    )}
                    <span className="text-ink-muted"> · {c.completed_jobs} jobs</span>
                  </td>
                  <td className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => remove.mutate(c.id)}>
                      Remove
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
