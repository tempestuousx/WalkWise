import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { Button, EmptyState, ErrorState, PageHeader, PageLoading, cx } from '@/components/ui';
import { Page } from '@/components/Layout';
import { useAction, useNotifications } from '@/lib/queries';
import { api } from '@/data';
import { timeAgo } from '@/domain/format';

export default function Notifications() {
  const q = useNotifications();
  const navigate = useNavigate();
  const markAll = useAction(() => api.markNotificationsRead('all'));
  if (q.isLoading) return <PageLoading />;
  if (q.isError) return <Page><ErrorState error={q.error} onRetry={() => q.refetch()} /></Page>;
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;
  return (
    <Page narrow>
      <PageHeader
        title="Notifications"
        description="Applications, selections, messages, and new matching jobs."
        actions={unread > 0 ? <Button variant="secondary" size="sm" onClick={() => markAll.mutate(undefined)}>Mark all read</Button> : undefined}
      />
      {items.length === 0 ? (
        <EmptyState icon={<Bell />} title="Nothing yet">Updates about your jobs and applications will appear here.</EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-white">
          {items.map((n) => (
            <li key={n.id}>
              <button
                className="flex w-full gap-3 px-5 py-4 text-left transition-colors hover:bg-canvas-alt"
                onClick={async () => {
                  if (!n.read_at) await api.markNotificationsRead([n.id]);
                  if (n.link) navigate(n.link);
                  else q.refetch();
                }}
              >
                <span className={cx('mt-2 h-2 w-2 shrink-0 rounded-full', n.read_at ? 'bg-transparent' : 'bg-teal')} aria-label={n.read_at ? undefined : 'Unread'} />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-navy">{n.title}</span>
                  <span className="block text-[14px] text-ink-muted">{n.body}</span>
                </span>
                <span className="shrink-0 text-[12.5px] text-ink-muted">{timeAgo(n.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}
