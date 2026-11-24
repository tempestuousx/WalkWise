import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { EmptyState, ErrorState, PageHeader, PageLoading, Select } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useApplicants, useMyJobs } from '@/lib/queries';
import { ApplicantCard } from './ApplicantCard';

const FILTERS = [
  ['to_review', 'To review'],
  ['shortlisted', 'Shortlisted'],
  ['selected', 'Selected'],
  ['not_selected', 'Not selected'],
  ['all', 'All'],
] as const;

export default function Applicants() {
  const apps = useApplicants();
  const jobs = useMyJobs();
  const [filter, setFilter] = useState<(typeof FILTERS)[number][0]>('to_review');
  const [jobId, setJobId] = useState('');
  if (apps.isLoading) return <PageLoading />;
  if (apps.isError) return <Page><ErrorState error={apps.error} onRetry={() => apps.refetch()} /></Page>;
  const all = (apps.data ?? []).filter((a) => !jobId || a.job.id === jobId);
  const rows = all.filter((a) => {
    const s = a.application.status;
    if (filter === 'to_review') return (s === 'submitted' || s === 'viewed') && a.job.status === 'open';
    if (filter === 'all') return true;
    return s === filter;
  });
  const jobsWithApps = (jobs.data ?? []).filter((j) => apps.data?.some((a) => a.job.id === j.id));

  return (
    <Page>
      <PageHeader title="Applicants" description="Everyone who has applied to your listings, newest first." />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Applicant status" className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {FILTERS.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={filter === k} aria-pressed={filter === k} onClick={() => setFilter(k)} className="chip whitespace-nowrap">
              {label}
            </button>
          ))}
        </div>
        <Select value={jobId} onChange={(e) => setJobId(e.target.value)} className="sm:w-72" aria-label="Filter by listing">
          <option value="">All listings</option>
          {jobsWithApps.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </Select>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Users />} title={filter === 'to_review' ? 'Nothing to review' : 'No applicants here'} action={<Link to="/employer/post" className="btn-secondary">Post a Job</Link>}>
          {filter === 'to_review' ? 'New applications show up here and in your notifications.' : 'Try another filter.'}
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((a) => (
            <li key={a.application.id}>
              <ApplicantCard item={a} jobOpen={a.job.status === 'open'} hasAddress={false} showJob />
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
