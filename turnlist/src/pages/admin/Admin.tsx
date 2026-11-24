import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, FileText, Plus, Search } from 'lucide-react';
import { ExampleTag, JobStatusTag, ModerationTag } from '@/components/badges';
import { Button, Checkbox, Dialog, EmptyState, ErrorState, Field, Input, PageHeader, PageLoading, Select, Textarea, cx } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useAction, useCategories } from '@/lib/queries';
import { api, isDemo } from '@/data';
import { BROWSE_GROUPS, groupName } from '@/domain/categories';
import { areaForZip } from '@/domain/market';
import { formatPay, timeAgo } from '@/domain/format';
import { jobDisplayStatus } from '@/domain/status';
import { BADGE_LABEL } from '@/domain/profile';
import type { Category } from '@/domain/types';

const useMetrics = () => useQuery({ queryKey: ['admin', 'metrics'], queryFn: () => api.adminMetrics() });

export function AdminOverview() {
  const m = useMetrics();
  const cats = useCategories();
  const actions = useQuery({ queryKey: ['admin', 'actions'], queryFn: () => api.adminListActions() });
  const reports = useQuery({ queryKey: ['admin', 'reports'], queryFn: () => api.adminListReports() });
  const resolve = useAction(({ id, s }: { id: string; s: 'resolved' | 'dismissed' }) => api.adminResolveReport(id, s), { success: 'Report closed' });
  if (m.isLoading) return <PageLoading />;
  if (m.isError || !m.data) return <Page><ErrorState error={m.error} onRetry={() => m.refetch()} /></Page>;
  const d = m.data;
  const pct = d.primary.rate === null ? null : Math.round(d.primary.rate * 100);
  const maxCat = Math.max(1, ...d.topCategories.map((c) => c.count));
  const maxZip = Math.max(1, ...d.topZips.map((z) => z.count));
  const openReports = (reports.data ?? []).filter((r) => r.status === 'open');

  return (
    <Page>
      <PageHeader eyebrow="Administration" title="Marketplace overview" description={isDemo ? 'Computed from the example data in this browser.' : 'Excludes demo data. Rejected and removed listings are not counted as legitimate.'} />

      <section aria-labelledby="primary-h" className="rounded-card border border-line bg-white p-6 sm:p-8">
        <h2 id="primary-h" className="text-[14px] font-semibold text-ink-muted">
          Listings that attracted a qualified applicant
        </h2>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="text-[56px] font-bold leading-none tracking-tight text-navy tabular">{pct === null ? 'n/a' : `${pct}%`}</span>
          <span className="text-[15px] text-ink-muted tabular">
            {d.primary.succeeded} of {d.primary.eligible} measured listings
          </span>
        </p>
        <p className="mt-3 max-w-2xl text-[13.5px] text-ink-muted">
          Approved listings that have been live 72 hours or have closed, with at least one applicant whose services, service area, and license status matched the job when they applied. This is the main health measure for the marketplace.
        </p>
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <h2 className="mb-3 text-[17px]">Activity</h2>
          <div className="overflow-hidden rounded-card border border-line bg-white">
            <dl className="grid grid-cols-2 divide-line sm:grid-cols-4 [&>div]:border-b [&>div]:border-line [&>div]:p-4">
              <Stat label="Employers" value={d.employers} />
              <Stat label="Contractors" value={d.contractors} />
              <Stat label="Active listings" value={d.activeListings} />
              <Stat label="All approved listings" value={d.totalListings} />
              <Stat label="Applications" value={d.applications} />
              <Stat label="Per listing" value={d.avgApplicationsPerJob.toFixed(1)} />
              <Stat label="Filled" value={d.filledJobs} />
              <Stat label="Median time to selection" value={d.medianHoursToSelection === null ? 'n/a' : d.medianHoursToSelection < 48 ? `${Math.round(d.medianHoursToSelection)} h` : `${(d.medianHoursToSelection / 24).toFixed(1)} d`} />
              <Stat label="Returning employers" value={d.returningEmployers} />
              <Stat label="No applications" value={d.noApplicationJobs} warn={d.noApplicationJobs > 0} />
              <Stat label="Completed" value={d.statusCounts.completed} />
              <Stat label="Expired" value={d.statusCounts.expired} />
            </dl>
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-[17px]">Queues</h2>
          <ul className="divide-y divide-line rounded-card border border-line bg-white">
            <QueueRow to="/admin/listings?filter=pending" label="Listings awaiting review" n={d.pendingModeration} />
            <QueueRow to="/admin/verifications" label="Verification requests" n={d.pendingVerifications} />
            <QueueRow to="/admin/listings?filter=reported" label="Open reports" n={d.openReports} />
          </ul>
        </section>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <RankList title="Most requested categories" rows={d.topCategories.map((c) => ({ label: cats.data?.find((x) => x.id === c.category_id)?.name ?? c.category_id, n: c.count, max: maxCat }))} />
        <RankList title="Most active ZIP codes" rows={d.topZips.map((z) => ({ label: `${z.zip} ${areaForZip(z.zip)?.neighborhood ?? ''}`, n: z.count, max: maxZip }))} />
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-[17px]">Open reports</h2>
        {openReports.length === 0 ? (
          <p className="text-[14px] text-ink-muted">No open reports.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-white">
            {openReports.map((r) => (
              <li key={r.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{r.target_label}</p>
                  <p className="text-[14px] text-ink">{r.reason}</p>
                  <p className="text-[12.5px] text-ink-muted">
                    Reported by {r.reporter_name} · {timeAgo(r.created_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  {r.target_type === 'job' && (
                    <Link to={`/jobs/${r.target_id}`} className="btn-secondary btn-sm">
                      View
                    </Link>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => resolve.mutate({ id: r.id, s: 'resolved' })}>
                    Resolved
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: r.id, s: 'dismissed' })}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="mb-3 text-[17px]">Moderation log</h2>
        {!actions.data?.length ? (
          <p className="text-[14px] text-ink-muted">Every approval, removal, suspension, and verification decision is recorded here.</p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-line bg-white">
            <table className="table min-w-[560px]">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Admin</th>
                  <th scope="col">Action</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {actions.data.slice(0, 25).map((a) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap text-ink-muted">{timeAgo(a.created_at)}</td>
                    <td>{a.admin_name}</td>
                    <td className="font-mono text-[12.5px]">
                      {a.action} <span className="text-ink-muted">{a.target_type}</span>
                    </td>
                    <td className="text-ink-muted">{a.reason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Page>
  );
}

function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) {
  return (
    <div>
      <dt className="text-[12.5px] font-medium text-ink-muted">{label}</dt>
      <dd className={cx('mt-1 text-[20px] font-semibold tabular', warn ? 'text-amber-800' : 'text-navy')}>{value}</dd>
    </div>
  );
}
function QueueRow({ to, label, n }: { to: string; label: string; n: number }) {
  return (
    <li>
      <Link to={to} className="flex items-center justify-between px-5 py-4 text-[14.5px] hover:bg-canvas-alt">
        {label}
        <span className={cx('tag tabular', n ? 'bg-amber-50 text-amber-800' : 'bg-canvas-alt text-ink-muted')}>{n}</span>
      </Link>
    </li>
  );
}
function RankList({ title, rows }: { title: string; rows: Array<{ label: string; n: number; max: number }> }) {
  return (
    <section>
      <h2 className="mb-3 text-[17px]">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-[14px] text-ink-muted">No data yet.</p>
      ) : (
        <ol className="space-y-2.5 rounded-card border border-line bg-white p-5">
          {rows.map((r) => (
            <li key={r.label} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-[14px]">
              <span className="truncate">{r.label}</span>
              <span className="font-semibold tabular">{r.n}</span>
              <span className="col-span-2 h-1 overflow-hidden rounded-full bg-canvas-alt" aria-hidden>
                <span className="block h-full rounded-full bg-navy/70" style={{ width: `${(r.n / r.max) * 100}%` }} />
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function AdminListings() {
  const params = new URLSearchParams(location.search);
  const [filter, setFilter] = useState(params.get('filter') ?? 'pending');
  const [q, setQ] = useState('');
  const jobs = useQuery({ queryKey: ['admin', 'jobs'], queryFn: () => api.adminListJobs() });
  const cats = useCategories();
  const [decision, setDecision] = useState<{ id: string; title: string; kind: 'reject' | 'remove' } | null>(null);
  const approve = useAction((id: string) => api.adminModerateJob(id, 'approve', null), { success: 'Listing approved and published' });
  const rows = useMemo(() => {
    const all = jobs.data ?? [];
    const f = all.filter((j) => {
      if (filter === 'pending') return j.moderation_status === 'pending';
      if (filter === 'reported') return j.report_count > 0;
      if (filter === 'active') return j.status === 'open' && j.moderation_status === 'approved';
      if (filter === 'removed') return j.moderation_status === 'rejected' || j.moderation_status === 'removed';
      return true;
    });
    const t = q.trim().toLowerCase();
    return t ? f.filter((j) => `${j.title} ${j.employer_name} ${j.zip}`.toLowerCase().includes(t)) : f;
  }, [jobs.data, filter, q]);

  if (jobs.isLoading) return <PageLoading />;
  if (jobs.isError) return <Page><ErrorState error={jobs.error} onRetry={() => jobs.refetch()} /></Page>;
  const count = (k: string) => (jobs.data ?? []).filter((j) => (k === 'pending' ? j.moderation_status === 'pending' : k === 'reported' ? j.report_count > 0 : false)).length;

  return (
    <Page>
      <PageHeader eyebrow="Administration" title="Listings" description="Approve new accounts’ listings, review reports, and remove listings that break the standards." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="tablist">
          {[
            ['pending', `Awaiting review (${count('pending')})`],
            ['reported', `Reported (${count('reported')})`],
            ['active', 'Live'],
            ['removed', 'Rejected or removed'],
            ['all', 'All'],
          ].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} aria-pressed={filter === k} onClick={() => setFilter(k)} className="chip whitespace-nowrap">
              {l}
            </button>
          ))}
        </div>
        <label className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input className="h-10 pl-9" placeholder="Search title, business, ZIP" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search listings" />
        </label>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing here">{filter === 'pending' ? 'No listings are waiting for review.' : 'No listings match.'}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((j) => (
            <li key={j.id} className="rounded-card border border-line bg-white p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/jobs/${j.id}`} className="font-semibold text-navy hover:text-teal-700">
                      {j.title}
                    </Link>
                    <JobStatusTag status={jobDisplayStatus(j)} />
                    <ModerationTag status={j.moderation_status} />
                    {j.report_count > 0 && <span className="tag bg-danger-50 text-danger">{j.report_count} report{j.report_count > 1 ? 's' : ''}</span>}
                    {j.is_demo && <ExampleTag />}
                  </div>
                  <p className="mt-1 text-[13.5px] text-ink-muted tabular">
                    {j.employer_name} · {cats.data?.find((c) => c.id === j.category_id)?.name} · {j.neighborhood} {j.zip} · {formatPay(j)} · posted {timeAgo(j.created_at)}
                  </p>
                  <p className="mt-2 line-clamp-2 text-[14px] text-ink">{j.description}</p>
                  {j.moderation_note && <p className="mt-1 text-[13px] text-ink-muted">Note: {j.moderation_note}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {j.moderation_status === 'pending' && (
                    <>
                      <Button size="sm" loading={approve.isPending} onClick={() => approve.mutate(j.id)}>
                        Approve
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setDecision({ id: j.id, title: j.title, kind: 'reject' })}>
                        Reject
                      </Button>
                    </>
                  )}
                  {j.moderation_status === 'approved' && (
                    <Button size="sm" variant="danger" onClick={() => setDecision({ id: j.id, title: j.title, kind: 'remove' })}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      <ReasonDialog
        open={Boolean(decision)}
        title={decision?.kind === 'remove' ? 'Remove listing' : 'Reject listing'}
        description={`${decision?.title ?? ''}. The business sees your reason.${decision?.kind === 'remove' ? ' Active listings are canceled and applicants notified.' : ''}`}
        confirmLabel={decision?.kind === 'remove' ? 'Remove listing' : 'Reject listing'}
        onClose={() => setDecision(null)}
        onConfirm={(reason) => api.adminModerateJob(decision!.id, decision!.kind, reason)}
        success={decision?.kind === 'remove' ? 'Listing removed' : 'Listing rejected'}
      />
    </Page>
  );
}

function ReasonDialog({ open, title, description, confirmLabel, onClose, onConfirm, success }: { open: boolean; title: string; description: string; confirmLabel: string; onClose: () => void; onConfirm: (reason: string) => Promise<unknown>; success: string }) {
  const [reason, setReason] = useState('');
  const act = useAction(() => onConfirm(reason), { success, onSuccess: () => { setReason(''); onClose(); } });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={act.isPending} disabled={!reason.trim()} onClick={() => act.mutate(undefined)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label="Reason" hint="Be specific. Reference the listing standards where you can.">
        {(a) => <Textarea {...a} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />}
      </Field>
    </Dialog>
  );
}

export function AdminUsers() {
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.adminListUsers() });
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [suspend, setSuspend] = useState<{ id: string; name: string } | null>(null);
  const reactivate = useAction((id: string) => api.adminSetUserStatus(id, 'active', null), { success: 'Account reactivated' });
  const trust = useAction(({ id, t }: { id: string; t: 'new' | 'trusted' }) => api.adminSetTrust(id, t), { success: (_r) => 'Trust level updated' });
  if (users.isLoading) return <PageLoading />;
  if (users.isError) return <Page><ErrorState error={users.error} onRetry={() => users.refetch()} /></Page>;
  const t = q.trim().toLowerCase();
  const rows = (users.data ?? []).filter((u) => (!role || u.profile.role === role) && (!t || `${u.profile.display_name} ${u.profile.email} ${u.company_name ?? ''}`.toLowerCase().includes(t)));
  return (
    <Page>
      <PageHeader eyebrow="Administration" title="Users" description="New business accounts have their listings reviewed until you mark them trusted." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input className="pl-9" placeholder="Search name, email, company" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </label>
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="sm:w-48" aria-label="Filter by role">
          <option value="">All roles</option>
          <option value="employer">Businesses</option>
          <option value="contractor">Contractors</option>
          <option value="admin">Admins</option>
        </Select>
      </div>
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="table min-w-[860px]">
          <thead>
            <tr>
              <th scope="col">User</th>
              <th scope="col">Role</th>
              <th scope="col">Activity</th>
              <th scope="col">Joined</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ profile: p, company_name, jobs, applications, open_reports }) => (
              <tr key={p.id}>
                <td>
                  <p className="font-semibold text-navy">
                    {p.role === 'contractor' ? <Link to={`/contractors/${p.id}`} className="hover:text-teal-700">{p.display_name}</Link> : p.display_name} {p.is_demo && <ExampleTag />}
                  </p>
                  <p className="text-[12.5px] text-ink-muted">
                    {company_name ? `${company_name} · ` : ''}
                    {p.email}
                  </p>
                </td>
                <td className="capitalize">{p.role === 'employer' ? 'Business' : p.role}</td>
                <td className="text-[13.5px] tabular">
                  {p.role === 'employer' ? `${jobs} listings` : p.role === 'contractor' ? `${applications} applications` : '—'}
                  {open_reports > 0 && <span className="ml-2 tag bg-danger-50 text-danger">{open_reports} reports</span>}
                </td>
                <td className="whitespace-nowrap text-ink-muted">{timeAgo(p.created_at)}</td>
                <td>
                  <div className="flex flex-wrap gap-1.5">
                    <span className={cx('tag', p.status === 'active' ? 'bg-teal-50 text-teal-700' : 'bg-danger-50 text-danger')}>{p.status === 'active' ? 'Active' : 'Suspended'}</span>
                    {p.role === 'employer' && <span className={cx('tag', p.trust_level === 'trusted' ? 'bg-canvas-alt text-ink' : 'bg-amber-50 text-amber-800')}>{p.trust_level === 'trusted' ? 'Trusted' : 'New'}</span>}
                  </div>
                </td>
                <td className="text-right">
                  {p.role !== 'admin' && (
                    <div className="flex justify-end gap-1">
                      {p.role === 'employer' && (
                        <Button size="sm" variant="ghost" onClick={() => trust.mutate({ id: p.id, t: p.trust_level === 'trusted' ? 'new' : 'trusted' })}>
                          {p.trust_level === 'trusted' ? 'Require review' : 'Mark trusted'}
                        </Button>
                      )}
                      {p.status === 'active' ? (
                        <Button size="sm" variant="danger" onClick={() => setSuspend({ id: p.id, name: p.display_name })}>
                          Suspend
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => reactivate.mutate(p.id)}>
                          Reactivate
                        </Button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ReasonDialog
        open={Boolean(suspend)}
        title={`Suspend ${suspend?.name ?? ''}?`}
        description="They will be signed out of new actions and their open listings will be canceled."
        confirmLabel="Suspend account"
        onClose={() => setSuspend(null)}
        onConfirm={(reason) => api.adminSetUserStatus(suspend!.id, 'suspended', reason)}
        success="Account suspended"
      />
    </Page>
  );
}

export function AdminVerifications() {
  const q = useQuery({ queryKey: ['admin', 'verifications'], queryFn: () => api.adminListVerifications() });
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  if (q.isLoading) return <PageLoading />;
  if (q.isError) return <Page><ErrorState error={q.error} onRetry={() => q.refetch()} /></Page>;
  const rows = (q.data ?? []).filter((v) => showAll || v.status === 'pending');
  const current = q.data?.find((v) => v.id === reviewing) ?? null;
  return (
    <Page>
      <PageHeader eyebrow="Administration" title="Verification requests" description="Approve only what you checked. Approved requests create the public badge; documents stay private." />
      <div className="mb-5">
        <Checkbox label="Show reviewed requests" checked={showAll} onChange={setShowAll} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No pending requests">New requests from contractors and businesses appear here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line rounded-card border border-line bg-white">
          {rows.map((v) => (
            <li key={v.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-navy">
                  {BADGE_LABEL[v.kind].replace(' verified', '')} · {v.user_name} <span className="font-medium text-ink-muted">({v.user_role === 'employer' ? 'business' : v.user_role})</span>
                </p>
                <p className="text-[13.5px] text-ink-muted">
                  {v.document_name ?? 'No document'} · submitted {timeAgo(v.created_at)}
                </p>
                {v.details && <p className="mt-1 text-[14px] text-ink">{v.details}</p>}
              </div>
              {v.status === 'pending' ? (
                <Button size="sm" onClick={() => setReviewing(v.id)}>
                  Review
                </Button>
              ) : (
                <span className={cx('tag', v.status === 'approved' ? 'bg-teal-50 text-teal-700' : 'bg-canvas-alt text-ink-muted')}>{v.status}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {current && <VerificationReview v={current} onClose={() => setReviewing(null)} />}
    </Page>
  );
}

function VerificationReview({ v, onClose }: { v: Awaited<ReturnType<typeof api.adminListVerifications>>[number]; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [expires, setExpires] = useState('');
  const [checked, setChecked] = useState(false);
  const decide = useAction((d: 'approved' | 'rejected') => api.adminReviewVerification(v.id, d, note || null, expires || null), { success: (_r) => 'Decision saved', onSuccess: onClose });
  const openDoc = useAction(() => api.adminVerificationDocumentUrl(v.id), {
    onSuccess: (url) => (url ? window.open(url, '_blank', 'noopener') : alert(isDemo ? 'Demo mode does not store documents.' : 'No document attached.')),
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Review: ${BADGE_LABEL[v.kind].replace(' verified', '')}`}
      description={`${v.user_name} · submitted ${timeAgo(v.created_at)}`}
      footer={
        <>
          <Button variant="danger" loading={decide.isPending} disabled={!note.trim()} onClick={() => decide.mutate('rejected')}>
            Reject
          </Button>
          <Button loading={decide.isPending} disabled={!checked} onClick={() => decide.mutate('approved')}>
            Approve
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Button variant="secondary" onClick={() => openDoc.mutate(undefined)} loading={openDoc.isPending}>
          <FileText className="h-4 w-4" aria-hidden /> Open document <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Button>
        {v.details && <p className="rounded-ctl bg-canvas-alt px-4 py-3 text-[14px]">{v.details}</p>}
        {v.kind === 'license' && (
          <p className="text-[13.5px] text-ink-muted">
            Check the number on the{' '}
            <a className="link" href="https://app.nvcontractorsboard.com/Clients/NVSCB/Public/ContractorLicenseSearch/ContractorLicenseSearch.aspx" target="_blank" rel="noreferrer">
              Nevada State Contractors Board lookup
            </a>{' '}
            and match the name and classification.
          </p>
        )}
        <Field label="Valid until" optional hint="Badge disappears automatically after this date.">
          {(a) => <Input {...a} type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />}
        </Field>
        <Field label="Note" hint="Required to reject. Shared with the user.">
          {(a) => <Textarea {...a} rows={3} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <Checkbox label="I checked this document myself and it matches the account" checked={checked} onChange={setChecked} />
      </div>
    </Dialog>
  );
}

export function AdminCategories() {
  const q = useQuery({ queryKey: ['categories', 'all'], queryFn: () => api.listCategories({ includeInactive: true }) });
  const [editing, setEditing] = useState<Partial<Category> | null>(null);
  if (q.isLoading) return <PageLoading />;
  if (q.isError) return <Page><ErrorState error={q.error} /></Page>;
  return (
    <Page>
      <PageHeader
        eyebrow="Administration"
        title="Categories"
        description="Hidden categories stay on existing listings but cannot be chosen for new ones."
        actions={
          <Button onClick={() => setEditing({ name: '', group: 'other', requires_license: false, active: true })}>
            <Plus className="h-4 w-4" aria-hidden /> Add category
          </Button>
        }
      />
      <div className="overflow-x-auto rounded-card border border-line bg-white">
        <table className="table min-w-[600px]">
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">Browse group</th>
              <th scope="col">License</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Edit</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((c) => (
              <tr key={c.id} className={cx(!c.active && 'text-ink-muted')}>
                <td className="font-medium">{c.name}</td>
                <td>{groupName(c.group)}</td>
                <td>{c.requires_license ? 'Required' : '—'}</td>
                <td>{c.active ? 'Visible' : 'Hidden'}</td>
                <td className="text-right">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <CategoryDialog initial={editing} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function CategoryDialog({ initial, onClose }: { initial: Partial<Category>; onClose: () => void }) {
  const [c, setC] = useState(initial);
  const save = useAction(() => api.adminSaveCategory({ ...c, name: c.name ?? '', group: c.group ?? 'other' }), { success: 'Category saved', onSuccess: onClose });
  return (
    <Dialog
      open
      onClose={onClose}
      title={initial.id ? 'Edit category' : 'Add category'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Name">{(a) => <Input {...a} value={c.name ?? ''} onChange={(e) => setC({ ...c, name: e.target.value })} />}</Field>
        <Field label="Browse group" hint="Which icon in the category strip it falls under.">
          {(a) => (
            <Select {...a} value={c.group} onChange={(e) => setC({ ...c, group: e.target.value })}>
              {BROWSE_GROUPS.map((g) => (
                <option key={g.slug} value={g.slug}>
                  {g.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Checkbox label="Usually requires a contractor license" description="Listings are marked license-required and contractors without a license are not matched." checked={Boolean(c.requires_license)} onChange={(v) => setC({ ...c, requires_license: v })} />
        {c.requires_license && <Field label="License disclosure" hint="Shown on listings in this category.">{(a) => <Textarea {...a} rows={3} value={c.license_note ?? ''} onChange={(e) => setC({ ...c, license_note: e.target.value })} />}</Field>}
        <Checkbox label="Visible" checked={c.active !== false} onChange={(v) => setC({ ...c, active: v })} />
      </div>
    </Dialog>
  );
}
