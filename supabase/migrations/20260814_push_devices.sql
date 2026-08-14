-- الإشعارات الفورية (APNs) لتطبيق الآيفون — أجهزة الموظفين ورموزها
-- 2026-08-14
--
-- الغرض: غرفة عمل المهام لا تعمل كأداة تعاون إلا إذا وصل المنشن وطلب الاعتماد
-- إلى جوال الموظف فوراً. الإشعار داخل النظام يفترض أن يكون فاتحاً للنظام أصلاً.

begin;

create table if not exists public.push_devices (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.team_members(id) on delete cascade,
  token        text not null,                 -- رمز APNs للجهاز
  platform     text not null default 'ios',
  device_name  text,
  last_seen_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  -- الرمز يخص جهازاً واحداً: تسجيل دخول موظف آخر على نفس الجهاز ينقل الملكية
  unique (token)
);

comment on table public.push_devices is
  'أجهزة الموظفين المسجَّلة لاستقبال الإشعارات الفورية (APNs)';
comment on column public.push_devices.token is
  'رمز APNs — يتغيّر عند إعادة تثبيت التطبيق فيُحدَّث بالتسجيل التالي';

create index if not exists push_devices_member_idx on public.push_devices (member_id);

alter table public.push_devices enable row level security;

drop policy if exists authenticated_all on public.push_devices;
create policy authenticated_all on public.push_devices
  for all to authenticated using (true) with check (true);

-- فخّ Supabase المسجَّل: المنصّة تمنح anon صلاحيات صريحة على كل جدول جديد
revoke all on public.push_devices from anon;

/* ===== أثر الإشعار: هل أُرسل فعلاً؟ (لا فشل صامت) ===== */

alter table public.notifications
  add column if not exists push_sent_at timestamptz,
  add column if not exists push_error   text;

comment on column public.notifications.push_error is
  'سبب فشل الإرسال الفوري إن فشل — يبقى الإشعار داخل النظام على أي حال';

commit;
