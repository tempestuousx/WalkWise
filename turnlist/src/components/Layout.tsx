import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Bookmark, Briefcase, FileText, LayoutDashboard, LogOut, Menu, MessageSquare, Plus, Search, Settings, ShieldCheck, User, Users } from 'lucide-react';
import { api, demoApi, isDemo } from '@/data';
import { DEMO_ACCOUNTS } from '@/data/demoSeed';
import { homeFor, useAuth } from '@/lib/auth';
import { useConversations, useNotifications } from '@/lib/queries';
import { timeAgo } from '@/domain/format';
import type { Role } from '@/domain/types';
import { Avatar, Sheet, cx } from './ui';

interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: typeof Search;
  end?: boolean;
}

const PUBLIC_NAV: NavItem[] = [
  { to: '/jobs', label: 'Find Work', icon: Search },
  { to: '/categories', label: 'Browse Categories', icon: LayoutDashboard },
  { to: '/how-it-works', label: 'How It Works', icon: FileText },
];
const CONTRACTOR_NAV: NavItem[] = [
  { to: '/jobs', label: 'Find Work', short: 'Find Work', icon: Search },
  { to: '/contractor/saved', label: 'Saved Jobs', short: 'Saved', icon: Bookmark },
  { to: '/contractor/applications', label: 'My Applications', short: 'Applications', icon: Briefcase },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
  { to: '/contractor/profile', label: 'Profile', icon: User },
];
const EMPLOYER_NAV: NavItem[] = [
  { to: '/employer', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/employer/listings', label: 'My Listings', short: 'Listings', icon: FileText },
  { to: '/employer/applicants', label: 'Applicants', icon: Users },
  { to: '/employer/saved', label: 'Saved Contractors', short: 'Saved', icon: Bookmark },
  { to: '/messages', label: 'Messages', icon: MessageSquare },
];
const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/admin/listings', label: 'Listings', icon: FileText },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/verifications', label: 'Verification', icon: ShieldCheck },
  { to: '/admin/categories', label: 'Categories', icon: Briefcase },
];

export function navFor(role: Role | null): NavItem[] {
  if (role === 'contractor') return CONTRACTOR_NAV;
  if (role === 'employer') return EMPLOYER_NAV;
  if (role === 'admin') return ADMIN_NAV;
  return PUBLIC_NAV;
}

function Logo() {
  const role = useAuth().session?.user.role ?? null;
  return (
    <Link to={homeFor(role)} className="flex items-center gap-2 rounded-md text-navy" aria-label="Turnlist home">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#14294B" />
        <path d="M9 11h14M16 11v12" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
        <circle cx="23" cy="22" r="2.5" fill="#168A80" />
      </svg>
      <span className="text-[18px] font-bold tracking-[-0.02em]">Turnlist</span>
    </Link>
  );
}

function TopLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        cx('relative flex h-16 items-center px-1 text-[14px] font-medium transition-colors', isActive ? 'text-navy after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-teal' : 'text-ink-muted hover:text-navy')
      }
    >
      {item.label}
    </NavLink>
  );
}

function useUnreadMessages() {
  const { data } = useConversations();
  return data?.reduce((n, c) => n + c.unread, 0) ?? 0;
}

