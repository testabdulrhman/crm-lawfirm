-- ============================================================================
-- حجز المواعيد من الموقع (redwan.sa/appointments) — المرحلة الأولى
-- ملف للمراجعة فقط — لم يُطبَّق على الإنتاج.
--
-- ⚠️ قاعدة مشتركة مع النظام القديم: كل تغيير هنا إضافي (ADD COLUMN / CREATE)
--    ولا يعدّل عموداً قائماً ولا يحذف بيانات.
--
-- التوقيت: appointment_date + appointment_time يبقيان كما هما ويُفهمان دائماً
--          على أنهما توقيت الرياض (Asia/Riyadh). لا يوجد تحويل UTC في أي مكان.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1) أعمدة الحجز الجديدة على appointments
--    كلها NULLable: الصفوف الـ 7 القائمة تبقى صالحة بلا أي تعبئة.
-- ---------------------------------------------------------------------------
alter table public.appointments
  add column if not exists service_type     text,  -- مفتاح الخدمة من booking_config
  add column if not exists meeting_method   text,  -- remote | onsite
  add column if not exists client_email     text,  -- نسخة توثيقية وقت الحجز
  add column if not exists company_name     text,  -- نسخة توثيقية وقت الحجز
  add column if not exists source           text,  -- website | crm | najiz …
  add column if not exists reference_no     text,  -- APT-260808-7K4M
  add column if not exists idempotency_key  text;  -- منع التكرار عند التحديث/الضغط المزدوج

comment on column public.appointments.service_type    is 'مفتاح الخدمة كما في lookup_values.booking_config.services[].key';
comment on column public.appointments.meeting_method  is 'remote = عن بُعد، onsite = حضوري في المقر';
comment on column public.appointments.client_email    is 'نسخة وقت الحجز للتوثيق — المصدر الرسمي للبريد هو contacts.email';
comment on column public.appointments.company_name    is 'نسخة وقت الحجز للتوثيق — لا يوجد عمود منشأة على contacts للأفراد';
comment on column public.appointments.source          is 'مصدر الحجز؛ نفس مفردات contacts.source (website/manual/hatif/…)';
comment on column public.appointments.reference_no    is 'رقم مرجعي عشوائي غير تسلسلي — لا يكشف عدد الحجوزات';
comment on column public.appointments.idempotency_key is 'مفتاح إخماد التكرار — يولّده المتصفح ويتحقق منه الخادم';

-- قيمة meeting_method محصورة (تسمح بـ NULL للصفوف القديمة)
alter table public.appointments
  drop constraint if exists appointments_meeting_method_check;
alter table public.appointments
  add constraint appointments_meeting_method_check
  check (meeting_method is null or meeting_method in ('remote', 'onsite'));

-- الرقم المرجعي ومفتاح الإخماد فريدان (الفهارس الجزئية تتجاهل NULL أصلاً)
create unique index if not exists appointments_reference_no_key
  on public.appointments (reference_no) where reference_no is not null;

create unique index if not exists appointments_idempotency_key_key
  on public.appointments (idempotency_key) where idempotency_key is not null;

-- فهرس البحث اليومي (تستخدمه دالة booking في كل نداء slots)
create index if not exists appointments_date_status_idx
  on public.appointments (appointment_date, status);


-- ---------------------------------------------------------------------------
-- 2) منع تداخل المواعيد على مستوى القاعدة
--
--    ⚠️ لماذا EXCLUDE ولا UNIQUE(date,time):
--    المدد الحالية مختلطة (60 دقيقة ×4 و30 دقيقة ×3)، فموعد 10:00 مدته ساعة
--    يتعارض مع موعد 10:30 مدته نصف ساعة رغم اختلاف وقت البداية.
--    UNIQUE على وقت البداية وحده يسمح بهذا التعارض.
--
--    ⚠️ شرط التاريخ: يوجد تعارض تاريخي واحد (2026-05-09 الساعة 11:30 — موعدان
--    مكتملان) وإنشاء القيد على كل الجدول سيفشل بسببه. حصر القيد بما بعد
--    2026-08-09 يحمي كل ما هو قادم دون المساس بالسجل التاريخي ولا حذف بيانات.
--
--    ⚠️ افتراض المورد الواحد: لا يوجد عمود موظف مسؤول على appointments، فالقيد
--    يعامل المكتب كتقويم واحد — لا يسمح بموعدين متزامنين لمحاميين مختلفين.
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist;

alter table public.appointments
  drop constraint if exists appointments_no_overlap;

alter table public.appointments
  add constraint appointments_no_overlap
  exclude using gist (
    tsrange(
      (appointment_date + appointment_time),
      (appointment_date + appointment_time
        + make_interval(mins => coalesce(duration_minutes, 60))),
      '[)'
    ) with &&
  )
  where (status <> 'cancelled' and appointment_date >= date '2026-08-09');


