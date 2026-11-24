import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bookmark, Check, MapPin, MessageSquare, Star } from 'lucide-react';
import { AppStatusTag, VerifiedBadges } from '@/components/badges';
import { Avatar, Button, Dialog } from '@/components/ui';
import { useAction } from '@/lib/queries';
import { api, type ApplicationWithContractor } from '@/data';
import { zipDistance } from '@/domain/market';
import { formatDate, timeAgo } from '@/domain/format';

/** One applicant with everything needed to decide, and the decision buttons. */
export function ApplicantCard({ item, jobOpen, hasAddress, showJob }: { item: ApplicationWithContractor; jobOpen: boolean; hasAddress: boolean; showJob?: boolean }) {
  const { application: a, contractor: c, job } = item;
  const navigate = useNavigate();
  const [confirmSelect, setConfirmSelect] = useState(false);
  const dist = zipDistance(c.home_zip, job.zip);
  const setStatus = useAction((s: 'shortlisted' | 'not_selected' | 'viewed') => api.setApplicationStatus(a.id, s), { success: (r) => (r.status === 'shortlisted' ? `${c.display_name} shortlisted` : r.status === 'not_selected' ? 'Marked not selected' : '') });
  const select = useAction(() => api.selectApplication(a.id), { success: `${c.display_name} selected. The job is now filled.`, onSuccess: () => setConfirmSelect(false) });
  const share = useAction(() => api.shareAddress(job.id, c.id), { success: `Address shared with ${c.display_name}` });
  const save = useAction(() => api.toggleSaveContractor(c.id), { success: (on) => (on ? 'Saved to your contractors' : 'Removed from saved contractors') });
  const message = useAction(() => api.startConversation(c.id, job.id), { onSuccess: (id) => navigate(`/messages/${id}`) });
  const decided = a.status === 'selected' || a.status === 'not_selected';

  return (
    <article className="rounded-card border border-line bg-white p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <Avatar name={c.display_name} src={c.avatar_url} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to={`/contractors/${c.id}`} className="text-[16px] font-semibold text-navy hover:text-teal-700">
              {c.display_name}
            </Link>
            <AppStatusTag status={a.status} />
            {a.is_qualified ? (
              <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-teal-700">
                <Check className="h-3.5 w-3.5" aria-hidden /> Matches services and area
              </span>
            ) : (
              <span className="text-[12.5px] font-medium text-ink-muted">Outside listed services or area</span>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13.5px] text-ink-muted">
            {c.business_name && <span>{c.business_name}</span>}
            {dist !== null && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {Math.round(dist)} mi away
              </span>
            )}
            {c.years_experience !== null && <span>{c.years_experience} yrs experience</span>}
            {c.rating !== null && (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber text-amber" aria-hidden />
                {c.rating.toFixed(1)} ({c.review_count})
              </span>
            )}
            {c.completed_jobs > 0 && <span>{c.completed_jobs} completed on Turnlist</span>}
          </p>
          {c.badges.length > 0 && (
            <div className="mt-2">
              <VerifiedBadges kinds={c.badges} />
            </div>
          )}
          {showJob && (
            <p className="mt-2 text-[13.5px]">
              Applied to{' '}
              <Link to={`/employer/listings/${job.id}`} className="link">
                {job.title}
              </Link>
            </p>
          )}
          <blockquote className="mt-3 whitespace-pre-line border-l-2 border-line pl-3 text-[14.5px] leading-relaxed text-ink">{a.message}</blockquote>
          <p className="mt-2 text-[13px] text-ink-muted">
            {timeAgo(a.created_at)}
            {a.proposed_rate !== null && ` · Proposed $${a.proposed_rate}`}
            {a.available_on && ` · Can start ${formatDate(a.available_on)}`}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        {jobOpen && !decided && (
          <>
            <Button size="sm" onClick={() => setConfirmSelect(true)}>
              Select
            </Button>
            {a.status !== 'shortlisted' && (
              <Button size="sm" variant="secondary" loading={setStatus.isPending} onClick={() => setStatus.mutate('shortlisted')}>
                Shortlist
              </Button>
            )}
            <Button size="sm" variant="ghost" loading={setStatus.isPending} onClick={() => setStatus.mutate('not_selected')}>
              Not selected
            </Button>
          </>
        )}
        {jobOpen && a.status === 'not_selected' && (
          <Button size="sm" variant="ghost" onClick={() => setStatus.mutate('shortlisted')}>
            Reconsider
          </Button>
        )}
        <Button size="sm" variant="secondary" loading={message.isPending} onClick={() => message.mutate(undefined)}>
          <MessageSquare className="h-4 w-4" aria-hidden /> Message
        </Button>
        {hasAddress && a.status !== 'not_selected' && (
          <Button size="sm" variant="ghost" loading={share.isPending} onClick={() => share.mutate(undefined)}>
            Share address
          </Button>
        )}
        <Button size="sm" variant="ghost" loading={save.isPending} onClick={() => save.mutate(undefined)} className="sm:ml-auto">
          <Bookmark className="h-4 w-4" aria-hidden /> Save contractor
        </Button>
      </div>

      <Dialog
        open={confirmSelect}
        onClose={() => setConfirmSelect(false)}
        title={`Select ${c.display_name}?`}
        description="The job will be marked filled. You both get a confirmation, and other applicants are told the job is filled."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmSelect(false)}>
              Not yet
            </Button>
            <Button loading={select.isPending} onClick={() => select.mutate(undefined)}>
              Select and fill job
            </Button>
          </>
        }
      >
        <p className="text-[14.5px] text-ink">
          Next, agree on timing and payment in Messages{hasAddress ? ' and share the address when you are ready' : ''}. Turnlist does not handle payment.
        </p>
      </Dialog>
    </article>
  );
}
