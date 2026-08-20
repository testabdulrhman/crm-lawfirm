-- ربط الوارد تلقائياً بالقضية وجهة الاتصال (طلب المستخدم 2026-08-22:
-- «رسالة من رقم معروف → يقترح ربطه بملف صاحبه»)
--
-- الواقع من البيانات: كل الوارد الحالي من MOJ/SBC (ناجز والمحاكم) —
-- فالمفتاح الفعلي هو **رقم القضية داخل النص** لا رقم المرسل. المطابقة
-- كانت تحدث في متصفح صفحة الوارد فقط وتضيع عند إغلاقها؛ الآن تُثبَّت في
-- القاعدة فيراها كل النظام. رقم المرسل يبقى مساراً ثانياً لعملاء
-- يراسلون مباشرة.

begin;

/* ============ ١. مطابقة رقم قضية في نص الرسالة ============ */

-- أرقام ناجز مثل 01-4803000945 والمخزّن قد يكون 4803000945 —
-- نقارن أذيال الأرقام بعد تجريد غير الأرقام، ولا نربط إلا عند
-- تطابق **وحيد** (الغموض أسوأ من عدم الربط).
create or replace function public.match_incoming_case(p_message text)
returns uuid
language sql
stable
set search_path to 'public'
as $$
  with runs as (
    select distinct m[1] as r
    from regexp_matches(coalesce(p_message, ''), '(\d{7,})', 'g') m
  ),
  hits as (
    select distinct c.id
    from cases c
    cross join runs
    where c.deleted_at is null
      and length(regexp_replace(coalesce(c.court_num, ''), '\D', '', 'g')) >= 7
      and (
        regexp_replace(c.court_num, '\D', '', 'g') = runs.r
        or right(runs.r, length(regexp_replace(c.court_num, '\D', '', 'g')))
           = regexp_replace(c.court_num, '\D', '', 'g')
      )
  )
  select case when count(*) = 1 then min(id::text)::uuid end from hits;
$$;

revoke execute on function public.match_incoming_case(text) from anon, public;
grant  execute on function public.match_incoming_case(text) to authenticated;

/* ============ ٢. الترقر: يثبّت الربط لحظة الاستقبال ============ */

create or replace function public.link_incoming_sms() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_norm text;
begin
  if new.status is distinct from 'incoming' then return new; end if;

  -- رقم قضية في النص (رسائل ناجز)
  if new.case_id is null then
    new.case_id := match_incoming_case(new.message);
  end if;

  -- جهة الاتصال: من القضية المرتبطة، وإلا من رقم مرسل حقيقي
  if new.contact_id is null and new.case_id is not null then
    select contact_id into new.contact_id from cases where id = new.case_id;
  end if;
  if new.contact_id is null and coalesce(new.phone, '') ~ '\d{9,}' then
    v_norm := wa_norm_phone(new.phone);
    if length(coalesce(v_norm, '')) >= 9 then
      select id into new.contact_id from contacts c
      where wa_norm_phone(c.phone) = v_norm
         or (c.phone2 is not null and wa_norm_phone(c.phone2) = v_norm)
      order by c.created_at desc limit 1;
    end if;
  end if;

  return new;
exception when others then
  return new; -- الربط ثانوي — لا يمنع تسجيل الرسالة أبداً
end; $$;

revoke execute on function public.link_incoming_sms() from anon, public;

drop trigger if exists sms_log_autolink_trg on public.sms_log;
create trigger sms_log_autolink_trg
  before insert on public.sms_log
  for each row execute function public.link_incoming_sms();

/* ============ ٣. تعبئة رجعية للوارد القديم ============ */

update sms_log
set case_id = match_incoming_case(message)
where status = 'incoming' and case_id is null
  and match_incoming_case(message) is not null;

update sms_log s
set contact_id = c.contact_id
from cases c
where s.status = 'incoming' and s.contact_id is null
  and s.case_id = c.id and c.contact_id is not null;

commit;
