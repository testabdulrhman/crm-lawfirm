-- كل جلسة تُضاف للتقويم تلقائياً — من أي طريق أُنشئت
-- (بلاغ المدير 2026-09-24: «ليست في التقويم — أضِفها… ليه ما تُضاف بالتقويم تلقائي؟»)
--
-- كانت المزامنة في المتصفح وحده (نموذج الجلسة في الويب)، فالجلسات التي تُنشئها القاعدة
-- لا تصل التقويم: الجلسة التالية في close_session، والإدخال من رسائل ناجز، والمساعد
-- الذكي — ٦ من ٩ جلسات قادمة كانت خارجه.
--
-- ١) ترقر بعد الإدراج ينادي calendar-sync {action:'sync-session'} عبر pg_net (غير متزامن،
--    ولا يُفشل الإدراج أبداً). الدالة تحجز الصف ذرّياً فلا يتكرر الحدث.
-- ٢) مسح كل ساعة {action:'sync-missing'} لما فشل وقت إنشائه (Google متعثّر مثلاً).
-- الرابط يُشتق من push_config/function_url، والسرّ من discussion_ai_config/inbound_secret
-- — لا يُكتب شيء منهما هنا (المستودع عام).

create or replace function public.calendar_sync_call(p_body jsonb)
returns void language plpgsql security definer
set search_path to 'public', 'extensions' as $$
declare fn_url text; akey text; secret text;
begin
  select regexp_replace(value, '/functions/v1/.*$', '/functions/v1/calendar-sync')
    into fn_url from lookup_values where type = 'push_config' and label = 'function_url' limit 1;
  select value into akey from lookup_values
   where type = 'discussion_ai_config' and label = 'anon_key' limit 1;
  select value into secret from lookup_values
   where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1;
  if fn_url is null or akey is null then return; end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || akey,
                 'x-ai-secret',   coalesce(secret, '')),
    body    := p_body);
exception when others then
  return;   -- المزامنة ثانوية: لا تُفشل ما ناداها
end $$;

revoke all on function public.calendar_sync_call(jsonb) from public, anon, authenticated;

create or replace function public.session_calendar_autosync()
returns trigger language plpgsql security definer
set search_path to 'public' as $$
begin
  if new.gcal_event_id is null and new.closed_at is null
     and new.session_date >= (now() at time zone 'Asia/Riyadh')::date then
    perform public.calendar_sync_call(
      jsonb_build_object('action', 'sync-session', 'session_id', new.id));
  end if;
  return new;
end $$;

revoke all on function public.session_calendar_autosync() from public, anon, authenticated;

drop trigger if exists session_calendar_autosync_trg on public.sessions;
create trigger session_calendar_autosync_trg
  after insert on public.sessions
  for each row execute function public.session_calendar_autosync();

-- شبكة الأمان: كل ساعة عند الدقيقة ٢٠
select cron.unschedule(jobid) from cron.job where jobname = 'session-calendar-sweep';
select cron.schedule('session-calendar-sweep', '20 * * * *',
  $$select public.calendar_sync_call('{"action":"sync-missing"}'::jsonb)$$);
