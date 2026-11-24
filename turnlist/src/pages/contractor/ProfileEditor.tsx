import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ExternalLink, ImagePlus, Plus, ShieldCheck, Trash2, X } from 'lucide-react';
import { Avatar, Button, Checkbox, ErrorState, Field, Input, Notice, PageLoading, Select, Textarea, cx } from '@/components/ui';
import { useAction, useCategories, useMyAccount } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { api } from '@/data';
import { CATEGORY_FAMILIES } from '@/domain/categories';
import { areaForZip } from '@/domain/market';
import { contractorCompletion } from '@/domain/profile';
import { contractorProfileSchema, fieldErrors } from '@/domain/validation';
import type { Availability, ContractorProfile, LicenseEntry, PortfolioItem } from '@/domain/types';

const DAYS: Array<[Availability['days'][number], string]> = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
type Draft = Omit<ContractorProfile, 'user_id' | 'updated_at' | 'years_experience'> & { years_experience: string };

const emptyDraft = (): Draft => ({
  business_name: '',
  headline: '',
  bio: '',
  years_experience: '',
  category_ids: [],
  home_zip: '',
  service_radius_miles: 15,
  availability: { accepting_work: true, days: ['mon', 'tue', 'wed', 'thu', 'fri'], same_day_ok: false, note: '' },
  insurance_self_reported: false,
  licenses: [],
  certifications: [],
  contact_phone: '',
  contact_email: '',
  portfolio: [],
});

