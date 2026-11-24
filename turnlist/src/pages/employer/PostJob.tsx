import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ImagePlus, Lock, X } from 'lucide-react';
import { JobCard } from '@/components/JobCard';
import { Button, Checkbox, ErrorState, Field, Input, Notice, PageLoading, Segmented, Select, Textarea, cx } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAction, useCategories, useJob, useMyAccount, useMyJobs } from '@/lib/queries';
import { useToast } from '@/lib/toast';
import { api } from '@/data';
import { CATEGORY_FAMILIES } from '@/domain/categories';
import { areaForZip, DEFAULT_MARKET_ID } from '@/domain/market';
import { addDays, PROPERTY_TYPE_LABEL, toDayString } from '@/domain/format';
import { URGENCY_LABEL } from '@/domain/status';
import { defaultExpiry } from '@/domain/jobs';
import { fieldErrors, jobInputSchema, type JobInput } from '@/domain/validation';
import type { Job, PropertyType, Urgency } from '@/domain/types';

type FormState = {
  [K in keyof JobInput]: JobInput[K] extends number | null ? string : null extends JobInput[K] ? string : JobInput[K];
};

const blank = (): FormState => ({
  title: '',
  category_id: '',
  description: '',
  zip: '',
  property_type: 'apartment',
  job_date: toDayString(addDays(new Date(), 1)),
  deadline: '',
  duration_hours: '',
  pay_type: 'fixed',
  pay_min: '',
  pay_max: '',
  experience_required: '',
  license_required: false,
  insurance_required: false,
  materials: 'provided',
  urgency: 'within_7_days',
  is_recurring: false,
  recurrence_note: '',
  photos: [],
  street_address: '',
  unit: '',
  access_notes: '',
});

function fromJob(j: Job, keepDate: boolean, priv?: { street_address: string; unit: string | null; access_notes: string | null } | null): FormState {
  const today = toDayString(new Date());
  return {
    title: j.title,
    category_id: j.category_id,
    description: j.description,
    zip: j.zip,
    property_type: j.property_type,
    job_date: keepDate && j.job_date >= today ? j.job_date : toDayString(addDays(new Date(), 1)),
    deadline: keepDate && j.deadline && j.deadline >= today ? j.deadline : '',
    duration_hours: j.duration_hours?.toString() ?? '',
    pay_type: j.pay_type,
    pay_min: String(j.pay_min),
    pay_max: j.pay_max?.toString() ?? '',
    experience_required: j.experience_required ?? '',
    license_required: j.license_required,
    insurance_required: j.insurance_required,
    materials: j.materials,
    urgency: j.urgency,
    is_recurring: j.is_recurring,
    recurrence_note: j.recurrence_note ?? '',
    photos: j.photos,
    street_address: priv?.street_address ?? '',
    unit: priv?.unit ?? '',
    access_notes: priv?.access_notes ?? '',
  };
}

function toInput(f: FormState): unknown {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const str = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    ...f,
    deadline: str(f.deadline),
    duration_hours: num(f.duration_hours),
    pay_min: f.pay_min.trim() === '' ? NaN : Number(f.pay_min),
    pay_max: num(f.pay_max),
    experience_required: str(f.experience_required),
    recurrence_note: str(f.recurrence_note),
    street_address: str(f.street_address),
    unit: str(f.unit),
    access_notes: str(f.access_notes),
  };
}

