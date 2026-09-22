-- محرك الإشعارات العام (طلب المدير 2026-09-22): هذا النظام يحدّد **متى ولمن**،
-- وتُرسل الرسالة نفسها عبر نظام الـHub (هو مالك «كيف»: القوالب والإرسال).
--
-- جدولان:
--   notification_rules — قواعد يضبطها المدير من الواجهة: الحدث ومصدره وتوقيتات
--     التذكير والمستلم واسم القالب وخريطة متغيّراته.
--   notification_sends — سجل ما استُحق إرساله: صف واحد لكل (قاعدة × سجل × توقيت)،
--     يمنع التكرار ويحفظ نتيجة الـHub.
--
-- ⚠️ لا يُرسل هذا الترحيل شيئاً. القواعد تُنشأ **معطّلة** (is_active=false)،
--    والإرسال يُوصَل بالـHub بعد وصول تعريفات القوالب المعتمدة منه.

create table if not exists public.notification_rules (
  id uuid primary key default gen_random_uuid(),
  -- مفتاح ثابت يشير إليه الكود والسجل
  key text not null unique,
  name text not null,
  description text,

  -- مصدر الحدث: الجدول وعمود التاريخ الذي تُحسب منه التذكيرات
  -- session | appointment | poa | deadline | manual
  event_type text not null check (event_type in ('session','appointment','poa','deadline','manual')),
  source_table text,
  date_column text,
  -- شروط إضافية على الصفوف، مثل {"status":"active","deleted_at":null}
  filter jsonb not null default '{}'::jsonb,

  -- كم يوماً قبل التاريخ يُرسل: [30,7,1] و0 = يوم الحدث نفسه
  offsets_days int[] not null default '{}',
  -- ساعة الإرسال بتوقيت الرياض
  send_at_time time not null default '09:00',

  -- المستلم: الموكّل/جهة الاتصال المرتبطة بالسجل، أو مسؤول الملف، أو المدير
  recipient text not null default 'client' check (recipient in ('client','assignee','director')),

  -- القناة والقالب — اسم القالب المعتمد عند واتساب كما يسلّمه الـHub
  channel text not null default 'whatsapp' check (channel in ('whatsapp','sms','inapp')),
  template_name text,
  template_lang text not null default 'ar',
  -- ترتيب متغيّرات القالب: مصفوفة مسارات تُحلّ من سياق السجل،
  -- مثل ["contact.name","case.office_num","session.session_date|date_ar"]
  variables jsonb not null default '[]'::jsonb,

  is_active boolean not null default false,
  created_by uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.notification_rules is
  'قواعد الإشعارات: متى ولمن. الإرسال نفسه يتم عبر الـHub بالقالب المذكور هنا.';

create table if not exists public.notification_sends (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.notification_rules(id) on delete cascade,
  -- السجل الذي أنشأ الاستحقاق (جلسة/موعد/وكالة/مهلة)
  entity_table text not null,
  entity_id uuid not null,
  case_id uuid references public.cases(id),
  offset_days int not null,
  -- تاريخ الحدث نفسه، ولحظة الاستحقاق المحسوبة
  event_date date,
  due_at timestamptz not null,

  recipient_name text,
  recipient_phone text,
  template_name text,
  template_params jsonb not null default '[]'::jsonb,

  -- pending: استُحق ولم يُرسل بعد · sent · failed · skipped (بلا جوال مثلاً)
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

-- لا يُرسل التذكير نفسه مرتين لنفس السجل ونفس التوقيت
create unique index if not exists notification_sends_once_idx
  on public.notification_sends (rule_id, entity_id, offset_days);
create index if not exists notification_sends_status_idx
  on public.notification_sends (status, due_at desc);

alter table public.notification_rules enable row level security;
alter table public.notification_sends enable row level security;

-- القواعد: يقرؤها الموظف ويعدّلها المدير وحده (النمط المعتمد: (select fn()) مرة لكل سؤال)
drop policy if exists notification_rules_read on public.notification_rules;
create policy notification_rules_read on public.notification_rules
  for select to authenticated using (true);

drop policy if exists notification_rules_write on public.notification_rules;
create policy notification_rules_write on public.notification_rules
  for all to authenticated
  using ((select public.is_director_caller()))
  with check ((select public.is_director_caller()));

-- السجل: قراءة للموظفين (يظهر في صفحة الإشعارات)، والكتابة للخادم فقط
drop policy if exists notification_sends_read on public.notification_sends;
create policy notification_sends_read on public.notification_sends
  for select to authenticated using (true);

drop policy if exists notification_sends_write on public.notification_sends;
create policy notification_sends_write on public.notification_sends
  for all to authenticated
  using ((select public.is_director_caller()))
  with check ((select public.is_director_caller()));

-- حاجز المتعاون الخارجي: لا قواعد ولا سجل إرسال (نمط collab_block)
drop policy if exists collab_block on public.notification_rules;
create policy collab_block on public.notification_rules
  as restrictive for all to authenticated
  using ((not (select public.is_collaborator_caller())))
  with check ((not (select public.is_collaborator_caller())));

drop policy if exists collab_block on public.notification_sends;
create policy collab_block on public.notification_sends
  as restrictive for all to authenticated
  using ((not (select public.is_collaborator_caller())))
  with check ((not (select public.is_collaborator_caller())));

-- حاجز حساب مراجعة أبل: لا يرى إشعارات العملاء الحقيقيين
drop policy if exists reviewer_block on public.notification_sends;
create policy reviewer_block on public.notification_sends
  as restrictive for select to authenticated
  using ((not (select public.is_reviewer_caller())));

-- updated_at
create or replace function public.touch_notification_rule() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists notification_rules_touch on public.notification_rules;
create trigger notification_rules_touch before update on public.notification_rules
  for each row execute function public.touch_notification_rule();

-- القواعد الأولية — كلها **معطّلة** حتى يعتمد المدير نصوصها ويصل تعريف القالب من الـHub.
-- template_name يبقى فارغاً لما لم يصل قالبه بعد.
insert into public.notification_rules
  (key, name, description, event_type, source_table, date_column, filter, offsets_days, recipient, template_name, variables)
values
  ('session_reminder_client', 'تذكير الموكّل بجلسته',
   'يُذكَّر الموكّل بموعد جلسة قضيته قبل الموعد.',
   'session', 'sessions', 'session_date', '{}'::jsonb, '{7,1}', 'client', null,
   '["contact.name","case.office_num","session.session_date|date_ar","session.session_time|time12","session.court"]'::jsonb),

  ('appointment_confirm_client', 'تأكيد موعد الموكّل',
   'تأكيد الموعد أو الاستشارة المحجوزة، وتذكير قبل الموعد.',
   'appointment', 'appointments', 'appointment_date', '{"status":"confirmed"}'::jsonb, '{1,0}', 'client', null,
   '["appointment.client_name","appointment.appointment_date|date_ar","appointment.appointment_time|time12","appointment.reference_no"]'::jsonb),

  ('poa_expiry_client', 'تنبيه انتهاء وكالة',
   'تنبيه الموكّل باقتراب انتهاء وكالته. ⚠️ معطّل: الوكالات غير مربوطة بجهات الاتصال بعد (client_id فارغ).',
   'poa', 'powers_of_attorney', 'expiry_date', '{"status":"active"}'::jsonb, '{30,7,1}', 'client', null,
   '["poa.client_name","poa.poa_number","poa.expiry_date|date_ar","poa.expiry_date|days_left"]'::jsonb),

  ('deadline_notice', 'اقتراب مهلة نظامية',
   'تنبيه باقتراب مهلة على الملف. الافتراضي داخلي لمسؤول الملف لا للموكّل.',
   'deadline', 'deadlines', 'deadline_date', '{"done":false}'::jsonb, '{14,7,3,1}', 'assignee', null,
   '["deadline.title","case.office_num","deadline.deadline_date|date_ar","deadline.deadline_date|days_left"]'::jsonb),

  ('document_request_client', 'طلب مستند من الموكّل',
   'يُرسل يدوياً من الملف حين نحتاج مستنداً من الموكّل.',
   'manual', null, null, '{}'::jsonb, '{}', 'client', null,
   '["contact.name","request.document_name","case.office_num","request.due_date|date_ar"]'::jsonb)
on conflict (key) do nothing;
