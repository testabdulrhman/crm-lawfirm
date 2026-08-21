-- عزل حساب مراجعة App Store (قرار المستخدم 2026-08-22: الخيار «ب» —
-- سرية الموكلين أولى): دور is_reviewer محصور ببيانات DEMO فقط.
--
-- الآلية: سياسات RESTRICTIVE على الجداول الحساسة — تُضاف فوق السياسات
-- الحالية (AND) فلا تغيّر شيئاً على الموظفين (الشرط الأول يمررهم)،
-- والمراجع لا يرى إلا صفوف العرض التجريبي. كل دوال القراءة invoker
-- فتمر عبر هذه السياسات تلقائياً (تحقق pg_proc.prosecdef).

begin;

alter table public.team_members
  add column if not exists is_reviewer boolean not null default false;

create or replace function public.is_reviewer_caller() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select is_reviewer from team_members where auth_id = auth.uid() limit 1),
    false
  );
$$;
revoke execute on function public.is_reviewer_caller() from anon, public;
grant execute on function public.is_reviewer_caller() to authenticated;

-- الملفات: المراجع يرى DEMO فقط
drop policy if exists reviewer_cases on public.cases;
create policy reviewer_cases on public.cases
  as restrictive for select to authenticated
  using (not is_reviewer_caller() or office_num like 'DEMO%');

-- توابع الملف: عبر انتماء الملف لـDEMO
drop policy if exists reviewer_sessions on public.sessions;
create policy reviewer_sessions on public.sessions
  as restrictive for select to authenticated
  using (not is_reviewer_caller()
         or case_id in (select id from cases where office_num like 'DEMO%'));

drop policy if exists reviewer_tasks on public.tasks;
create policy reviewer_tasks on public.tasks
  as restrictive for select to authenticated
  using (not is_reviewer_caller()
         or case_id in (select id from cases where office_num like 'DEMO%'));

drop policy if exists reviewer_documents on public.documents;
create policy reviewer_documents on public.documents
  as restrictive for select to authenticated
  using (not is_reviewer_caller()
         or case_id in (select id from cases where office_num like 'DEMO%'));

drop policy if exists reviewer_comments on public.case_comments;
create policy reviewer_comments on public.case_comments
  as restrictive for select to authenticated
  using (not is_reviewer_caller()
         or case_id in (select id from cases where office_num like 'DEMO%'));

drop policy if exists reviewer_rulings on public.rulings;
create policy reviewer_rulings on public.rulings
  as restrictive for select to authenticated
  using (not is_reviewer_caller()
         or case_id in (select id from cases where office_num like 'DEMO%'));

-- مواعيد ووكالات: التجريبي فقط (بالتسمية)
drop policy if exists reviewer_appointments on public.appointments;
create policy reviewer_appointments on public.appointments
  as restrictive for select to authenticated
  using (not is_reviewer_caller() or client_name like '%تجريبي%');

drop policy if exists reviewer_poa on public.powers_of_attorney;
create policy reviewer_poa on public.powers_of_attorney
  as restrictive for select to authenticated
  using (not is_reviewer_caller() or client_name like '%تجريبي%');

-- إشعاراته هو فقط
drop policy if exists reviewer_notifications on public.notifications;
create policy reviewer_notifications on public.notifications
  as restrictive for select to authenticated
  using (not is_reviewer_caller()
         or recipient_id in (select id from team_members where auth_id = auth.uid()));

-- جداول لا يراها المراجع إطلاقاً
drop policy if exists reviewer_contacts on public.contacts;
create policy reviewer_contacts on public.contacts
  as restrictive for select to authenticated
  using (not is_reviewer_caller());

drop policy if exists reviewer_sms on public.sms_log;
create policy reviewer_sms on public.sms_log
  as restrictive for select to authenticated
  using (not is_reviewer_caller());

drop policy if exists reviewer_activity on public.activity_log;
create policy reviewer_activity on public.activity_log
  as restrictive for select to authenticated
  using (not is_reviewer_caller());

drop policy if exists reviewer_engagements on public.engagements;
create policy reviewer_engagements on public.engagements
  as restrictive for select to authenticated
  using (not is_reviewer_caller());

drop policy if exists reviewer_letters on public.outgoing_letters;
create policy reviewer_letters on public.outgoing_letters
  as restrictive for select to authenticated
  using (not is_reviewer_caller());

drop policy if exists reviewer_memos on public.memos;
create policy reviewer_memos on public.memos
  as restrictive for select to authenticated
  using (not is_reviewer_caller());

drop policy if exists reviewer_payroll on public.payroll_entries;
create policy reviewer_payroll on public.payroll_entries
  as restrictive for select to authenticated
  using (not is_reviewer_caller());

drop policy if exists reviewer_applications on public.staff_applications;
create policy reviewer_applications on public.staff_applications
  as restrictive for select to authenticated
  using (not is_reviewer_caller());

drop policy if exists reviewer_email on public.email_messages;
create policy reviewer_email on public.email_messages
  as restrictive for select to authenticated
  using (not is_reviewer_caller());

-- إعدادات lookup: يُحجب عنه كل ما يشبه config (أسرار التكاملات)
drop policy if exists reviewer_lookups on public.lookup_values;
create policy reviewer_lookups on public.lookup_values
  as restrictive for select to authenticated
  using (not is_reviewer_caller() or type not like '%config%');

-- والكتابة: المراجع لا يكتب إلا رسائل نقاش في DEMO ومهامه (تجربة الإرسال)
drop policy if exists reviewer_write_comments on public.case_comments;
create policy reviewer_write_comments on public.case_comments
  as restrictive for insert to authenticated
  with check (not is_reviewer_caller()
              or case_id in (select id from cases where office_num like 'DEMO%'));

commit;

-- (لاحقاً بنفس اليوم — تحليلات المنصتين) عمود platform + حجب المراجع عن الاستخدام
-- طُبّق مباشرة كـ usage_platform migration:
-- alter usage_sessions/usage_daily add platform default 'web'
-- + سياستا reviewer_usage_* التقييديتان
