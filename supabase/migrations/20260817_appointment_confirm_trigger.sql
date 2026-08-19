-- مشغّل يُرسل تأكيد الموعد فور إنشائه — أياً كان مصدره:
-- الحجز من الموقع، الإدخال اليدوي داخل النظام، أو رسائل ناجز.
--
-- ⚠️ لماذا مشغّل لا تعديل في دالة booking: دالة الحجز تعمل ولا سبب لتعريضها
--    لخطر، والمشغّل يغطي المصادر الثلاثة بدل الموقع وحده.
--
-- ⚠️ المفتاح المخزَّن في lookup_values هو **anon** لا service_role: الجدول
--    يقرأه كل موظف (سياسة authenticated_all)، وanon عام أصلاً ويكفي لاجتياز
--    verify_jwt. الدالة نفسها تستخدم service_role من أسرار Supabase.

create or replace function public.appointment_send_confirmation()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text;
  svc    text;
begin
  if new.status is distinct from 'confirmed' then return new; end if;
  if coalesce(new.client_phone, '') = '' then return new; end if;
  if new.confirmation_sent_at is not null then return new; end if;

  select value into fn_url from public.lookup_values
   where type = 'appt_confirm_config' and label = 'function_url' limit 1;
  select value into svc    from public.lookup_values
   where type = 'appt_confirm_config' and label = 'service_key' limit 1;

  if fn_url is null or svc is null then return new; end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || svc
               ),
    body    := jsonb_build_object('appointment_id', new.id, 'kind', 'confirm')
  );
  return new;
exception when others then
  -- الإرسال ثانوي: أي خطأ هنا يجب ألا يمنع حفظ الموعد
  return new;
end;
$$;

revoke execute on function public.appointment_send_confirmation() from anon, public;

drop trigger if exists appointment_confirm_trg on public.appointments;
create trigger appointment_confirm_trg
  after insert on public.appointments
  for each row execute function public.appointment_send_confirmation();
