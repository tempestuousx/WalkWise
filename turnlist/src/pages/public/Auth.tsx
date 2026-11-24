import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Building2, MailCheck } from 'lucide-react';
import { Button, Checkbox, Field, Input, Notice, cx } from '@/components/ui';
import { api, demoApi, isDemo } from '@/data';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/data/demoSeed';
import { homeFor } from '@/lib/auth';
import { fieldErrors, signUpSchema } from '@/domain/validation';

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="container-page flex justify-center pt-12 sm:pt-20">
      <div className="w-full max-w-[440px]">
        <h1 className="text-h1">{title}</h1>
        <p className="mt-2 text-[15px] text-ink-muted">{subtitle}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : null);

export function SignIn() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) return setError('Enter your email and password.');
    setBusy(true);
    setError(null);
    try {
      const s = await api.signIn(email, password);
      navigate(next ?? homeFor(s.user.role), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame
      title="Log in"
      subtitle={
        <>
          New to Turnlist?{' '}
          <Link to="/signup" className="link">
            Create an account
          </Link>
        </>
      }
    >
      {isDemo && demoApi && (
        <div className="mb-8 rounded-card border border-line bg-canvas-alt p-4">
          <p className="text-[14px] font-semibold text-navy">Explore the demo</p>
          <p className="mt-1 text-[13.5px] text-ink-muted">Sign in as an example account. Password for all of them: {DEMO_PASSWORD}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.id}
                className="btn-secondary btn-sm h-auto flex-col items-start gap-0 py-2 text-left"
                onClick={async () => {
                  const s = await demoApi!.signInAs(a.id);
                  navigate(next ?? homeFor(s.user.role), { replace: true });
                }}
              >
                <span>{a.label}</span>
                <span className="text-[12px] font-medium text-ink-muted">{a.org ?? a.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={submit} className="space-y-5" noValidate>
        {error && (
          <div role="alert">
            <Notice tone="warn">{error}</Notice>
          </div>
        )}
        <Field label="Email">{(a) => <Input {...a} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Password">{(a) => <Input {...a} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <Button type="submit" className="w-full" loading={busy}>
          Log in
        </Button>
      </form>
    </AuthFrame>
  );
}

export function SignUp() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [role, setRole] = useState<'employer' | 'contractor' | null>((params.get('role') as 'employer' | 'contractor') ?? null);
  const [form, setForm] = useState({ display_name: '', email: '', password: '', accept_terms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = signUpSchema.safeParse({ ...form, role });
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setErrors({});
    setBusy(true);
    try {
      const res = await api.signUp(parsed.data);
      if ('confirmEmail' in res) setConfirm(true);
      else navigate(res.user.role === 'employer' ? '/employer/profile?welcome=1' : '/contractor/profile?welcome=1', { replace: true });
    } catch (err) {
      setErrors({ _: err instanceof Error ? err.message : 'Could not create your account.' });
    } finally {
      setBusy(false);
    }
  };

  if (confirm)
    return (
      <AuthFrame title="Check your email" subtitle={`We sent a confirmation link to ${form.email}. Open it to finish creating your account.`}>
        <MailCheck className="h-10 w-10 text-teal" aria-hidden />
      </AuthFrame>
    );

  return (
    <AuthFrame
      title="Create your account"
      subtitle={
        <>
          Already have one?{' '}
          <Link to="/signin" className="link">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-6" noValidate>
        <fieldset>
          <legend className="label">I want to</legend>
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup">
            {(
              [
                ['contractor', 'Find work', 'Independent contractors and crews', Briefcase],
                ['employer', 'Hire contractors', 'Property managers, landlords, investors', Building2],
              ] as const
            ).map(([v, title, sub, Icon]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={role === v}
                onClick={() => setRole(v)}
                className={cx('flex flex-col items-start gap-2 rounded-card border p-4 text-left transition-colors', role === v ? 'border-teal bg-teal-50' : 'border-line-strong bg-white hover:border-navy/30')}
              >
                <Icon className={cx('h-5 w-5', role === v ? 'text-teal-700' : 'text-ink-muted')} aria-hidden />
                <span className="font-semibold text-navy">{title}</span>
                <span className="text-[13px] leading-snug text-ink-muted">{sub}</span>
              </button>
            ))}
          </div>
          {errors.role && <p className="error-text">Choose how you will use Turnlist.</p>}
        </fieldset>
        {errors._ && <Notice tone="warn">{errors._}</Notice>}
        <Field label={role === 'employer' ? 'Your name' : 'Your name or business name'} error={errors.display_name}>
          {(a) => <Input {...a} autoComplete="name" value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} />}
        </Field>
        <Field label="Email" error={errors.email}>
          {(a) => <Input {...a} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />}
        </Field>
        <Field label="Password" hint="At least 8 characters." error={errors.password}>
          {(a) => <Input {...a} type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />}
        </Field>
        <div>
          <Checkbox
            checked={form.accept_terms}
            onChange={(v) => setForm({ ...form, accept_terms: v })}
            label={
              <>
                I agree to the{' '}
                <Link to="/legal/terms" className="link" target="_blank">
                  terms of use
                </Link>{' '}
                and understand Turnlist is a job board, not an employer.
              </>
            }
          />
          {errors.accept_terms && <p className="error-text">{errors.accept_terms}</p>}
        </div>
        <Button type="submit" className="w-full" loading={busy}>
          Create account
        </Button>
        {isDemo && <p className="text-center text-[12.5px] text-ink-muted">Demo mode: accounts are stored only in this browser.</p>}
      </form>
    </AuthFrame>
  );
}
