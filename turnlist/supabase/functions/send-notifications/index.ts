// Supabase Edge Function (Deno): delivers queued email notifications.
//
// Reads public.notification_deliveries where status = 'queued' and channel =
// 'email', sends each through Resend, and records the result. Schedule it
// every minute with pg_cron + pg_net, or call it from a Database Webhook on
// insert into notification_deliveries.
//
// Required secrets (supabase secrets set ...):
//   RESEND_API_KEY, EMAIL_FROM (e.g. "Turnlist <alerts@yourdomain>"), APP_URL
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by the platform.
//
// SMS is intentionally not handled: those rows are written as 'skipped'
// until an SMS provider and opt-in flow are approved.
import { createClient } from 'npm:@supabase/supabase-js@2.46.1';

const BATCH = 50;
const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`) return new Response('forbidden', { status: 403 });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const appUrl = Deno.env.get('APP_URL') ?? '';
  const { data: rows, error } = await sb
    .from('notification_deliveries')
    .select('id, attempts, notification:notifications(id, user_id, title, body, link)')
    .eq('status', 'queued')
    .eq('channel', 'email')
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at')
    .limit(BATCH);
  if (error) return new Response(error.message, { status: 500 });

  let sent = 0;
  for (const row of rows ?? []) {
    const n = row.notification as unknown as { user_id: string; title: string; body: string; link: string | null } | null;
    if (!n) continue;
    const { data: user } = await sb.auth.admin.getUserById(n.user_id);
    const to = user.user?.email;
    if (!to) {
      await sb.from('notification_deliveries').update({ status: 'skipped', last_error: 'no email on account' }).eq('id', row.id);
      continue;
    }
    const link = n.link ? `${appUrl}${n.link}` : appUrl;
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM'),
        to,
        subject: n.title,
        text: `${n.body}\n\n${link}\n\nYou can change which emails you get in Settings > Notifications: ${appUrl}/settings/notifications`,
      }),
    });
    if (res.ok) {
      sent++;
      await sb.from('notification_deliveries').update({ status: 'sent', sent_at: new Date().toISOString(), attempts: row.attempts + 1 }).eq('id', row.id);
    } else {
      const attempts = row.attempts + 1;
      await sb.from('notification_deliveries').update({ status: attempts >= MAX_ATTEMPTS ? 'failed' : 'queued', attempts, last_error: `${res.status} ${await res.text()}`.slice(0, 500) }).eq('id', row.id);
    }
  }
  return Response.json({ processed: rows?.length ?? 0, sent });
});