function NotificationMenu() {
  const { data } = useNotifications();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const unread = data?.filter((n) => !n.read_at).length ?? 0;
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} className="relative rounded-lg p-2.5 text-ink-muted transition-colors hover:bg-canvas-alt hover:text-navy">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-teal ring-2 ring-white" aria-hidden />}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-[min(92vw,380px)] overflow-hidden rounded-card border border-line bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-[15px]">Notifications</h2>
            <div className="flex gap-3 text-[13px]">
              {unread > 0 && (
                <button className="link" onClick={() => api.markNotificationsRead('all').then(() => navigate(0))}>
                  Mark all read
                </button>
              )}
              <Link to="/notifications" className="link" onClick={() => setOpen(false)}>
                View all
              </Link>
            </div>
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {!data?.length && <li className="px-4 py-8 text-center text-[14px] text-ink-muted">You are all caught up.</li>}
            {data?.slice(0, 8).map((n) => (
              <li key={n.id}>
                <button
                  className="flex w-full gap-3 border-b border-line px-4 py-3 text-left transition-colors last:border-0 hover:bg-canvas-alt"
                  onClick={async () => {
                    setOpen(false);
                    if (!n.read_at) await api.markNotificationsRead([n.id]);
                    if (n.link) navigate(n.link);
                  }}
                >
                  <span className={cx('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-teal')} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-semibold text-navy">{n.title}</span>
                    <span className="block truncate text-[13px] text-ink-muted">{n.body}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-muted">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  if (!session) return null;
  const u = session.user;
  const roleLabel = u.role === 'employer' ? 'Business' : u.role === 'contractor' ? 'Contractor' : 'Administrator';
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Account menu" className="flex items-center rounded-full p-1 hover:bg-canvas-alt">
        <Avatar name={u.display_name} src={u.avatar_url} size={32} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-60 overflow-hidden rounded-card border border-line bg-white py-1.5 shadow-lift">
          <div className="border-b border-line px-4 pb-3 pt-2">
            <p className="truncate text-[14px] font-semibold text-navy">{u.display_name}</p>
            <p className="text-[12.5px] text-ink-muted">{roleLabel}</p>
          </div>
          {u.role === 'contractor' && <MenuLink to="/contractor/profile" icon={User} onClick={() => setOpen(false)}>Profile</MenuLink>}
          {u.role === 'employer' && <MenuLink to="/employer/profile" icon={User} onClick={() => setOpen(false)}>Business profile</MenuLink>}
          <MenuLink to="/settings" icon={Settings} onClick={() => setOpen(false)}>Settings</MenuLink>
          <button
            className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[14px] text-ink hover:bg-canvas-alt"
            onClick={async () => {
              await api.signOut();
              navigate('/');
            }}
          >
            <LogOut className="h-4 w-4 text-ink-muted" aria-hidden /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
function MenuLink({ to, icon: Icon, children, onClick }: { to: string; icon: typeof User; children: ReactNode; onClick: () => void }) {
  return (
    <Link to={to} onClick={onClick} className="flex items-center gap-3 px-4 py-2.5 text-[14px] text-ink hover:bg-canvas-alt">
      <Icon className="h-4 w-4 text-ink-muted" aria-hidden />
      {children}
    </Link>
  );
}

function Header() {
  const { session } = useAuth();
  const role = session?.user.role ?? null;
  const nav = navFor(role);
  const [menu, setMenu] = useState(false);
  const loc = useLocation();
  useEffect(() => {
    setMenu(false);
  }, [loc.pathname]);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="container-page flex h-16 items-center justify-between gap-6">
        <div className="flex items-center gap-2">
          {!session && (
            <button className="-ml-2 rounded-lg p-2 text-ink md:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </button>
          )}
          <Logo />
        </div>
        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {nav.map((item) => (
            <TopLink key={item.to} item={item} />
          ))}
        </nav>
        <div className="flex items-center gap-1.5 sm:gap-2">
          {session ? (
            <>
              {role === 'employer' && (
                <Link to="/employer/post" className="btn-primary btn-sm hidden sm:inline-flex">
                  <Plus className="h-4 w-4" aria-hidden /> Post a Job
                </Link>
              )}
              <NotificationMenu />
              <AccountMenu />
            </>
          ) : (
            <>
              <Link to="/signin" className="btn-ghost btn-sm hidden text-ink sm:inline-flex">
                Log In
              </Link>
              <Link to="/employer/post" className="btn-primary btn-sm">
                Post a Job
              </Link>
            </>
          )}
        </div>
      </div>
      <Sheet open={menu} onClose={() => setMenu(false)} title="Menu">
        <nav aria-label="Mobile" className="flex flex-col">
          {PUBLIC_NAV.map((i) => (
            <Link key={i.to} to={i.to} className="flex items-center gap-3 rounded-ctl px-3 py-3 text-[15px] font-medium text-ink hover:bg-canvas-alt">
              <i.icon className="h-[18px] w-[18px] text-ink-muted" aria-hidden />
              {i.label}
            </Link>
          ))}
          <div className="my-3 divider" />
          <Link to="/signin" className="btn-secondary w-full">
            Log In
          </Link>
          <Link to="/signup" className="btn-ghost mt-2 w-full">
            Create an account
          </Link>
        </nav>
      </Sheet>
    </header>
  );
}

/** Bottom tab bar for signed-in users on phones: one tap to applications and messages. */
function MobileTabs() {
  const { session } = useAuth();
  const unreadMessages = useUnreadMessages();
  const role = session?.user.role ?? null;
  if (!session || role === 'admin') return null;
  const items: NavItem[] =
    role === 'employer'
      ? [EMPLOYER_NAV[0], EMPLOYER_NAV[1], { to: '/employer/post', label: 'Post', icon: Plus }, EMPLOYER_NAV[2], EMPLOYER_NAV[4]]
      : CONTRACTOR_NAV;
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink to={item.to} end={item.end} className={({ isActive }) => cx('relative flex h-16 flex-col items-center justify-center gap-1 text-[11.5px] font-semibold', isActive ? 'text-teal-700' : 'text-ink-muted')}>
              {item.to === '/employer/post' ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-ctl bg-navy text-white">
                  <Plus className="h-[18px] w-[18px]" aria-hidden />
                </span>
              ) : (
                <item.icon className="h-[21px] w-[21px]" aria-hidden />
              )}
              {item.short ?? item.label}
              {item.to === '/messages' && unreadMessages > 0 && (
                <span className="absolute right-[calc(50%-18px)] top-2.5 min-w-[16px] rounded-full bg-teal px-1 text-center text-[10px] leading-4 text-white">{unreadMessages}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function DemoBanner() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const demo = demoApi;
  if (!isDemo || !demo) return null;
  const switchTo = async (id: string) => {
    setBusy(true);
    const s = await demo.signInAs(id);
    setBusy(false);
    navigate(homeFor(s.user.role));
  };
  return (
    <div className="border-b border-line bg-canvas-alt">
      <div className="container-page flex flex-col gap-2 py-2 text-[13px] sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink">
          <span className="font-semibold text-navy">Demo mode.</span> <span className="sm:hidden">Listings marked Example are sample data.</span>
          <span className="hidden sm:inline">
            Jobs, businesses, and people marked <span className="font-semibold">Example</span> are sample data, not real opportunities. Data stays in this browser.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="hidden text-ink-muted sm:inline">View as</span>
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.id} disabled={busy} onClick={() => switchTo(a.id)} className={cx('font-semibold underline-offset-4 hover:underline', session?.user.id === a.id ? 'text-teal-700 underline' : 'text-navy')}>
              {a.label}
            </button>
          ))}
          <span className="text-line-strong" aria-hidden>
            |
          </span>
          <button
            disabled={busy}
            className="font-semibold text-ink-muted underline-offset-4 hover:text-navy hover:underline"
            onClick={async () => {
              if (!confirm('Reset the demo? Anything you created in this browser will be removed.')) return;
              await demo.reset();
              navigate('/');
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

function Footer({ flush }: { flush?: boolean }) {
  return (
    <footer className={cx(flush ? 'mt-0' : 'mt-24', 'border-t border-line bg-white pb-24 md:pb-0')}>
      <div className="container-page grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-[14px] text-ink-muted">A local job board for property maintenance and rental turnover work in the Las Vegas valley.</p>
          <p className="mt-4 max-w-sm text-[12.5px] leading-relaxed text-ink-muted">
            Turnlist lists independent contractor opportunities. We are not an employer, staffing agency, or payment processor, and we do not guarantee work, quality, or payment.
          </p>
        </div>
        <FooterCol title="Work" links={[['/jobs', 'Find Work'], ['/categories', 'Browse Categories'], ['/signup?role=contractor', 'Create a contractor profile']]} />
        <FooterCol title="Hire" links={[['/employer/post', 'Post a Job'], ['/how-it-works', 'How It Works'], ['/signup?role=employer', 'Create a business account']]} />
        <FooterCol title="Policies" links={[['/legal/terms', 'Terms of use'], ['/legal/contractors', 'Independent contractor notice'], ['/legal/privacy', 'Privacy'], ['/legal/moderation', 'Listing and verification standards']]} />
      </div>
    </footer>
  );
}
function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h2 className="eyebrow mb-3">{title}</h2>
      <ul className="space-y-2">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="text-[14px] text-ink hover:text-teal-700">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AppLayout() {
  const loc = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [loc.pathname]);
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-navy px-3 py-2 text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <DemoBanner />
      <Header />
      <main id="main" className="flex-1 pb-20 md:pb-0">
        <Outlet />
      </main>
      <Footer flush={loc.pathname === '/'} />
      <MobileTabs />
    </div>
  );
}

/** Standard page frame below the header. */
export function Page({ children, className, narrow }: { children: ReactNode; className?: string; narrow?: boolean }) {
  return <div className={cx('container-page pt-8 sm:pt-12', narrow && 'max-w-3xl', className)}>{children}</div>;
}
