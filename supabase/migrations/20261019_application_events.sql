-- سجلّ طلب التوظيف (طلب المدير 2026-10-19: «اذا دخلت ملف كل متقدم اعرف السجل — ارسلت له استقبال الطلب، طلبت
-- منه استكمال، أو انه استكمل»). كانت الرسائل في sms_log مربوطة بالجوال لا بالطلب، والاستكمال لا يُسجَّل إطلاقاً.
create table if not exists public.staff_application_events (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.staff_applications(id) on delete cascade,
  kind text not null check (kind in ('submitted', 'received_msg', 'completion_requested', 'completed',
                                     'analyzed', 'rejected', 'rejection_msg', 'approved', 'credentials_msg', 'reopened')),
  channel text check (channel in ('sms', 'whatsapp')),
  ok boolean,
  detail text,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists staff_application_events_app on public.staff_application_events(application_id, created_at);

alter table public.staff_application_events enable row level security;
-- يقرأ ويضيف من يرى الطلب نفسه (RLS طلبات التوظيف داخل الاستعلام)؛ ولا تعديل ولا حذف — سجلٌّ إثباتي
drop policy if exists app_events_select on public.staff_application_events;
create policy app_events_select on public.staff_application_events for select to authenticated
  using (exists (select 1 from public.staff_applications a where a.id = application_id));
drop policy if exists app_events_insert on public.staff_application_events;
create policy app_events_insert on public.staff_application_events for insert to authenticated
  with check (exists (select 1 from public.staff_applications a where a.id = application_id)
              and not public.is_collaborator_caller() and not public.is_reviewer_caller());
grant select, insert on public.staff_application_events to authenticated;
revoke all on public.staff_application_events from anon;

-- ===== ملء التاريخ =====
-- التقديم
insert into public.staff_application_events (application_id, kind, detail, created_at)
select a.id, 'submitted', case when a.cv_url is not null then 'مع السيرة الذاتية' else 'بلا سيرة ذاتية' end, a.created_at
  from public.staff_applications a
 where not exists (select 1 from public.staff_application_events e where e.application_id = a.id and e.kind = 'submitted');

-- الرسائل: من sms_log بمطابقة آخر ٩ أرقام للجوال وبعد التقديم
insert into public.staff_application_events (application_id, kind, channel, ok, actor, created_at)
select a.id,
       case
         when l.message like '[قالب: crm_law_09]%' or l.sent_by = 'نظام (تقديم وظيفة)' or l.message ilike '%نفيدكم باستلام طلبكم%' then 'received_msg'
         when l.message like '[قالب: crm_law_10]%' or l.message ilike '%careers/complete%' then 'completion_requested'
         when l.message like '[قالب: crm_law_11]%' or l.message ilike '%نعتذر عن عدم%' then 'rejection_msg'
         when l.message like '[قالب: crm_law_12]%' or l.message ilike '%كلمة المرور%' then 'credentials_msg'
       end,
       case when l.sent_by = 'whatsapp' then 'whatsapp' else 'sms' end,
       l.status = 'sent',
       case when l.sent_by in ('whatsapp', 'نظام (تقديم وظيفة)') then null else l.sent_by end,
       l.created_at
  from public.staff_applications a
  join public.sms_log l
    on right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 9)
   and length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 9
   and l.created_at >= a.created_at - interval '2 minutes'
   and coalesce(l.status, '') <> 'incoming'
 where (l.message like '[قالب: crm_law_09]%' or l.sent_by = 'نظام (تقديم وظيفة)' or l.message ilike '%نفيدكم باستلام طلبكم%'
        or l.message like '[قالب: crm_law_10]%' or l.message ilike '%careers/complete%'
        or l.message like '[قالب: crm_law_11]%' or l.message ilike '%نعتذر عن عدم%'
        or l.message like '[قالب: crm_law_12]%' or l.message ilike '%كلمة المرور%')
   and not exists (select 1 from public.staff_application_events e where e.application_id = a.id and e.kind <> 'submitted' and e.created_at = l.created_at);

-- الاستكمال: ملفات رُفعت بعد التقديم بعشر دقائق فأكثر — توقيت الرفع في اسم الملف (…/<Date.now()>_<tag>.<ext>)
insert into public.staff_application_events (application_id, kind, detail, created_at)
select x.id, 'completed', string_agg(x.label, '، ' order by x.label), max(x.at)
  from (
    select a.id, d.label, to_timestamp(substring(d.url from '/(\d{13})_[a-z]+\.[a-z0-9]+$')::bigint / 1000.0) at, a.created_at
      from public.staff_applications a,
           lateral (values ('السيرة الذاتية', a.cv_url), ('شهادة المؤهل', a.qualification_doc_url), ('رخصة المحاماة', a.lawyer_license_url)) d(label, url)
     where d.url ~ '/\d{13}_[a-z]+\.[a-z0-9]+$'
  ) x
 where x.at > x.created_at + interval '10 minutes'
   and not exists (select 1 from public.staff_application_events e where e.application_id = x.id and e.kind = 'completed')
 group by x.id;

-- القرار والتحليل
insert into public.staff_application_events (application_id, kind, actor, created_at)
select a.id, case a.status when 'rejected' then 'rejected' else 'approved' end, a.reviewed_by, a.reviewed_at
  from public.staff_applications a
 where a.status in ('rejected', 'approved') and a.reviewed_at is not null
   and not exists (select 1 from public.staff_application_events e where e.application_id = a.id and e.kind in ('rejected', 'approved'));
insert into public.staff_application_events (application_id, kind, actor, detail, created_at)
select x.application_id, 'analyzed', x.analyzed_by,
       case when x.fit_score is not null then 'مؤشر الملاءمة ' || x.fit_score || '/10' end, x.analyzed_at
  from public.staff_application_analysis x
 where x.analyzed_at is not null
   and not exists (select 1 from public.staff_application_events e where e.application_id = x.application_id and e.kind = 'analyzed');

-- تصحيح: من قدّم مراراً خلال دقائق بالجوال نفسه اختلطت رسائل استلامه بين طلباته — كل رسالة لأقرب طلب سبقها
delete from public.staff_application_events where kind = 'received_msg';
insert into public.staff_application_events (application_id, kind, channel, ok, created_at)
select distinct on (l.id) a.id, 'received_msg', case when l.sent_by = 'whatsapp' then 'whatsapp' else 'sms' end, l.status = 'sent', l.created_at
  from public.sms_log l
  join public.staff_applications a
    on right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 9)
   and length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 9
   and a.created_at <= l.created_at + interval '2 minutes'
   and l.created_at <= a.created_at + interval '10 minutes'
 where (l.message like '[قالب: crm_law_09]%' or l.sent_by = 'نظام (تقديم وظيفة)' or l.message ilike '%نفيدكم باستلام طلبكم%')
   and coalesce(l.status, '') <> 'incoming'
 order by l.id, a.created_at desc;
