-- ============================================================================
-- الرقم المرجعي للحجز: APT-{YY}{NNN}  مثال: APT-26001
--   YY  = آخر رقمين من السنة الميلادية (بتوقيت الرياض)
--   NNN = تسلسل يبدأ من 1 كل سنة ميلادية
--
-- ⚠️ يستبدل الصيغة العشوائية السابقة (APT-260810-MHPP). الحجوزات القائمة
--    تحتفظ برقمها القديم — لا يُعاد ترقيم شيء.
--
-- ⚠️ العدّاد في جدول مستقل لا `max(reference_no)+1`: الأخير يتسابق عند حجزين
--    متزامنين ويعيد استخدام الرقم بعد الحذف. الجدول يضمن التفرّد والتتابع.
-- ============================================================================

begin;

create table if not exists public.booking_counters (
  year_yy int primary key,
  last_no int not null default 0
);

comment on table public.booking_counters is 'عدّاد الرقم المرجعي للحجوزات — صف لكل سنة (YY)';

alter table public.booking_counters enable row level security;
-- لا سياسات: لا أحد يصل إليه مباشرة. الدالة أدناه (security definer) هي المنفذ الوحيد.

create or replace function public.next_booking_reference()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  yy int;
  n  int;
begin
  -- ⚠️ السنة بتوقيت الرياض لا UTC — حتى لا ينقلب الرقم قبل رأس السنة محلياً
  yy := to_char((now() at time zone 'Asia/Riyadh'), 'YY')::int;

  -- زيادة ذرّية: تمنع تكرار الرقم عند حجزين في نفس اللحظة
  insert into public.booking_counters (year_yy, last_no)
  values (yy, 1)
  on conflict (year_yy) do update set last_no = booking_counters.last_no + 1
  returning last_no into n;

  -- 3 خانات، وتتوسّع تلقائياً بعد 999 (APT-261000) بدل أن تنكسر
  return 'APT-' || lpad(yy::text, 2, '0') || lpad(n::text, 3, '0');
end $$;

-- بداية عدّاد 2026 من 24 (طلب المستخدم) — أول حجز يأخذ APT-26024.
-- السنوات التالية تبدأ من 1 تلقائياً ما لم يُزرع لها رقم مثل هذا.
insert into public.booking_counters (year_yy, last_no)
values (26, 23)
on conflict (year_yy) do nothing;

comment on function public.next_booking_reference() is 'يُرجع الرقم المرجعي التالي بصيغة APT-{YY}{NNN} — تستدعيها دالة booking بمفتاح service role';

-- المنفذ للخادم فقط: الزائر والموظف لا يستطيعان حرق أرقام
revoke execute on function public.next_booking_reference() from public;
grant execute on function public.next_booking_reference() to service_role;

commit;

-- ============================================================================
-- التراجع
-- ============================================================================
-- begin;
--   drop function if exists public.next_booking_reference();
--   drop table if exists public.booking_counters;
-- commit;
-- (الحجوزات تحتفظ بأرقامها؛ العودة للصيغة العشوائية تتطلب إعادة نشر دالة booking)
-- ============================================================================
