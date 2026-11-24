import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button, ErrorState, Field, Input, Notice, PageHeader, PageLoading, Select, Textarea } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useAction, useMyAccount } from '@/lib/queries';
import { api } from '@/data';
import { businessProfileSchema, fieldErrors } from '@/domain/validation';
import type { BusinessType } from '@/domain/types';

const TYPES: Array<[BusinessType, string]> = [
  ['property_manager', 'Property management company'],
  ['landlord', 'Landlord or owner'],
  ['investor', 'Real estate investor'],
  ['maintenance_company', 'Maintenance company'],
  ['other', 'Other'],
];

export default function BusinessProfile() {
  const account = useMyAccount();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ company_name: '', business_type: 'property_manager' as BusinessType, phone: '', website: '', about: '', zip: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction((input: Parameters<typeof api.saveBusinessProfile>[0]) => api.saveBusinessProfile(input), {
    success: 'Business profile saved',
    onSuccess: () => navigate(params.get('next') ?? (params.get('welcome') ? '/employer/post' : '/employer')),
  });

  useEffect(() => {
    const b = account.data?.business;
    if (b) setForm({ company_name: b.company_name, business_type: b.business_type, phone: b.phone ?? '', website: b.website ?? '', about: b.about ?? '', zip: b.zip ?? '' });
  }, [account.data]);

  if (account.isLoading) return <PageLoading />;
  if (account.isError) return <Page><ErrorState error={account.error} /></Page>;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const n = (s: string) => s.trim() || null;
    const parsed = businessProfileSchema.safeParse({ ...form, phone: n(form.phone), website: n(form.website), about: n(form.about), zip: n(form.zip) });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    save.mutate(parsed.data);
  };

  return (
    <Page narrow>
      <PageHeader title={params.get('welcome') ? 'Welcome. Tell contractors who you are.' : 'Business profile'} description="Your business name and type appear on every listing. Your phone number is shared only with contractors you select." />
      {params.get('welcome') && (
        <div className="mb-8">
          <Notice tone="info">Your first listings are reviewed by our team before going live, usually within a few hours. After that, listings publish instantly.</Notice>
        </div>
      )}
      <form onSubmit={submit} className="space-y-6" noValidate>
        <Field label="Business name" error={errors.company_name}>
          {(a) => <Input {...a} value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} autoComplete="organization" />}
        </Field>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Type of business">
            {(a) => (
              <Select {...a} value={form.business_type} onChange={(e) => setForm({ ...form, business_type: e.target.value as BusinessType })}>
                {TYPES.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Main ZIP code" optional hint="Used as the default for new listings." error={errors.zip}>
            {(a) => <Input {...a} inputMode="numeric" maxLength={5} value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value.replace(/\D/g, '') })} />}
          </Field>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          <Field label="Phone" optional hint="Private until you select a contractor." error={errors.phone}>
            {(a) => <Input {...a} type="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />}
          </Field>
          <Field label="Website" optional error={errors.website}>
            {(a) => <Input {...a} type="url" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />}
          </Field>
        </div>
        <Field label="About" optional hint="Portfolio size, areas you cover, how you like to work with contractors." error={errors.about}>
          {(a) => <Textarea {...a} rows={4} value={form.about} onChange={(e) => setForm({ ...form, about: e.target.value })} maxLength={1000} />}
        </Field>
        <div className="flex justify-end gap-2 border-t border-line pt-6">
          <Button type="submit" loading={save.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Page>
  );
}
