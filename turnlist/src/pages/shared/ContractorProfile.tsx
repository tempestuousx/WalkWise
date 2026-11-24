import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Bookmark, CalendarDays, MapPin, Phone, Mail, Star } from 'lucide-react';
import { ExampleTag, VerifiedBadges } from '@/components/badges';
import { Avatar, Button, ErrorState, PageLoading } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAction, useCategories } from '@/lib/queries';
import { api } from '@/data';
import { areaForZip } from '@/domain/market';
import { formatDate, timeAgo } from '@/domain/format';

const DAY_LABEL: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

export default function ContractorProfilePage() {
  const { id } = useParams();
  const { session } = useAuth();
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ['contractor', id, session?.user.id], queryFn: () => api.getContractor(id!) });
  const cats = useCategories();
  const save = useAction(() => api.toggleSaveContractor(id!), { success: (on) => (on ? 'Saved to your contractors' : 'Removed from saved contractors') });
  if (q.isLoading) return <PageLoading />;
  if (q.isError || !q.data) return <div className="container-page pt-10"><ErrorState error={q.error} /></div>;
  const c = q.data;
  const area = areaForZip(c.home_zip);

  return (
    <div className="container-page pt-6 sm:pt-8">
      <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-ink-muted hover:text-navy">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back
      </button>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <div className="flex items-start gap-5">
            <Avatar name={c.display_name} src={c.avatar_url} size={72} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-h1">{c.display_name}</h1>
                {c.is_demo && <ExampleTag />}
              </div>
              {c.business_name && <p className="text-[15px] font-medium text-ink">{c.business_name}</p>}
              {c.headline && <p className="mt-1 text-[15px] text-ink-muted">{c.headline}</p>}
              <div className="mt-3">
                <VerifiedBadges kinds={c.badges} />
              </div>
            </div>
          </div>

          {c.bio && <p className="mt-8 max-w-2xl whitespace-pre-line text-[15.5px] leading-relaxed text-ink">{c.bio}</p>}

          <section className="mt-10">
            <h2 className="mb-3 text-[17px]">Services</h2>
            <ul className="flex flex-wrap gap-2">
              {c.category_ids.map((cid) => (
                <li key={cid} className="tag h-8 bg-canvas-alt px-3 text-[13px] text-ink">
                  {cats.data?.find((x) => x.id === cid)?.name ?? cid}
                </li>
              ))}
            </ul>
          </section>

          {c.portfolio.length > 0 && (
            <section className="mt-10">
              <h2 className="mb-3 text-[17px]">Work photos</h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {c.portfolio.map((p) => (
                  <li key={p.id}>
                    <figure>
                      <img src={p.url} alt={p.caption ?? 'Work photo'} className="aspect-[4/3] w-full rounded-ctl border border-line object-cover" />
                      {p.caption && <figcaption className="mt-1.5 text-[13px] text-ink-muted">{p.caption}</figcaption>}
                    </figure>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="mt-10">
            <h2 className="mb-3 text-[17px]">
              Reviews {c.rating !== null && <span className="ml-1 font-medium text-ink-muted">{c.rating.toFixed(1)} average from {c.review_count}</span>}
            </h2>
            {c.reviews.length === 0 ? (
              <p className="text-[14.5px] text-ink-muted">No reviews yet. Businesses can leave a review after a job is marked completed.</p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {c.reviews.map((r) => (
                  <li key={r.id} className="py-4">
                    <div className="flex items-center gap-1" aria-label={`${r.rating} out of 5`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={n <= r.rating ? 'h-4 w-4 fill-amber text-amber' : 'h-4 w-4 text-line-strong'} aria-hidden />
                      ))}
                    </div>
                    {r.body && <p className="mt-2 text-[15px] text-ink">{r.body}</p>}
                    <p className="mt-1.5 text-[13px] text-ink-muted">
                      {r.reviewer_name}
                      {r.job_title && ` · ${r.job_title}`} · {timeAgo(r.created_at)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-card border border-line bg-white p-5">
            <dl className="space-y-4 text-[14px]">
              <div className="flex gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <div>
                  <dt className="sr-only">Service area</dt>
                  <dd>
                    {area ? `${area.neighborhood}, ${area.city}` : 'Las Vegas valley'}
                    <span className="block text-ink-muted">Travels up to {c.service_radius_miles} miles</span>
                  </dd>
                </div>
              </div>
              <div className="flex gap-3">
                <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" aria-hidden />
                <div>
                  <dt className="sr-only">Availability</dt>
                  <dd>
                    {c.availability.accepting_work ? (c.availability.days.length ? c.availability.days.map((d) => DAY_LABEL[d]).join(', ') : 'Any day') : 'Not taking new work right now'}
                    {c.availability.same_day_ok && <span className="block text-ink-muted">Takes same-day jobs</span>}
                    {c.availability.note && <span className="block text-ink-muted">{c.availability.note}</span>}
                  </dd>
                </div>
              </div>
            </dl>
            <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[13.5px]">
              <div>
                <dt className="text-ink-muted">Experience</dt>
                <dd className="font-semibold text-navy">{c.years_experience !== null ? `${c.years_experience} years` : 'Not listed'}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Completed here</dt>
                <dd className="font-semibold text-navy tabular">{c.completed_jobs}</dd>
              </div>
            </dl>
            {c.contact ? (
              <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-[14px]">
                {c.contact.phone && (
                  <a href={`tel:${c.contact.phone}`} className="flex items-center gap-2 text-ink hover:text-teal-700">
                    <Phone className="h-4 w-4 text-ink-muted" aria-hidden /> {c.contact.phone}
                  </a>
                )}
                {c.contact.email && (
                  <a href={`mailto:${c.contact.email}`} className="flex items-center gap-2 break-all text-ink hover:text-teal-700">
                    <Mail className="h-4 w-4 text-ink-muted" aria-hidden /> {c.contact.email}
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-5 border-t border-line pt-4 text-[13px] text-ink-muted">Contact details are shared with businesses this contractor applies to.</p>
            )}
            {session?.user.role === 'employer' && (
              <Button variant="secondary" className="mt-5 w-full" loading={save.isPending} onClick={() => save.mutate(undefined)}>
                <Bookmark className="h-4 w-4" aria-hidden /> Save contractor
              </Button>
            )}
          </div>

          <div className="rounded-card border border-line bg-white p-5 text-[14px]">
            <h2 className="text-[14px] font-semibold">Credentials</h2>
            <p className="mt-1 text-[12.5px] text-ink-muted">Self-reported unless shown as verified above.</p>
            <ul className="mt-3 space-y-2">
              <li>{c.insurance_self_reported ? 'Carries liability insurance' : 'No insurance listed'}</li>
              {c.licenses.map((l) => (
                <li key={l.id}>
                  {l.license_type || 'License'} {l.license_number && <span className="text-ink-muted">#{l.license_number}</span>}
                  {l.expires_on && <span className="block text-[12.5px] text-ink-muted">Expires {formatDate(l.expires_on)}</span>}
                </li>
              ))}
              {c.certifications.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <p className="px-1 text-[12.5px] text-ink-muted">
            On Turnlist since {new Date(c.member_since).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.{' '}
            <Link to="/legal/moderation" className="link">
              What badges mean
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