export default function ProfileEditor() {
  const account = useMyAccount();
  const cats = useCategories();
  const toast = useToast();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cert, setCert] = useState('');
  const loaded = useRef(false);

  useEffect(() => {
    if (!account.data || loaded.current) return;
    loaded.current = true;
    const c = account.data.contractor;
    setName(account.data.profile.display_name);
    setAvatar(account.data.profile.avatar_url);
    if (c) setDraft({ ...c, years_experience: c.years_experience?.toString() ?? '', business_name: c.business_name ?? '', headline: c.headline ?? '', bio: c.bio ?? '', contact_phone: c.contact_phone ?? '', contact_email: c.contact_email ?? '', home_zip: c.home_zip ?? '', availability: { ...c.availability, note: c.availability.note ?? '' } });
    else setDraft((d) => ({ ...d, contact_email: account.data!.profile.email }));
  }, [account.data]);

  const save = useAction(
    async () => {
      const n = (s: string | null) => (s && s.trim() ? s.trim() : null);
      const parsed = contractorProfileSchema.safeParse({ ...draft, business_name: n(draft.business_name), headline: n(draft.headline), bio: n(draft.bio), years_experience: draft.years_experience === '' ? null : Number(draft.years_experience), contact_phone: n(draft.contact_phone), contact_email: n(draft.contact_email) ?? '' });
      if (!parsed.success) {
        setErrors(fieldErrors(parsed.error));
        throw new Error('Some fields need attention. They are highlighted below.');
      }
      setErrors({});
      if (name.trim() !== account.data?.profile.display_name || avatar !== account.data?.profile.avatar_url) await api.updateMyProfile({ display_name: name, avatar_url: avatar });
      return api.saveContractorProfile({ ...draft, ...parsed.data, availability: { ...draft.availability, note: n(draft.availability.note) }, licenses: draft.licenses, portfolio: draft.portfolio });
    },
    { success: 'Profile saved' },
  );

  if (account.isLoading || cats.isLoading) return <PageLoading />;
  if (account.isError) return <div className="container-page pt-10"><ErrorState error={account.error} /></div>;

  const completion = contractorCompletion({ ...draft, user_id: '', updated_at: '', years_experience: draft.years_experience === '' ? null : Number(draft.years_experience) }, avatar);
  const area = areaForZip(draft.home_zip);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setAvail = (patch: Partial<Availability>) => setDraft((d) => ({ ...d, availability: { ...d.availability, ...patch } }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(undefined);
  };
  const uploadTo = async (bucket: 'avatars' | 'portfolio', files: FileList | null) => {
    if (!files?.length) return [];
    try {
      return await Promise.all(Array.from(files).map((f) => api.upload(bucket, f)));
    } catch (e) {
      toast.error(e);
      return [];
    }
  };

  return (
    <div className="container-page pt-8 sm:pt-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-h1">{params.get('welcome') ? 'Set up your profile' : 'Profile'}</h1>
          <p className="mt-2 text-[15px] text-ink-muted">Businesses see this when you apply. Services and ZIP decide which jobs you are matched with.</p>
        </div>
        {account.data?.contractor && (
          <Link to={`/contractors/${account.data.profile.id}`} className="btn-secondary btn-sm">
            <ExternalLink className="h-4 w-4" aria-hidden /> View public profile
          </Link>
        )}
      </div>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form onSubmit={submit} noValidate className="min-w-0 space-y-12">
          <Section title="About you">
            <div className="flex items-center gap-4">
              <Avatar name={name || '?'} src={avatar} size={64} />
              <div className="flex flex-wrap gap-2">
                <label className="btn-secondary btn-sm cursor-pointer">
                  {avatar ? 'Change photo' : 'Add photo'}
                  <input type="file" accept="image/*" className="sr-only" onChange={async (e) => setAvatar((await uploadTo('avatars', e.target.files))[0]?.url ?? avatar)} />
                </label>
                {avatar && (
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setAvatar(null)}>
                    Remove
                  </button>
                )}
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Your name">{(a) => <Input {...a} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
              <Field label="Business name" optional>{(a) => <Input {...a} value={draft.business_name ?? ''} onChange={(e) => set('business_name', e.target.value)} />}</Field>
            </div>
            <Field label="Headline" hint="One line. For example: “Turnover cleaning and paint touch-ups, west side”." error={errors.headline}>
              {(a) => <Input {...a} value={draft.headline ?? ''} onChange={(e) => set('headline', e.target.value)} maxLength={120} />}
            </Field>
            <Field label="About your work" error={errors.bio}>
              {(a) => <Textarea {...a} rows={4} value={draft.bio ?? ''} onChange={(e) => set('bio', e.target.value)} maxLength={2000} placeholder="Experience, crew size, the kinds of properties you work on, and how quickly you can usually start." />}
            </Field>
          </Section>

          <Section title="Services" description="Choose everything you do. You will be matched with jobs in these categories.">
            {errors.category_ids && <p className="error-text">{errors.category_ids}</p>}
            {Object.entries(CATEGORY_FAMILIES).map(([family, slugs]) => (
              <fieldset key={family}>
                <legend className="mb-2.5 text-[13.5px] font-semibold text-ink-muted">{family}</legend>
                <div className="flex flex-wrap gap-2">
                  {(cats.data ?? [])
                    .filter((c) => slugs.includes(c.slug))
                    .map((c) => {
                      const on = draft.category_ids.includes(c.id);
                      return (
                        <button key={c.id} type="button" aria-pressed={on} className="chip" onClick={() => set('category_ids', on ? draft.category_ids.filter((x) => x !== c.id) : [...draft.category_ids, c.id])}>
                          {on && <Check className="h-3.5 w-3.5" aria-hidden />}
                          {c.name}
                          {c.requires_license && <ShieldCheck className="h-3.5 w-3.5 text-ink-muted" aria-label="License usually required" />}
                        </button>
                      );
                    })}
                </div>
              </fieldset>
            ))}
          </Section>

          <Section title="Service area">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Home ZIP code" hint={area ? `${area.neighborhood}, ${area.city}` : 'Distance to jobs is measured from here.'} error={errors.home_zip}>
                {(a) => <Input {...a} inputMode="numeric" maxLength={5} value={draft.home_zip ?? ''} onChange={(e) => set('home_zip', e.target.value.replace(/\D/g, ''))} />}
              </Field>
              <Field label="How far will you travel?">
                {(a) => (
                  <Select {...a} value={draft.service_radius_miles} onChange={(e) => set('service_radius_miles', Number(e.target.value))}>
                    {Array.from(new Set([5, 10, 15, 20, 25, 35, 50, draft.service_radius_miles])).sort((a, b) => a - b).map((m) => (
                      <option key={m} value={m}>
                        Up to {m} miles
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </Section>

          <Section title="Availability">
            <Checkbox label="I am accepting new work" description="Turn off to pause job alerts without hiding your profile." checked={draft.availability.accepting_work} onChange={(v) => setAvail({ accepting_work: v })} />
            <fieldset>
              <legend className="label">Days you usually work</legend>
              <div className="flex flex-wrap gap-2">
                {DAYS.map(([d, l]) => {
                  const on = draft.availability.days.includes(d);
                  return (
                    <button key={d} type="button" aria-pressed={on} className="chip w-14 justify-center" onClick={() => setAvail({ days: on ? draft.availability.days.filter((x) => x !== d) : [...draft.availability.days, d] })}>
                      {l}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <Checkbox label="I can take same-day jobs" checked={draft.availability.same_day_ok} onChange={(v) => setAvail({ same_day_ok: v })} />
            <Field label="Notes" optional>{(a) => <Input {...a} value={draft.availability.note ?? ''} onChange={(e) => setAvail({ note: e.target.value })} placeholder="For example: mornings only on weekends" />}</Field>
          </Section>

          <Section title="Experience and credentials" description="What you enter here is shown as self-reported. Request verification to earn a verified badge.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Years of experience" error={errors.years_experience}>
                {(a) => <Input {...a} type="number" min={0} max={70} value={draft.years_experience} onChange={(e) => set('years_experience', e.target.value)} />}
              </Field>
            </div>
            <Checkbox label="I carry general liability insurance" description="Self-reported. Upload a certificate in Settings to have it verified." checked={draft.insurance_self_reported} onChange={(v) => set('insurance_self_reported', v)} />
            <LicensesEditor licenses={draft.licenses} onChange={(l) => set('licenses', l)} />
            <div>
              <span className="label">Certifications</span>
              <div className="flex flex-wrap items-center gap-2">
                {draft.certifications.map((c) => (
                  <span key={c} className="chip h-8 gap-1 pr-1.5">
                    {c}
                    <button type="button" className="rounded p-0.5 text-ink-muted hover:text-danger" aria-label={`Remove ${c}`} onClick={() => set('certifications', draft.certifications.filter((x) => x !== c))}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input value={cert} onChange={(e) => setCert(e.target.value)} placeholder="For example: EPA Lead-Safe (RRP)" aria-label="Add a certification" onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    if (cert.trim()) set('certifications', [...new Set([...draft.certifications, cert.trim()])]);
                    setCert('');
                  }
                }} />
                <Button variant="secondary" onClick={() => { if (cert.trim()) set('certifications', [...new Set([...draft.certifications, cert.trim()])]); setCert(''); }}>
                  Add
                </Button>
              </div>
            </div>
          </Section>

          <Section title="Work photos" description="Before-and-after shots help businesses decide. Up to 12.">
            <PortfolioEditor items={draft.portfolio} onChange={(p) => set('portfolio', p)} upload={(f) => uploadTo('portfolio', f)} />
          </Section>

          <Section title="Contact details" description="Private. Shared only with businesses you apply to.">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Phone" optional>{(a) => <Input {...a} type="tel" autoComplete="tel" value={draft.contact_phone ?? ''} onChange={(e) => set('contact_phone', e.target.value)} />}</Field>
              <Field label="Email" optional error={errors.contact_email}>{(a) => <Input {...a} type="email" autoComplete="email" value={draft.contact_email ?? ''} onChange={(e) => set('contact_email', e.target.value)} />}</Field>
            </div>
          </Section>

          <div className="sticky bottom-16 z-10 -mx-4 flex items-center justify-between gap-3 border-t border-line bg-white/95 px-4 py-4 backdrop-blur md:bottom-0 sm:mx-0 sm:px-0">
            <span className="text-[13.5px] text-ink-muted">{Object.keys(errors).length ? 'Fix the highlighted fields to save.' : 'Changes are not saved until you press Save.'}</span>
            <Button type="submit" loading={save.isPending}>
              Save profile
            </Button>
          </div>
        </form>

        <aside className="order-first lg:order-none">
          <div className="rounded-card border border-line bg-white p-5 lg:sticky lg:top-24">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px]">Profile strength</h2>
              <span className="text-[14px] font-semibold text-navy tabular">{completion.percent}%</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-canvas-tint" role="progressbar" aria-valuenow={completion.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Profile completeness">
              <div className="h-full rounded-full bg-teal transition-[width]" style={{ width: `${completion.percent}%` }} />
            </div>
            <ul className="mt-4 space-y-2 text-[13.5px]">
              {completion.items.map((i) => (
                <li key={i.key} className={cx('flex items-center gap-2', i.done ? 'text-ink-muted line-through decoration-line-strong' : 'text-ink')}>
                  <span className={cx('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', i.done ? 'border-teal bg-teal text-white' : 'border-line-strong')}>{i.done && <Check className="h-2.5 w-2.5" aria-hidden />}</span>
                  {i.label}
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-line pt-4">
              <Link to="/settings/verification" className="link inline-flex items-center gap-1.5 text-[13.5px]">
                <ShieldCheck className="h-4 w-4" aria-hidden /> Request verification
              </Link>
            </div>
          </div>
          {params.get('welcome') && (
            <div className="mt-4">
              <Notice tone="info">Add your services and home ZIP first. That is all you need to start applying.</Notice>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-[18px]">{title}</h2>
        {description && <p className="mt-1 text-[14px] text-ink-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function LicensesEditor({ licenses, onChange }: { licenses: LicenseEntry[]; onChange: (l: LicenseEntry[]) => void }) {
  const update = (i: number, patch: Partial<LicenseEntry>) => onChange(licenses.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div>
      <span className="label">Licenses</span>
      {licenses.length === 0 && <p className="mb-3 text-[13.5px] text-ink-muted">Add any trade licenses you hold. Plumbing, electrical, and HVAC jobs require one.</p>}
      <ul className="space-y-3">
        {licenses.map((l, i) => (
          <li key={l.id} className="grid gap-3 rounded-ctl border border-line p-3 sm:grid-cols-[1.2fr_1fr_1fr_auto]">
            <Input aria-label="License type" placeholder="Type, e.g. C-1 Plumbing" value={l.license_type} onChange={(e) => update(i, { license_type: e.target.value })} />
            <Input aria-label="License number" placeholder="Number" value={l.license_number} onChange={(e) => update(i, { license_number: e.target.value })} />
            <Input aria-label="Expires" type="date" value={l.expires_on ?? ''} onChange={(e) => update(i, { expires_on: e.target.value || null })} />
            <button type="button" className="btn-ghost btn-sm" aria-label="Remove license" onClick={() => onChange(licenses.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => onChange([...licenses, { id: `lic_${Date.now()}`, license_type: '', license_number: '', issuer: 'Nevada State Contractors Board', expires_on: null }])}>
        <Plus className="h-4 w-4" aria-hidden /> Add license
      </Button>
    </div>
  );
}

function PortfolioEditor({ items, onChange, upload }: { items: PortfolioItem[]; onChange: (p: PortfolioItem[]) => void; upload: (f: FileList | null) => Promise<Array<{ url: string }>> }) {
  const [busy, setBusy] = useState(false);
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((p, i) => (
        <li key={p.id} className="overflow-hidden rounded-ctl border border-line bg-white">
          <div className="relative">
            <img src={p.url} alt={p.caption ?? `Work photo ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
            <button type="button" onClick={() => onChange(items.filter((x) => x.id !== p.id))} className="absolute right-1.5 top-1.5 rounded-md bg-white/95 p-1 shadow-card hover:text-danger" aria-label="Remove photo">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <input value={p.caption ?? ''} onChange={(e) => onChange(items.map((x) => (x.id === p.id ? { ...x, caption: e.target.value } : x)))} placeholder="Caption" aria-label={`Caption for photo ${i + 1}`} className="w-full border-t border-line px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-teal/30" />
        </li>
      ))}
      {items.length < 12 && (
        <li>
          <label className={cx('flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-ctl border border-dashed border-line-strong text-[13px] font-medium text-ink-muted hover:border-teal hover:text-teal-700', busy && 'opacity-60')}>
            <ImagePlus className="h-5 w-5" aria-hidden />
            {busy ? 'Uploading' : 'Add photos'}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              disabled={busy}
              onChange={async (e) => {
                setBusy(true);
                const up = await upload(e.target.files);
                onChange([...items, ...up.map((u, k) => ({ id: `pf_${Date.now()}_${k}`, url: u.url, caption: null }))].slice(0, 12));
                setBusy(false);
              }}
            />
          </label>
        </li>
      )}
    </ul>
  );
}
