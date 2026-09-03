-- أتمتة رسائل ناجز: إشعار الجلسة يصير جلسة في الملف
-- (طلب المستخدم 2026-09-03: «أي رسالة تجي يعالجها ويسجلها كجلسة بالنظام»)
--
-- الترقر يمرّر كل رسالة ناجز واردة لدالة najiz-parse (نفس نمط تصنيف
-- المستندات: pg_net + سر داخلي). الدالة هي من تقرّر: جلسة تُنشأ، أو
-- إشعار للمدير إن نقص يقين.

begin;

insert into public.lookup_values (type, label, value)
select 'najiz_ai_config', 'function_url',
       'https://zwaahunavepleczuamuy.supabase.co/functions/v1/najiz-parse'
where not exists (
  select 1 from public.lookup_values where type='najiz_ai_config' and label='function_url'
);

create or replace function public.najiz_sms_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text;
  akey   text;
  secret text;
begin
  if new.status is distinct from 'incoming' then return new; end if;
  if coalesce(new.category, '') <> 'najiz' then return new; end if;

  select value into fn_url from public.lookup_values
   where type = 'najiz_ai_config' and label = 'function_url' limit 1;
  select value into akey from public.lookup_values
   where type = 'discussion_ai_config' and label = 'anon_key' limit 1;
  select value into secret from public.lookup_values
   where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1;
  if fn_url is null or akey is null or secret is null then return new; end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || akey,
                 'x-ai-secret',   secret
               ),
    body    := jsonb_build_object('sms_id', new.id)
  );
  return new;
exception when others then
  -- الأتمتة ثانوية: لا تمنع تسجيل الرسالة أبداً
  return new;
end; $$;

revoke execute on function public.najiz_sms_dispatch() from anon, public;

-- after insert: الصف مثبَّت (ومعه case_id من ترقر الربط) قبل نداء الدالة
drop trigger if exists najiz_sms_trg on public.sms_log;
create trigger najiz_sms_trg
  after insert on public.sms_log
  for each row execute function public.najiz_sms_dispatch();

commit;
