-- تذكيرات الجلسات تصير إشعار تطبيق (قرار المستخدم 2026-08-30):
-- «ما أحتاجها SMS أو واتساب — يكفي الإشعار بالتطبيق».
-- توسعة الدالتين: إرجاع lawyer_id وcase_id (للإشعار وربطه بالقضية)،
-- وإسقاط شرط الجوال — الإشعار لا يحتاج جوالاً.
-- مطبَّق على الإنتاج 2026-08-30 باسم session_reminders_app_notify،
-- ومعه نُشرت session-reminders v4 (إدراج notifications بدل Msegat).

drop function if exists public.sessions_day_reminders();
create function public.sessions_day_reminders()
returns table(session_id uuid, case_id uuid, case_title text, session_date date,
              session_time time, court text, lawyer_id uuid, lawyer_name text)
language sql stable security definer set search_path to 'public'
as $$
  select se.id, c.id, c.title, se.session_date, se.session_time, se.court, tm.id, tm.name
  from sessions se
  join cases c on c.id = se.case_id
  join team_members tm on tm.id = c.assignee_id
  where se.session_date = current_date + 1
    and se.closed_at is null
    and se.reminder_day_sent_at is null;
$$;

drop function if exists public.sessions_30min_reminders();
create function public.sessions_30min_reminders()
returns table(session_id uuid, case_id uuid, case_title text, session_date date,
              session_time time, court text, lawyer_id uuid, lawyer_name text)
language sql stable security definer set search_path to 'public'
as $$
  with now_ksa as (select (now() at time zone 'Asia/Riyadh') as ts)
  select se.id, c.id, c.title, se.session_date, se.session_time, se.court, tm.id, tm.name
  from sessions se
  join cases c on c.id = se.case_id
  join team_members tm on tm.id = c.assignee_id, now_ksa
  where se.session_date = (now_ksa.ts)::date
    and se.closed_at is null
    and se.reminder_30_sent_at is null
    and se.session_time is not null
    -- الفرق بين وقت الجلسة والوقت الحالي بين 25 و35 دقيقة
    and extract(epoch from (se.session_time - (now_ksa.ts)::time)) between 1500 and 2100;
$$;

revoke all on function public.sessions_day_reminders() from public, anon, authenticated;
revoke all on function public.sessions_30min_reminders() from public, anon, authenticated;
