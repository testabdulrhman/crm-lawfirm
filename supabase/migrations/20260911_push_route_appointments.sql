-- وجهة إشعار الموعد (بلاغ المدير 2026-09-11)
--
-- وصله إشعار «حجز موعد جديد من الموقع» فنقر عليه ولم ينتقل إلى شيء. السبب:
-- هذه الدالة تبني المسار من task_id أو case_id، وحجز الموقع لا يملك أيّاً
-- منهما، فكان يسقط إلى الفرع الأخير '/' أي الصفحة الرئيسية.
--
-- لا عمود appointment_id في notifications، فالوجهة هي القائمة لا الموعد بعينه —
-- والقائمة مرتّبة بالأقرب أولاً فالحجز الجديد في أعلاها غالباً.
create or replace function public.notification_push_dispatch()
returns trigger language plpgsql security definer
set search_path to 'public', 'extensions' as $function$
declare
  fn_url text; akey text; secret text; v_route text;
begin
  if new.recipient_id is null then return new; end if;
  if public.notification_pref_mode(new.recipient_id, new.type) = 'inapp' then return new; end if;

  select value into fn_url from public.lookup_values
   where type = 'push_config' and label = 'function_url' limit 1;
  select value into akey from public.lookup_values
   where type = 'discussion_ai_config' and label = 'anon_key' limit 1;
  select value into secret from public.lookup_values
   where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1;
  if fn_url is null or akey is null or secret is null then return new; end if;

  v_route := case
    when new.task_id is not null then '/tasks/' || new.task_id
    when new.type = 'mention' and new.case_id is not null
      then '/discussions?case=' || new.case_id
    when new.type = 'mention' then '/discussions'
    when new.case_id is not null then '/cases/' || new.case_id
    when new.type like 'appointment%' then '/appointments'
    else '/'
  end;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || akey,
                 'x-ai-secret',   secret),
    body    := jsonb_build_object(
                 'member_ids',       jsonb_build_array(new.recipient_id),
                 'title',            coalesce(new.title, 'إشعار'),
                 'message',          coalesce(new.message, ''),
                 'route',            v_route,
                 'notification_ids', jsonb_build_array(new.id))
  );
  return new;
exception when others then
  return new;
end; $function$;