/** Post a Job and Edit listing share this form. Quick Post hides optional fields. */
export default function PostJob() {
  const { id: editId } = useParams();
  const [params] = useSearchParams();
  const fromId = params.get('from');
  const editing = Boolean(editId);
  const source = useJob(editId ?? fromId ?? undefined);
  const account = useMyAccount();
  const myJobs = useMyJobs();
  const cats = useCategories();
  const { session } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [mode, setMode] = useState<'quick' | 'full'>(editing ? 'full' : 'quick');
  const [form, setForm] = useState<FormState>(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Prefill when editing or duplicating.
  useEffect(() => {
    const d = source.data;
    if (!d || loadedFrom === d.job.id) return;
    setForm(fromJob(d.job, editing, d.privateDetails));
    setLoadedFrom(d.job.id);
    if (!editing) setMode('full');
  }, [source.data, editing, loadedFrom]);

  // New posts default to the business ZIP and last property type.
  useEffect(() => {
    if (editing || fromId || form.zip) return;
    const last = myJobs.data?.[0];
    const zip = last?.zip ?? account.data?.business?.zip ?? '';
    if (zip) setForm((f) => ({ ...f, zip, property_type: last?.property_type ?? f.property_type }));
  }, [account.data, myJobs.data, editing, fromId, form.zip]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k]: '' }));
  };

  const save = useAction((input: JobInput) => (editing ? api.updateJob(editId!, input) : api.createJob(input)), {
    onSuccess: (job) => {
      toast.success(editing ? 'Listing updated' : job.moderation_status === 'pending' ? 'Submitted. Your first listings are reviewed before they go live, usually within a few hours.' : 'Your job is live');
      navigate(`/employer/listings/${job.id}`);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = jobInputSchema.safeParse(toInput(form));
    if (!parsed.success) {
      const errs = fieldErrors(parsed.error);
      setErrors(errs);
      const quickFields = ['title', 'category_id', 'description', 'zip', 'job_date', 'pay_min', 'urgency', 'pay_type'];
      if (Object.keys(errs).some((k) => !quickFields.includes(k))) setMode('full');
      setTimeout(() => errorRef.current?.focus(), 0);
      return;
    }
    save.mutate(parsed.data);
  };

  const category = cats.data?.find((c) => c.id === form.category_id);
  const area = areaForZip(form.zip);
  const preview = useMemo<Job>(() => {
    const now = new Date().toISOString();
    return {
      id: 'preview',
      employer_id: session?.user.id ?? '',
      market_id: DEFAULT_MARKET_ID,
      title: form.title || 'Your job title',
      category_id: form.category_id,
      description: form.description || 'A short description of the work appears here.',
      neighborhood: area?.neighborhood ?? 'Neighborhood',
      zip: form.zip,
      property_type: form.property_type,
      job_date: form.job_date || toDayString(new Date()),
      deadline: form.deadline || null,
      duration_hours: form.duration_hours ? Number(form.duration_hours) : null,
      pay_type: form.pay_type,
      pay_min: Number(form.pay_min) || 0,
      pay_max: form.pay_max ? Number(form.pay_max) : null,
      experience_required: null,
      license_required: form.license_required,
      insurance_required: form.insurance_required,
      materials: form.materials,
      urgency: form.urgency,
      is_recurring: form.is_recurring,
      recurrence_note: null,
      photos: form.photos,
      status: 'open',
      moderation_status: 'approved',
      moderation_note: null,
      selected_application_id: null,
      application_count: 0,
      is_demo: false,
      created_at: now,
      updated_at: now,
      expires_at: defaultExpiry(form.job_date || toDayString(new Date()), null),
      filled_at: null,
      completed_at: null,
      canceled_at: null,
    };
  }, [form, area, session]);

  if (account.isLoading || ((editId || fromId) && source.isLoading)) return <PageLoading />;
  if (source.isError) return <div className="container-page pt-10"><ErrorState error={source.error} /></div>;
  if (!account.data?.business) {
    return (
      <div className="container-page max-w-xl pt-12">
        <h1 className="text-h1">Add your business first</h1>
        <p className="mt-3 text-ink-muted">Contractors see your business name on every listing. It takes a few seconds.</p>
        <Link to="/employer/profile?next=/employer/post" className="btn-primary mt-6">
          Add business details
        </Link>
      </div>
    );
  }
  if (editing && source.data && !source.data.isOwner) return <div className="container-page pt-10"><ErrorState error={new Error('You can only edit your own listings.')} /></div>;
  if (editing && source.data && !['open', 'expired'].includes(source.data.job.status)) {
    return (
      <div className="container-page max-w-xl pt-12">
        <Notice tone="info">This listing is {source.data.job.status.replace('_', ' ')} and can no longer be edited. Duplicate it to post similar work.</Notice>
        <Link to={`/employer/post?from=${editId}`} className="btn-primary mt-6">
          Duplicate listing
        </Link>
      </div>
    );
  }

  const errorCount = Object.values(errors).filter(Boolean).length;
  const quick = mode === 'quick';

  return (
    <div className="container-page pt-8 sm:pt-10">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-h1">{editing ? 'Edit listing' : 'Post a Job'}</h1>
          <p className="mt-2 text-[15px] text-ink-muted">{editing ? 'Changes are visible to contractors right away.' : fromId ? 'Copied from a previous listing. Check the date and pay.' : 'Six fields gets you posted. Add details any time.'}</p>
        </div>
        {!editing && (
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="w-full sm:w-64">
              <Segmented label="Form length" value={mode} onChange={setMode} options={[{ value: 'quick', label: 'Quick Post' }, { value: 'full', label: 'All details' }]} />
            </div>
          </div>
        )}
      </div>

      {!editing && !fromId && (myJobs.data?.length ?? 0) > 0 && (
        <div className="mb-8 flex flex-wrap items-center gap-2 rounded-card border border-line bg-canvas-alt px-4 py-3 text-[14px]">
          <span className="font-semibold text-navy">Repeat a previous job:</span>
          {myJobs.data!.slice(0, 4).map((j) => (
            <Link key={j.id} to={`/employer/post?from=${j.id}`} className="chip h-8 bg-white">
              {j.title}
            </Link>
          ))}
        </div>
      )}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={submit} noValidate className="min-w-0 space-y-10">
          {errorCount > 0 && (
            <div ref={errorRef} tabIndex={-1} role="alert" className="outline-none">
              <Notice tone="warn">Fix {errorCount === 1 ? 'the highlighted field' : `the ${errorCount} highlighted fields`} to continue.</Notice>
            </div>
          )}

          <FormSection title="The job">
            <Field label="Job title" hint="Be specific: “Move-out clean, 2-bed apartment” works better than “Cleaning needed”." error={errors.title}>
              {(a) => <Input {...a} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={90} autoFocus={!editing && !fromId} />}
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Category" error={errors.category_id}>
                {(a) => (
                  <Select {...a} value={form.category_id} onChange={(e) => set('category_id', e.target.value)}>
                    <option value="">Choose a category</option>
                    {Object.entries(CATEGORY_FAMILIES).map(([family, slugs]) => (
                      <optgroup key={family} label={family}>
                        {(cats.data ?? [])
                          .filter((c) => slugs.includes(c.slug))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                    {(cats.data ?? []).some((c) => !Object.values(CATEGORY_FAMILIES).flat().includes(c.slug)) && (
                      <optgroup label="More">
                        {(cats.data ?? [])
                          .filter((c) => !Object.values(CATEGORY_FAMILIES).flat().includes(c.slug))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </Select>
                )}
              </Field>
              <Field label="ZIP code" hint={area ? `${area.neighborhood}, ${area.city}. Only this general area is shown publicly.` : 'Las Vegas valley ZIP codes.'} error={errors.zip}>
                {(a) => <Input {...a} inputMode="numeric" maxLength={5} value={form.zip} onChange={(e) => set('zip', e.target.value.replace(/\D/g, ''))} />}
              </Field>
            </div>
            {category?.requires_license && <Notice tone="warn">{category.license_note} This listing will be marked “license required”.</Notice>}
            <Field label="Description" hint="Scope, size of the property, access, and anything unusual." error={errors.description}>
              {(a) => <Textarea {...a} rows={quick ? 4 : 6} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={4000} />}
            </Field>
          </FormSection>

          <FormSection title="Timing and pay">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Date needed" error={errors.job_date}>
                {(a) => <Input {...a} type="date" min={toDayString(new Date())} value={form.job_date} onChange={(e) => set('job_date', e.target.value)} />}
              </Field>
              <Field label="Urgency" error={errors.urgency}>
                {(a) => (
                  <Select {...a} value={form.urgency} onChange={(e) => set('urgency', e.target.value as Urgency)}>
                    {(Object.keys(URGENCY_LABEL) as Urgency[]).map((u) => (
                      <option key={u} value={u}>
                        {URGENCY_LABEL[u]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <div>
              <span className="label">Pay</span>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr_1fr]">
                <Segmented label="Pay type" value={form.pay_type} onChange={(v) => set('pay_type', v)} options={[{ value: 'fixed', label: 'Flat rate' }, { value: 'hourly', label: 'Hourly' }]} />
                <Field hideLabel label={form.pay_type === 'hourly' ? 'Hourly rate' : 'Amount'} error={errors.pay_min}>
                  {(a) => (
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted">$</span>
                      <Input {...a} type="number" inputMode="decimal" min={1} className="pl-7" placeholder={form.pay_type === 'hourly' ? 'Rate per hour' : 'Amount'} value={form.pay_min} onChange={(e) => set('pay_min', e.target.value)} />
                    </div>
                  )}
                </Field>
                {!quick && (
                  <Field hideLabel label="Up to (optional)" error={errors.pay_max}>
                    {(a) => (
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted">$</span>
                        <Input {...a} type="number" inputMode="decimal" min={1} className="pl-7" placeholder="Up to (optional)" value={form.pay_max} onChange={(e) => set('pay_max', e.target.value)} />
                      </div>
                    )}
                  </Field>
                )}
              </div>
            </div>
            {!quick && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Finish by" optional hint="Leave empty if the date needed is the only date." error={errors.deadline}>
                  {(a) => <Input {...a} type="date" min={form.job_date} value={form.deadline} onChange={(e) => set('deadline', e.target.value)} />}
                </Field>
                <Field label="Estimated hours" optional error={errors.duration_hours}>
                  {(a) => <Input {...a} type="number" inputMode="decimal" min={0.5} step={0.5} value={form.duration_hours} onChange={(e) => set('duration_hours', e.target.value)} />}
                </Field>
              </div>
            )}
          </FormSection>

          {!quick && (
            <>
              <FormSection title="Property and requirements">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Property type">
                    {(a) => (
                      <Select {...a} value={form.property_type} onChange={(e) => set('property_type', e.target.value as PropertyType)}>
                        {(Object.keys(PROPERTY_TYPE_LABEL) as PropertyType[]).map((p) => (
                          <option key={p} value={p}>
                            {PROPERTY_TYPE_LABEL[p]}
                          </option>
                        ))}
                      </Select>
                    )}
                  </Field>
                  <Field label="Materials">
                    {(a) => (
                      <Select {...a} value={form.materials} onChange={(e) => set('materials', e.target.value as FormState['materials'])}>
                        <option value="provided">We provide materials</option>
                        <option value="shared">We provide some materials</option>
                        <option value="contractor">Contractor brings materials</option>
                        <option value="none">No materials needed</option>
                      </Select>
                    )}
                  </Field>
                </div>
                <Field label="Experience needed" optional error={errors.experience_required}>
                  {(a) => <Input {...a} placeholder="For example: 2+ years of interior painting" value={form.experience_required} onChange={(e) => set('experience_required', e.target.value)} maxLength={300} />}
                </Field>
                <div className="space-y-3">
                  <Checkbox label="Contractor license required" description={category?.requires_license ? 'Always on for this category.' : undefined} checked={form.license_required || Boolean(category?.requires_license)} disabled={category?.requires_license} onChange={(v) => set('license_required', v)} />
                  <Checkbox label="Liability insurance required" checked={form.insurance_required} onChange={(v) => set('insurance_required', v)} />
                  <Checkbox label="This is recurring work" description="Ongoing turnovers, weekly service, or a standing arrangement." checked={form.is_recurring} onChange={(v) => set('is_recurring', v)} />
                </div>
                {form.is_recurring && (
                  <Field label="How often?" error={errors.recurrence_note}>
                    {(a) => <Input {...a} placeholder="For example: about 4 units a month" value={form.recurrence_note} onChange={(e) => set('recurrence_note', e.target.value)} maxLength={200} />}
                  </Field>
                )}
              </FormSection>

              <FormSection title="Photos" optional>
                <PhotoPicker photos={form.photos} onChange={(p) => set('photos', p)} error={errors.photos} />
              </FormSection>

              <FormSection title="Exact address" optional icon={<Lock className="h-4 w-4 text-ink-muted" aria-hidden />}>
                <p className="-mt-2 text-[14px] text-ink-muted">Private. Contractors see only the neighborhood until you choose to share the address with someone you select.</p>
                <div className="grid gap-5 sm:grid-cols-[1fr_140px]">
                  <Field label="Street address" error={errors.street_address}>
                    {(a) => <Input {...a} autoComplete="street-address" value={form.street_address} onChange={(e) => set('street_address', e.target.value)} />}
                  </Field>
                  <Field label="Unit" optional>
                    {(a) => <Input {...a} value={form.unit} onChange={(e) => set('unit', e.target.value)} />}
                  </Field>
                </div>
                <Field label="Access notes" optional hint="Lockbox, gate code, parking. Shared together with the address.">
                  {(a) => <Textarea {...a} rows={2} value={form.access_notes} onChange={(e) => set('access_notes', e.target.value)} maxLength={500} />}
                </Field>
              </FormSection>
            </>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            {quick ? (
              <button type="button" className="link text-[14px]" onClick={() => setMode('full')}>
                Add photos, address, and requirements
              </button>
            ) : (
              <span className="text-[13px] text-ink-muted">Listings close after the finish-by date, or the day after the date needed.</span>
            )}
            <div className="flex gap-2">
              <Link to={editing ? `/employer/listings/${editId}` : '/employer'} className="btn-ghost">
                Cancel
              </Link>
              <Button type="submit" loading={save.isPending}>
                {editing ? 'Save changes' : 'Post Job'}
              </Button>
            </div>
          </div>
        </form>

        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <p className="eyebrow mb-3">Preview</p>
            <div className="pointer-events-none" aria-hidden>
              <JobCard job={preview} category={category} />
            </div>
            <p className="mt-3 text-[13px] text-ink-muted">This is how contractors see your listing in search results.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function FormSection({ title, children, optional, icon }: { title: string; children: React.ReactNode; optional?: boolean; icon?: React.ReactNode }) {
  return (
    <fieldset className="space-y-5">
      <legend className="mb-4 flex items-center gap-2 text-[17px] font-semibold text-navy">
        {icon}
        {title}
        {optional && <span className="text-[13px] font-medium text-ink-muted">optional</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function PhotoPicker({ photos, onChange, error }: { photos: string[]; onChange: (p: string[]) => void; error?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const room = 6 - photos.length;
      const uploaded = await Promise.all(Array.from(files).slice(0, room).map((f) => api.upload('job-photos', f)));
      onChange([...photos, ...uploaded.map((u) => u.url)]);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
        {photos.map((src, i) => (
          <li key={src.slice(-40) + i} className="relative">
            <img src={src} alt={`Photo ${i + 1}`} className="aspect-square w-full rounded-ctl border border-line object-cover" />
            <button type="button" onClick={() => onChange(photos.filter((_, j) => j !== i))} className="absolute right-1.5 top-1.5 rounded-md bg-white/95 p-1 text-ink shadow-card hover:text-danger" aria-label={`Remove photo ${i + 1}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {photos.length < 6 && (
          <li>
            <label className={cx('flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-ctl border border-dashed border-line-strong text-[13px] font-medium text-ink-muted hover:border-teal hover:text-teal-700', busy && 'opacity-60')}>
              <ImagePlus className="h-5 w-5" aria-hidden />
              {busy ? 'Uploading' : 'Add photos'}
              <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" disabled={busy} onChange={(e) => add(e.target.files)} />
            </label>
          </li>
        )}
      </ul>
      <p className="hint">Up to 6 photos of the work area. Avoid house numbers and personal items.</p>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
