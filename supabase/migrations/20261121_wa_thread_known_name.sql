-- بلاغ المدير 2026-11-21: «في الواتس اب لما يراسلني الشخص ما يحط لي اسمه من طلب الخدمة أو من طلب الموعد».
-- اسم المحادثة في صندوق «واتساب» = جهة الاتصال المربوطة ← display_name ← الرقم، وdisplay_name لم يكن يُملأ
-- إلا مرة واحدة يوم إنشاء الصندوق؛ فكانت ٩٥ محادثة من ١٢٠ رقماً بلا اسم ولو حجز صاحبها موعداً باسمه.
-- الآن display_name = «أحسن اسم نعرفه لهذا الرقم»، تحفظه القاعدة نفسها:
--   آخر طلب خدمة أو طلب موعد (الأحدث منهما) ← اسمه في أسئلة الاستقبال الآلي ← متقدّم وظيفة ← زميل.
-- ويُحدَّث من الجهتين: عند وصول رسالة لمحادثة بلا اسم، وعند تسجيل طلب/موعد لرقمٍ له محادثة.

create or replace function public.wa_known_name(p_phone text)
 returns text
 language sql
 stable security definer
 set search_path to 'public'
as $$
  with k as (select public.wa_phone_key(p_phone) key),
  booked as (
    select nullif(trim(i.client_name), '') nm, i.created_at at from incoming_requests i, k
     where length(k.key) = 9 and public.wa_phone_key(i.client_phone) = k.key
    union all
    select nullif(trim(a.client_name), ''), a.created_at from appointments a, k
     where length(k.key) = 9 and public.wa_phone_key(a.client_phone) = k.key
  )
  select coalesce(
    (select nm from booked where nm is not null and nm not in ('عميل واتساب', 'واتساب وارد') order by at desc limit 1),
    (select nullif(trim(c.intake_data->>'name'), '') from wa_reception_conversations c where c.phone_e164 = p_phone limit 1),
    (select nullif(trim(s.full_name), '') from staff_applications s, k
      where length(k.key) = 9 and public.wa_phone_key(s.phone) = k.key order by s.created_at desc limit 1),
    (select tm.name from team_members tm, k
      where length(k.key) = 9 and public.wa_phone_key(tm.phone) = k.key limit 1)
  )
$$;
revoke all on function public.wa_known_name(text) from public, anon, authenticated;

-- (١) رسالة واردة لمحادثة بلا اسم: تأخذ اسمها قبل إشعار الفريق
create or replace function public.wa_thread_name_on_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  if new.display_name is null then
    new.display_name := public.wa_known_name(new.phone_e164);
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.wa_thread_name_on_insert() from public, anon, authenticated;

drop trigger if exists wa_thread_name_trg on public.wa_threads;
create trigger wa_thread_name_trg before insert on public.wa_threads
  for each row execute function public.wa_thread_name_on_insert();

-- (٢) طلب خدمة أو موعد جديد لرقمٍ له محادثة: اسمه المكتوب في الطلب يصير اسم المحادثة (الأحدث يغلب)
create or replace function public.wa_thread_name_from_booking()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_name text := nullif(trim(new.client_name), '');
        v_key text := public.wa_phone_key(new.client_phone);
begin
  if v_name is null or v_name in ('عميل واتساب', 'واتساب وارد') or length(coalesce(v_key, '')) <> 9 then
    return new;
  end if;
  update wa_threads set display_name = v_name
   where public.wa_phone_key(phone_e164) = v_key and display_name is distinct from v_name;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.wa_thread_name_from_booking() from public, anon, authenticated;

drop trigger if exists wa_thread_name_from_request_trg on public.incoming_requests;
create trigger wa_thread_name_from_request_trg after insert or update of client_name, client_phone on public.incoming_requests
  for each row execute function public.wa_thread_name_from_booking();

drop trigger if exists wa_thread_name_from_appt_trg on public.appointments;
create trigger wa_thread_name_from_appt_trg after insert or update of client_name, client_phone on public.appointments
  for each row execute function public.wa_thread_name_from_booking();

-- (٣) المحادثات القائمة بلا اسم
update public.wa_threads set display_name = public.wa_known_name(phone_e164)
 where display_name is null and phone_e164 not like 'test:%' and public.wa_known_name(phone_e164) is not null;
