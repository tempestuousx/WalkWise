import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, type Session } from '@/data';
import type { Role } from '@/domain/types';
import { PageLoading } from '@/components/ui';

interface AuthState {
  session: Session | null;
  loading: boolean;
}
const AuthContext = createContext<AuthState>({ session: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, loading: true });
  const qc = useQueryClient();
  useEffect(() => {
    let alive = true;
    api
      .getSession()
      .then((session) => alive && setState({ session, loading: false }))
      .catch(() => alive && setState({ session: null, loading: false }));
    const off = api.onAuthChange((session) => {
      setState({ session, loading: false });
      qc.invalidateQueries();
    });
    return () => {
      alive = false;
      off();
    };
  }, [qc]);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const useRole = (): Role | null => useAuth().session?.user.role ?? null;

export function homeFor(role: Role | null | undefined): string {
  if (role === 'employer') return '/employer';
  if (role === 'admin') return '/admin';
  if (role === 'contractor') return '/jobs';
  return '/';
}

/** Route guard: signed-in users with one of the roles; others go to sign in or their own home. */
export function RequireRole({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <PageLoading />;
  if (!session) return <Navigate to={`/signin?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (roles && !roles.includes(session.user.role)) return <Navigate to={homeFor(session.user.role)} replace />;
  return <>{children}</>;
}
