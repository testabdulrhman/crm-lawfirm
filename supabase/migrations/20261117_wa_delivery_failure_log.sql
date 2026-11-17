-- CRM-12 (فحص 2026-11-17): فشل التسليم اللاحق كان صامتاً. ٢٢١ رسالة واتساب للمتقدمين (crm_law_09/10)
-- رفضها هاتف «القالب غير موجود» بعد أن ردّ الـHub «في الطابور»، فبقيت في سجلنا «نجحت» شهراً.
-- whatsapp-send v17 صار يحفظ مفتاح الرسالة (dedup_key) فيقلبها بلاغ الـHub «فشلت»؛ وهذا الترقر
-- يُظهر ذلك للمدير في سجل الأخطاء (/errors) — سطر واحد لكل قالب/نوع في اليوم، لا لكل رسالة.

create or replace function public.wa_delivery_failed_log()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_kind text := coalesce(substring(new.message from '^\[قالب: ([A-Za-z_0-9]+)\]'), 'نص حر');
        v_src text := 'whatsapp-delivery:' || v_kind;
        v_n int;
begin
  if new.sent_by <> 'whatsapp' or new.status <> 'failed' or old.status = 'failed' then return new; end if;
  if exists (select 1 from error_logs where source = v_src and created_at > now() - interval '24 hours') then
    return new;
  end if;
  select count(*) into v_n from sms_log
   where sent_by = 'whatsapp' and status = 'failed' and created_at > now() - interval '24 hours'
     and coalesce(substring(message from '^\[قالب: ([A-Za-z_0-9]+)\]'), 'نص حر') = v_kind;
  insert into error_logs (error_type, message, source, user_name)
  values ('whatsapp_delivery',
          'رسائل واتساب لم تصل (' || v_kind || ') — ' || v_n || ' خلال ٢٤ ساعة. آخرها إلى '
            || coalesce(new.recipient_name, 'مستلم') || '. راجع حالة القالب عند هاتف.',
          v_src, 'نظام');
  return new;
end $$;
revoke all on function public.wa_delivery_failed_log() from public, anon, authenticated;

drop trigger if exists wa_delivery_failed_log_trg on public.sms_log;
create trigger wa_delivery_failed_log_trg
  after update of status on public.sms_log
  for each row execute function public.wa_delivery_failed_log();

-- بلاغ التسليم يحدّث بالمفتاح — فهرس للصادر (الموجود جزئي على الوارد فقط)
create index if not exists sms_log_dedup_out_idx on public.sms_log (dedup_key) where status <> 'incoming';
