import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/data';
import { useAuth } from './auth';
import { useToast } from './toast';

// Query keys are scoped by user so switching accounts never shows stale data.
export function useCategories() {
  return useQuery({ queryKey: ['categories'], queryFn: () => api.listCategories(), staleTime: 5 * 60_000 });
}
export function useAvailableJobs() {
  return useQuery({ queryKey: ['jobs', 'available'], queryFn: () => api.listAvailableJobs(), staleTime: 30_000 });
}
export function useJob(id: string | undefined) {
  const uid = useAuth().session?.user.id ?? 'anon';
  return useQuery({ queryKey: ['job', id, uid], queryFn: () => api.getJob(id!), enabled: Boolean(id) });
}
export function useMyAccount() {
  const uid = useAuth().session?.user.id;
  return useQuery({ queryKey: ['account', uid], queryFn: () => api.getMyAccount(), enabled: Boolean(uid) });
}
export function useMyJobs() {
  const s = useAuth().session;
  return useQuery({ queryKey: ['myJobs', s?.user.id], queryFn: () => api.listMyJobs(), enabled: s?.user.role === 'employer' });
}
export function useApplicants(jobId?: string) {
  const s = useAuth().session;
  return useQuery({ queryKey: ['applicants', s?.user.id, jobId ?? 'all'], queryFn: () => api.listApplicantsForEmployer(jobId), enabled: s?.user.role === 'employer' || s?.user.role === 'admin' });
}
export function useMyApplications() {
  const s = useAuth().session;
  return useQuery({ queryKey: ['myApplications', s?.user.id], queryFn: () => api.listMyApplications(), enabled: s?.user.role === 'contractor' });
}
export function useSavedJobIds() {
  const s = useAuth().session;
  return useQuery({ queryKey: ['savedJobs', s?.user.id], queryFn: () => api.listSavedJobIds(), enabled: s?.user.role === 'contractor' });
}
export function useNotifications() {
  const uid = useAuth().session?.user.id;
  return useQuery({ queryKey: ['notifications', uid], queryFn: () => api.listNotifications(), enabled: Boolean(uid), refetchInterval: 30_000 });
}
export function useConversations() {
  const uid = useAuth().session?.user.id;
  return useQuery({ queryKey: ['conversations', uid], queryFn: () => api.listConversations(), enabled: Boolean(uid), refetchInterval: 20_000 });
}

/**
 * Mutation wrapper: shows a toast on success/failure and refreshes all data,
 * since most actions (select, apply, cancel) touch several views at once.
 */
export function useAction<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>, opts: { success?: string | ((r: TResult) => string); onSuccess?: (r: TResult) => void } = {}) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      qc.invalidateQueries();
      const msg = typeof opts.success === 'function' ? opts.success(r) : opts.success;
      if (msg) toast.success(msg);
      opts.onSuccess?.(r);
    },
    onError: (e) => toast.error(e),
  });
}
