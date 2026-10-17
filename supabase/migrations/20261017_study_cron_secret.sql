-- المهمة الليلية لتجديد الدراسات تنادي case-study بالسرّ الداخلي لا بالمفتاح العام (2026-10-17):
-- الدالة صارت ترفض المفتاح العام بلا جلسة موظف، لأن الدراسة تقرأ الآن مستندات الملف كلها (تكلفة).
select cron.unschedule('study-refresh-stale') where exists (select 1 from cron.job where jobname = 'study-refresh-stale');
select cron.schedule('study-refresh-stale', '0 1 * * *', $$
  select net.http_post(
    url     := 'https://zwaahunavepleczuamuy.supabase.co/functions/v1/case-study',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 -- البوابة تشترط JWT (verify_jwt) فيمرّ المفتاح العام؛ والدالة نفسها تتحقق من السرّ
                 'Authorization', 'Bearer ' || (select value from public.lookup_values
                                        where type = 'discussion_ai_config' and label = 'anon_key' limit 1),
                 'x-internal-secret', (select value from public.lookup_values
                                        where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1)),
    body    := '{"mode": "stale"}'::jsonb,
    timeout_milliseconds := 30000
  )
$$);