-- ---------------------------------------------------------------------------
-- 3) الأيام المحجوبة (الأعياد والإجازات والمناسبات)
--    بدونها يظهر يوم العيد متاحاً للحجز على الموقع.
-- ---------------------------------------------------------------------------
create table if not exists public.booking_blocked_dates (
  id           uuid primary key default gen_random_uuid(),
  blocked_date date not null unique,
  reason       text,
  created_by   text,
  created_at   timestamptz not null default now()
);

comment on table public.booking_blocked_dates is 'أيام لا تُعرض للحجز على redwan.sa/appointments — أعياد وإجازات المكتب';

alter table public.booking_blocked_dates enable row level security;

drop policy if exists authenticated_all on public.booking_blocked_dates;
create policy authenticated_all on public.booking_blocked_dates
  for all to authenticated using (true) with check (true);
-- ملاحظة: الزائر لا يقرأ هذا الجدول؛ دالة booking تقرأه بمفتاح service role.


-- ---------------------------------------------------------------------------
-- 4) إعدادات الحجز: الخدمات وطرق الاجتماع داخل الـCRM لا داخل الموقع
--    صف واحد في lookup_values حتى تُفعَّل خدمة أو تُعطَّل أو تُغيَّر مدتها
--    وطرق اجتماعها بلا أي تعديل على الموقع ولا إعادة نشر.
-- ---------------------------------------------------------------------------
update public.lookup_values
set value = jsonb_pretty(
  (value::jsonb) || jsonb_build_object(
    'services', jsonb_build_array(
      jsonb_build_object('key','general',    'name','استشارة قانونية عامة',      'duration',30,'methods',jsonb_build_array('remote','onsite'),'active',true),
      jsonb_build_object('key','civil',      'name','القضايا المدنية والتجارية', 'duration',30,'methods',jsonb_build_array('remote','onsite'),'active',true),
      jsonb_build_object('key','labor',      'name','قضايا العمل والعمال',       'duration',30,'methods',jsonb_build_array('remote','onsite'),'active',true),
      jsonb_build_object('key','criminal',   'name','القضايا الجنائية',          'duration',30,'methods',jsonb_build_array('remote','onsite'),'active',true),
      jsonb_build_object('key','realestate', 'name','النزاعات العقارية',         'duration',30,'methods',jsonb_build_array('remote','onsite'),'active',true),
      jsonb_build_object('key','bankruptcy', 'name','الإفلاس والتصفية',          'duration',60,'methods',jsonb_build_array('remote','onsite'),'active',true),
      jsonb_build_object('key','arbitration','name','التحكيم',                   'duration',60,'methods',jsonb_build_array('remote','onsite'),'active',true),
      jsonb_build_object('key','notarization','name','التوثيق',                  'duration',30,'methods',jsonb_build_array('onsite'),          'active',true),
      jsonb_build_object('key','realestate_registration','name','التسجيل العيني للعقار','duration',30,'methods',jsonb_build_array('remote','onsite'),'active',true),
      jsonb_build_object('key','other',      'name','أخرى',                      'duration',30,'methods',jsonb_build_array('remote','onsite'),'active',true)
    )
  )
)::text
where type = 'booking_config';

commit;

-- ============================================================================
-- التراجع (rollback) — انسخ هذا المقطع وشغّله لإعادة الحال كما كان
-- ============================================================================
-- begin;
--   alter table public.appointments drop constraint if exists appointments_no_overlap;
--   alter table public.appointments drop constraint if exists appointments_meeting_method_check;
--   drop index if exists public.appointments_reference_no_key;
--   drop index if exists public.appointments_idempotency_key_key;
--   drop index if exists public.appointments_date_status_idx;
--   drop table if exists public.booking_blocked_dates;
--   alter table public.appointments
--     drop column if exists service_type,
--     drop column if exists meeting_method,
--     drop column if exists client_email,
--     drop column if exists company_name,
--     drop column if exists source,
--     drop column if exists reference_no,
--     drop column if exists idempotency_key;
--   -- إعادة booking_config بلا خدمات:
--   update public.lookup_values
--     set value = ((value::jsonb) - 'services')::text
--     where type = 'booking_config';
-- commit;
--
-- ⚠️ التراجع يحذف بيانات الحجوزات القادمة من الموقع (الخدمة والطريقة والبريد
--    والمنشأة والرقم المرجعي) لأنها تعيش في هذه الأعمدة. الموعد نفسه يبقى.
--    امتداد btree_gist يُترك مثبّتاً — إزالته بلا داعٍ وقد تستخدمه قيود أخرى.
-- ============================================================================
