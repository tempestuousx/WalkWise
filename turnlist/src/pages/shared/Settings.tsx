import { useEffect, useState } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { FileText, ShieldCheck } from 'lucide-react';
import { Button, Dialog, ErrorState, Field, Input, Notice, PageLoading, Select, Textarea, cx } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useAuth } from '@/lib/auth';
import { useAction, useMyAccount } from '@/lib/queries';
import { api, isDemo } from '@/data';
import { NOTIFICATION_TYPES } from '@/domain/notifications';
import { BADGE_LABEL } from '@/domain/profile';
import { formatDate, timeAgo } from '@/domain/format';
import type { NotificationPreferences, VerificationKind } from '@/domain/types';

export default function Settings() {
  const { tab = 'notifications' } = useParams();
  const tabs = [
    ['notifications', 'Notifications'],
    ['verification', 'Verification'],
    ['account', 'Account'],
  ];
  return (
    <Page>
      <h1 className="mb-8 text-h1">Settings</h1>
      <div className="grid gap-10 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Settings" className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
          {tabs.map(([k, l]) => (
            <NavLink key={k} to={`/settings/${k}`} className={() => cx('whitespace-nowrap rounded-lg px-3 py-2 text-[14px] font-medium', tab === k ? 'bg-canvas-alt text-navy' : 'text-ink-muted hover:text-navy')}>
              {l}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0 max-w-3xl">{tab === 'verification' ? <VerificationTab /> : tab === 'account' ? <AccountTab /> : <NotificationsTab />}</div>
      </div>
    </Page>
  );
}

function NotificationsTab() {
  const account = useMyAccount();
  const role = useAuth().session?.user.role;
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const save = useAction((p: NotificationPreferences) => api.savePreferences(p), { success: 'Notification settings saved' });
  useEffect(() => {
    if (account.data && !prefs) setPrefs(account.data.preferences);
  }, [account.data, prefs]);
  if (account.isLoading || !prefs) return <PageLoading />;
  const rows = NOTIFICATION_TYPES.filter((t) => t.audience === 'all' || t.audience === role);
  const toggle = (type: keyof NotificationPreferences, ch: 'in_app' | 'email') => setPrefs({ ...prefs, [type]: { ...prefs[type], [ch]: !prefs[type][ch] } });
  return (
    <section>
      <h2 className="text-[19px]">Notifications</h2>
      <p className="mt-1 text-[14px] text-ink-muted">Choose how you hear about each update. Email goes to {account.data?.profile.email}.</p>
      <div className="mt-6 overflow-x-auto rounded-card border border-line bg-white">
        <table className="table min-w-[520px]">
          <thead>
            <tr>
              <th scope="col">Update</th>
              <th scope="col" className="w-24 text-center">In app</th>
              <th scope="col" className="w-24 text-center">Email</th>
              <th scope="col" className="w-24 text-center">
                Text <span className="block text-[11px] font-medium">coming later</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.type}>
                <td className="text-[14px]">{r.label}</td>
                {(['in_app', 'email'] as const).map((ch) => (
                  <td key={ch} className="text-center">
                    <input type="checkbox" className="h-[18px] w-[18px] cursor-pointer accent-teal-700" checked={prefs[r.type][ch]} onChange={() => toggle(r.type, ch)} aria-label={`${r.label}: ${ch === 'in_app' ? 'in app' : 'email'}`} />
                  </td>
                ))}
                <td className="text-center">
                  <input type="checkbox" disabled className="h-[18px] w-[18px]" aria-label={`${r.label}: text message, not available yet`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {isDemo && <p className="mt-3 text-[13px] text-ink-muted">Demo mode: emails are queued but not sent.</p>}
      <div className="mt-6 flex justify-end">
        <Button loading={save.isPending} onClick={() => save.mutate(prefs)}>
          Save
        </Button>
      </div>
    </section>
  );
}

const KIND_HELP: Record<VerificationKind, string> = {
  license: 'Upload your license card or certificate. We check it against the Nevada State Contractors Board lookup.',
  insurance: 'Upload a current certificate of insurance (COI) showing general liability coverage and the expiry date.',
  business: 'Upload a Nevada business license or state business registration.',
  identity: 'Upload a government-issued photo ID. It is viewed only by our review team and never shown publicly.',
};

function VerificationTab() {
  const role = useAuth().session?.user.role;
  const q = useQuery({ queryKey: ['verifications', role], queryFn: () => api.listMyVerifications() });
  const [open, setOpen] = useState(false);
  const kinds: VerificationKind[] = role === 'employer' ? ['business', 'identity'] : ['license', 'insurance', 'identity', 'business'];
  return (
    <section>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-[19px]">Verification</h2>
          <p className="mt-1 max-w-xl text-[14px] text-ink-muted">Badges appear on your profile only after our team reviews a document. Documents are stored privately and are never shown to other users.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <ShieldCheck className="h-4 w-4" aria-hidden /> Request verification
        </Button>
      </div>
      <div className="mt-6">
        {q.isLoading ? (
          <PageLoading />
        ) : q.isError ? (
          <ErrorState error={q.error} />
        ) : !q.data?.length ? (
          <p className="rounded-card border border-line bg-white px-5 py-6 text-[14.5px] text-ink-muted">No requests yet.</p>
        ) : (
          <ul className="divide-y divide-line rounded-card border border-line bg-white">
            {q.data.map((v) => (
              <li key={v.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-navy">{BADGE_LABEL[v.kind]}</p>
                  <p className="text-[13.5px] text-ink-muted">
                    {v.document_name && (
                      <span className="inline-flex items-center gap-1">
                        <FileText className="h-3.5 w-3.5" aria-hidden />
                        {v.document_name} ·{' '}
                      </span>
                    )}
                    Submitted {timeAgo(v.created_at)}
                    {v.expires_on && ` · valid until ${formatDate(v.expires_on)}`}
                  </p>
                  {v.reviewer_note && <p className="mt-1 text-[13.5px] text-ink">Reviewer: {v.reviewer_note}</p>}
                </div>
                <span className={cx('tag', v.status === 'approved' ? 'bg-teal-50 text-teal-700' : v.status === 'pending' ? 'bg-amber-50 text-amber-800' : 'bg-canvas-alt text-ink-muted')}>
                  {v.status === 'pending' ? 'In review' : v.status[0].toUpperCase() + v.status.slice(1)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <RequestDialog open={open} onClose={() => setOpen(false)} kinds={kinds} />
    </section>
  );
}

function RequestDialog({ open, onClose, kinds }: { open: boolean; onClose: () => void; kinds: VerificationKind[] }) {
  const [kind, setKind] = useState<VerificationKind>(kinds[0]);
  const [file, setFile] = useState<File | null>(null);
  const [details, setDetails] = useState('');
  const submit = useAction(() => api.submitVerification({ kind, file, details }), {
    success: 'Submitted. Reviews usually take one to two business days.',
    onSuccess: () => {
      setFile(null);
      setDetails('');
      onClose();
    },
  });
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Request verification"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={submit.isPending} onClick={() => submit.mutate(undefined)}>
            Submit for review
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="What should we verify?">
          {(a) => (
            <Select {...a} value={kind} onChange={(e) => setKind(e.target.value as VerificationKind)}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {BADGE_LABEL[k].replace(' verified', '')}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p className="text-[14px] text-ink-muted">{KIND_HELP[kind]}</p>
        <Field label="Document" hint="PDF, JPG, or PNG under 10 MB.">
          {(a) => <Input {...a} type="file" accept="application/pdf,image/jpeg,image/png" className="py-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
        <Field label="Details" optional hint="License number, insurer and policy number, or anything that helps the review.">
          {(a) => <Textarea {...a} rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} />}
        </Field>
        {isDemo && <Notice tone="info">Demo mode never stores uploaded documents. Only the file name is kept.</Notice>}
      </div>
    </Dialog>
  );
}

function AccountTab() {
  const account = useMyAccount();
  const [name, setName] = useState('');
  const save = useAction(() => api.updateMyProfile({ display_name: name }), { success: 'Name updated' });
  useEffect(() => {
    if (account.data) setName(account.data.profile.display_name);
  }, [account.data]);
  if (account.isLoading) return <PageLoading />;
  const p = account.data!.profile;
  return (
    <section className="space-y-6">
      <h2 className="text-[19px]">Account</h2>
      <Field label="Display name">{(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label="Email" hint="Contact support to change the email on your account.">{(a) => <Input {...a} value={p.email} disabled />}</Field>
      <dl className="grid grid-cols-2 gap-4 text-[14px]">
        <div>
          <dt className="text-ink-muted">Account type</dt>
          <dd className="font-semibold text-navy">{p.role === 'employer' ? 'Business' : p.role === 'contractor' ? 'Contractor' : 'Administrator'}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Member since</dt>
          <dd className="font-semibold text-navy">{new Date(p.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</dd>
        </div>
      </dl>
      <div className="flex justify-end border-t border-line pt-6">
        <Button loading={save.isPending} onClick={() => save.mutate(undefined)} disabled={name.trim() === p.display_name}>
          Save
        </Button>
      </div>
    </section>
  );
}
