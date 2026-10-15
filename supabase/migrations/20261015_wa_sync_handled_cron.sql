-- ما رُدّ عليه في «هاتف» يُعلَّم مقروءاً للفريق (طلب المدير 2026-10-15: «تقرؤها في هاتف وتبقى عندك غير مقروءة»).
-- هاتف لا يُبلغ بالقراءة، فالعلامة: ردُّ موظف (من هاتف أو من نظامنا) بعد آخر رسالة للعميل.
-- المنطق في wa-inbox (sync_handled)؛ وهذه المهمة تناديه كل دقيقتين بالسرّ الداخلي حتى يصل الأثر
-- للآيفون ولو لم يُفتح الويب. والويب يناديه بنفسه عند فتح صندوق «واتساب».
select cron.unschedule('wa-sync-handled') where exists (select 1 from cron.job where jobname = 'wa-sync-handled');
select cron.schedule('wa-sync-handled', '*/2 * * * *', $$
  select net.http_post(
    url     := 'https://zwaahunavepleczuamuy.supabase.co/functions/v1/wa-inbox',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-region', 'eu-west-1',
                 'x-internal-secret', (select value from public.lookup_values
                                        where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1)),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  )
$$);
