-- مراجعة النظام 2026-11-15: appointment-confirm وdaily-news صارتا ترفضان المفتاح العام وحده.
-- النداءان الآليان (ترقر إدراج الموعد، ومجدول خبر اليوم) يحملان الآن السر الداخلي
-- (discussion_ai_config/inbound_secret) كبقية المجدولات — يُقرأ من القاعدة وقت النداء، فلا سرّ في هذا الملف.

create or replace function public.appointment_send_confirmation()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  fn_url text;
  anon   text;
  inner_secret text;
begin
  -- لا تأكيد للملغى، ولا لموعد بلا جوال، ولا لما أُرسل تأكيده مسبقاً
  if new.status is distinct from 'confirmed' then return new; end if;
  if coalesce(new.client_phone, '') = '' then return new; end if;
  if new.confirmation_sent_at is not null then return new; end if;

  select value into fn_url from public.lookup_values
   where type = 'appt_confirm_config' and label = 'function_url' limit 1;
  select value into anon from public.lookup_values
   where type = 'appt_confirm_config' and label = 'service_key' limit 1;   -- المفتاح العام (لبوابة verify_jwt)
  select value into inner_secret from public.lookup_values
   where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1;

  if fn_url is null or anon is null or inner_secret is null then
    return new; -- غير مُعدّ — الموعد يُحفظ على أي حال
  end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',      'application/json',
                 'Authorization',     'Bearer ' || anon,
                 'x-internal-secret', inner_secret
               ),
    body    := jsonb_build_object('appointment_id', new.id, 'kind', 'confirm')
  );
  return new;
exception when others then
  -- الإرسال ثانوي: أي خطأ هنا يجب ألا يمنع حفظ الموعد
  return new;
end;
$function$;

-- مجدول خبر اليوم: يقرأ المفتاح العام والسر من القاعدة بدل مفتاح مكتوب في نص المهمة
select cron.unschedule('daily-news') where exists (select 1 from cron.job where jobname = 'daily-news');
select cron.schedule('daily-news', '0 4 * * *', $cron$
  select net.http_post(
    url     := 'https://zwaahunavepleczuamuy.supabase.co/functions/v1/daily-news',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || (select value from public.lookup_values
                                        where type = 'discussion_ai_config' and label = 'anon_key' limit 1),
                 'x-internal-secret', (select value from public.lookup_values
                                        where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1)),
    body    := '{"mode": "pick"}'::jsonb,
    timeout_milliseconds := 60000
  );
$cron$);
