-- خط إشعارات الدفع (تفعيل حساب Apple Developer المدفوع 2026-08-22)
--
-- push-send وpush_devices كانا جاهزين من تحضير سابق — هذا يكمل الخط:
-- ١. app_secrets: جدول أسرار مغلق (RLS بلا سياسات = service فقط) لمفتاح
--    APNs — lookup_values مكشوف لكل موظف فلا يصلح لمفتاح توقيع.
--    ⚠️ القيم تُدرج مباشرة في القاعدة ولا تُكتب في هذا الملف أبداً.
-- ٢. trigger على notifications: كل إشعار داخلي جديد يُدفع فوراً للجوال
--    عبر pg_net → push-send — منشن ومهمة واعتماد وكل الأنواع بمسار واحد.

begin;

/* ============ ١. جدول الأسرار المغلق ============ */

create table if not exists public.app_secrets (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_secrets enable row level security; -- بلا سياسات عمداً
revoke all on public.app_secrets from anon, authenticated, public;

/* ============ ٢. عنوان الدالة ============ */

insert into public.lookup_values (type, label, value)
select 'push_config', 'function_url',
       'https://zwaahunavepleczuamuy.supabase.co/functions/v1/push-send'
where not exists (
  select 1 from public.lookup_values where type='push_config' and label='function_url'
);

/* ============ ٣. الدفع عند كل إشعار ============ */

create or replace function public.notification_push_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text;
  akey   text;
  secret text;
  v_route text;
begin
  if new.recipient_id is null then return new; end if;

  select value into fn_url from public.lookup_values
   where type = 'push_config' and label = 'function_url' limit 1;
  select value into akey from public.lookup_values
   where type = 'discussion_ai_config' and label = 'anon_key' limit 1;
  select value into secret from public.lookup_values
   where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1;
  if fn_url is null or akey is null or secret is null then return new; end if;

  -- الوجهة عند الضغط — نفس منطق جرس الويب
  v_route := case
    when new.task_id is not null then '/tasks/' || new.task_id
    when new.type = 'mention' then '/discussions'
    when new.case_id is not null then '/cases/' || new.case_id
    else '/'
  end;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || akey,
                 'x-ai-secret',   secret
               ),
    body    := jsonb_build_object(
                 'member_ids',       jsonb_build_array(new.recipient_id),
                 'title',            coalesce(new.title, 'إشعار'),
                 'message',          coalesce(new.message, ''),
                 'route',            v_route,
                 'notification_ids', jsonb_build_array(new.id)
               )
  );
  return new;
exception when others then
  return new; -- الدفع ثانوي — الإشعار داخل النظام محفوظ على كل حال
end; $$;

revoke execute on function public.notification_push_dispatch() from anon, public;

drop trigger if exists notification_push_trg on public.notifications;
create trigger notification_push_trg
  after insert on public.notifications
  for each row execute function public.notification_push_dispatch();

commit;
