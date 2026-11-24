import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, MessageSquare, Send } from 'lucide-react';
import { Avatar, Button, EmptyState, ErrorState, PageLoading, Spinner, cx } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useAction, useConversations } from '@/lib/queries';
import { api } from '@/data';
import { timeAgo } from '@/domain/format';

export default function Messages() {
  const { id } = useParams();
  const list = useConversations();
  if (list.isLoading) return <PageLoading />;
  if (list.isError) return <div className="container-page pt-10"><ErrorState error={list.error} onRetry={() => list.refetch()} /></div>;
  const convs = list.data ?? [];

  return (
    <div className="container-page pt-6 sm:pt-10">
      <h1 className={cx('mb-6 text-h1', id && 'hidden md:block')}>Messages</h1>
      {convs.length === 0 ? (
        <EmptyState icon={<MessageSquare />} title="No conversations yet">
          Conversations start from a job: businesses can message applicants, and contractors can message businesses they have applied to.
        </EmptyState>
      ) : (
        <div className="grid overflow-hidden rounded-card border border-line bg-white md:h-[calc(100vh-13rem)] md:min-h-[480px] md:grid-cols-[320px_1fr]">
          <nav aria-label="Conversations" className={cx('overflow-y-auto border-line md:border-r', id && 'hidden md:block')}>
            <ul>
              {convs.map((c) => (
                <li key={c.conversation.id}>
                  <Link to={`/messages/${c.conversation.id}`} aria-current={id === c.conversation.id ? 'page' : undefined} className={cx('flex gap-3 border-b border-line px-4 py-3.5 transition-colors', id === c.conversation.id ? 'bg-teal-50/60' : 'hover:bg-canvas-alt')}>
                    <Avatar name={c.other.name} src={c.other.avatar_url} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className={cx('truncate text-[14px]', c.unread ? 'font-bold text-navy' : 'font-semibold text-navy')}>{c.other.name}</span>
                        {c.last_message && <span className="shrink-0 text-[12px] text-ink-muted">{timeAgo(c.last_message.created_at)}</span>}
                      </div>
                      {c.job_title && <p className="truncate text-[12.5px] text-ink-muted">{c.job_title}</p>}
                      <p className={cx('truncate text-[13px]', c.unread ? 'font-semibold text-ink' : 'text-ink-muted')}>{c.last_message?.body ?? 'No messages yet'}</p>
                    </div>
                    {c.unread > 0 && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-teal" aria-label={`${c.unread} unread`} />}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          {id ? <Thread id={id} /> : <div className="hidden items-center justify-center text-[14px] text-ink-muted md:flex">Choose a conversation</div>}
        </div>
      )}
    </div>
  );
}

function Thread({ id }: { id: string }) {
  const { session } = useAuth();
  const q = useQuery({ queryKey: ['messages', id, session?.user.id], queryFn: () => api.getMessages(id), refetchInterval: 10_000 });
  const [body, setBody] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  // Opening a thread marks it read; refresh the list so its unread dot clears.
  useEffect(() => {
    if (q.dataUpdatedAt) void qc.invalidateQueries({ queryKey: ['conversations'] });
  }, [q.dataUpdatedAt, qc]);
  const send = useAction((text: string) => api.sendMessage(id, text), { onSuccess: () => setBody('') });
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [q.data?.messages.length]);

  if (q.isLoading) return <div className="flex items-center justify-center p-10"><Spinner /></div>;
  if (q.isError || !q.data) return <div className="p-6"><ErrorState error={q.error} /></div>;
  const { summary, messages } = q.data;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (body.trim()) send.mutate(body);
  };

  return (
    <section className="flex min-h-[70vh] flex-col md:min-h-0" aria-label={`Conversation with ${summary.other.name}`}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link to="/messages" className="-ml-1 rounded-lg p-1.5 text-ink-muted hover:bg-canvas-alt md:hidden" aria-label="Back to conversations">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Avatar name={summary.other.name} src={summary.other.avatar_url} size={36} />
        <div className="min-w-0">
          <p className="truncate font-semibold text-navy">{summary.other.name}</p>
          {summary.job_title && summary.conversation.job_id && (
            <Link to={session?.user.role === 'employer' ? `/employer/listings/${summary.conversation.job_id}` : `/jobs/${summary.conversation.job_id}`} className="block truncate text-[12.5px] text-teal-700 hover:underline">
              {summary.job_title}
            </Link>
          )}
        </div>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto bg-canvas-alt/50 px-4 py-5" aria-live="polite">
        {messages.length === 0 && <p className="text-center text-[13.5px] text-ink-muted">Say hello. Keep payment and scheduling details in writing here.</p>}
        {messages.map((m) => {
          const mine = m.sender_id === session?.user.id;
          return (
            <div key={m.id} className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[80%] rounded-card px-3.5 py-2.5 text-[14.5px] leading-relaxed', mine ? 'rounded-br-md bg-navy text-white' : 'rounded-bl-md border border-line bg-white text-ink')}>
                <p className="whitespace-pre-line">{m.body}</p>
                <p className={cx('mt-1 text-[11.5px]', mine ? 'text-white/70' : 'text-ink-muted')}>{timeAgo(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2 border-t border-line bg-white p-3">
        <label htmlFor="msg" className="sr-only">
          Message
        </label>
        <textarea
          id="msg"
          rows={1}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (body.trim()) send.mutate(body);
            }
          }}
          placeholder="Write a message"
          maxLength={4000}
          className="input max-h-40 min-h-11 flex-1 resize-none py-2.5"
        />
        <Button type="submit" loading={send.isPending} disabled={!body.trim()} aria-label="Send message">
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </form>
    </section>
  );
}
