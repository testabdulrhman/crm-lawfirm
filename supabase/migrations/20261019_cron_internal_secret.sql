-- المجدولات الثلاث تحمل السرّ الداخلي (فحص 2026-10-19): session-reminders وsession-brief صارتا ترفضان مفتاح
-- anon وحده، فالمجدول يرسل x-internal-secret من lookup_values كما يفعل study-refresh-stale.
do $$
declare
  hdr text := $h$jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select value from public.lookup_values
                                        where type = 'discussion_ai_config' and label = 'anon_key' limit 1),
                 'x-internal-secret', (select value from public.lookup_values
                                        where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1))$h$;
begin
  perform cron.alter_job(
    (select jobid from cron.job where jobname = 'reminder-day-before'),
    command := format($c$select net.http_post(
      url := 'https://zwaahunavepleczuamuy.supabase.co/functions/v1/session-reminders',
      headers := %s, body := '{"type": "day"}'::jsonb)$c$, hdr));
  perform cron.alter_job(
    (select jobid from cron.job where jobname = 'reminder-30min-before'),
    command := format($c$select net.http_post(
      url := 'https://zwaahunavepleczuamuy.supabase.co/functions/v1/session-reminders',
      headers := %s, body := '{"type": "30min"}'::jsonb)$c$, hdr));
  perform cron.alter_job(
    (select jobid from cron.job where jobname = 'session-briefs'),
    command := format($c$select net.http_post(
      url := 'https://zwaahunavepleczuamuy.supabase.co/functions/v1/session-brief',
      headers := %s, body := '{"mode": "upcoming"}'::jsonb)$c$, hdr));
end $$;
