-- قوالب العقود + التزامات/مواعيد العقد المستخرَجة بالذكاء الاصطناعي
-- 2026-08-11
--
-- جزآن:
--   ١. جدول contract_templates — قوالب Word (.docx) بمتغيرات {{KEY}} تُدار من الإعدادات
--      بدل القالب الواحد المبرمَج في contractTemplate.ts.
--   ٢. توسعة جدول deadlines القائم (فارغ تماماً: صفر صفوف) ليخدم العقود كذلك،
--      بدل إنشاء جدول تاسع وخمسين. كان مربوطاً بالقضايا فقط وبلا حقول متابعة.

begin;

/* ======================= ١. قوالب العقود ======================= */

create table if not exists public.contract_templates (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text,
  file_url      text not null,                      -- ملف .docx في التخزين
  file_name     text,
  -- المتغيرات المكتشفة داخل القالب: [{"key":"NAME","label":"اسم الطرف الثاني"}]
  placeholders  jsonb not null default '[]'::jsonb,
  is_active     boolean not null default true,
  sort_order    integer not null default 0,
  created_by    uuid references public.team_members(id),
  deleted_at    timestamptz,
  deleted_by    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.contract_templates is
  'قوالب العقود بصيغة .docx بمتغيرات {{KEY}} — تُرفع وتُدار من الإعدادات';
comment on column public.contract_templates.placeholders is
  'المتغيرات المكتشفة آلياً من القالب مع تسمية عربية لكل واحد';

create index if not exists contract_templates_active_idx
  on public.contract_templates (sort_order, created_at desc)
  where deleted_at is null;

alter table public.contract_templates enable row level security;

drop policy if exists authenticated_all on public.contract_templates;
create policy authenticated_all on public.contract_templates
  for all to authenticated using (true) with check (true);

/* ============ ٢. توسعة deadlines لتشمل التزامات العقود ============ */

alter table public.deadlines
  add column if not exists engagement_id      uuid references public.engagements(id) on delete cascade,
  add column if not exists notes              text,
  add column if not exists notify_days_before integer not null default 7,
  add column if not exists source             text not null default 'manual',  -- manual | ai_contract
  add column if not exists assignee_id        uuid references public.team_members(id),
  add column if not exists created_by         uuid references public.team_members(id),
  add column if not exists deleted_at         timestamptz,
  add column if not exists deleted_by         text;

comment on column public.deadlines.engagement_id is 'العقد الذي نشأ عنه هذا الالتزام (إن وُجد)';
comment on column public.deadlines.source is 'مصدر الصف: manual = إدخال يدوي · ai_contract = استخراج آلي من ملف العقد';
comment on column public.deadlines.notify_days_before is 'كم يوماً قبل الاستحقاق يُنبَّه عليه';

-- الاستعلام الغالب: غير المحذوف وغير المنجَز مرتّباً بالتاريخ
create index if not exists deadlines_open_idx
  on public.deadlines (deadline_date)
  where deleted_at is null and coalesce(done, false) = false;

create index if not exists deadlines_engagement_idx
  on public.deadlines (engagement_id)
  where deleted_at is null;

/* ====== ٣. حقول العقد التي يستخرجها الذكاء الاصطناعي ====== */

alter table public.engagements
  add column if not exists auto_renew          boolean,
  add column if not exists notice_period_days  integer,
  add column if not exists extracted_at        timestamptz,
  add column if not exists extract_summary     text;

comment on column public.engagements.auto_renew is 'هل العقد يتجدد تلقائياً';
comment on column public.engagements.notice_period_days is 'مهلة الإشعار بالإنهاء بالأيام';
comment on column public.engagements.extract_summary is 'ملخّص العقد كما استخرجه الذكاء الاصطناعي';

commit;

-- ملحق مطبَّق بعد التحقق: Supabase منحت anon صلاحية SELECT تلقائياً على الجدول
-- الجديد. RLS يمنع فعلاً (أُثبت بنداء REST بمفتاح anon = قائمة فارغة)، لكن المنحة
-- تبقى قنبلة موقوتة لو أُضيفت سياسة متساهلة لاحقاً. انظر gotcha-supabase-revoke-public.
revoke all on public.contract_templates from anon;
