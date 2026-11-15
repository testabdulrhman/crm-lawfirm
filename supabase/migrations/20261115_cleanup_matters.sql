-- «نظّف ملفاتك» — المراجعة الشاملة 2026-11-15، الدفعة الثانية (اعتمدها المدير):
-- ٢٧ من ٤٣ قضية جارية بلا جلسة قادمة ولا مهمة مفتوحة، و١٦ جلسة ماضية لم تُغلق، وحالة الجلسة مختلطة.

-- (١) حالة الجلسة بالعربية وحدها: الويب يكتب قادمة/منعقدة/مؤجّلة، وclose_session والمساعد يكتبان upcoming/held.
--     مشغّل يطبّع أي قيمة لحظة الحفظ (لا قيد يرفض — نسخ الآيفون القديمة تبقى تعمل)، ثم تُطبَّع القيم القائمة.
create or replace function public.sessions_normalize_status()
returns trigger language plpgsql set search_path = public as $$
begin
  new.status := case lower(btrim(coalesce(new.status, '')))
    when 'upcoming' then 'قادمة'
    when '' then 'قادمة'
    when 'held' then 'منعقدة'
    when 'postponed' then 'مؤجّلة'
    when 'مؤجلة' then 'مؤجّلة'
    else new.status
  end;
  return new;
end $$;

drop trigger if exists sessions_normalize_status_trg on public.sessions;
create trigger sessions_normalize_status_trg
  before insert or update of status on public.sessions
  for each row execute function public.sessions_normalize_status();

alter table public.sessions alter column status set default 'قادمة';
update public.sessions set status = status where status in ('upcoming', 'held', 'postponed', 'مؤجلة') or status is null;

-- (٢) عناصر التنظيف لمحامٍ واحد (الافتراضي: المتصل) أو للملفات بلا مسؤول.
--     security invoker: الصلاحيات (RLS) تحدّد ما يُرى — الموظف ملفاته، والمدير الكل.
create or replace function public.cleanup_items(p_member uuid default null, p_unassigned boolean default false)
returns json
language sql stable
set search_path = public
as $$
  with target as (
    select case when p_unassigned then null else coalesce(p_member, public.my_member_id()) end as mid
  ),
  cs as (
    select c.* from cases c, target t
    where c.deleted_at is null and c.status <> 'muntahia'
      and (case when p_unassigned then c.assignee_id is null else c.assignee_id = t.mid end)
  ),
  past as (
    select s.id, s.case_id, s.title, s.session_number, s.session_date, s.court,
           (public.riyadh_today() - s.session_date) as days_ago,
           c.title as case_title, c.office_num, c.kind
    from sessions s join cs c on c.id = s.case_id
    where s.closed_at is null and s.session_date < public.riyadh_today()
      and s.status is distinct from 'مؤجّلة'
  ),
  idle as (
    select c.id, c.title, c.office_num, c.kind, c.court,
           (select max(s.session_date) from sessions s where s.case_id = c.id) as last_session,
           (select max(r.ruling_date) from rulings r where r.case_id = c.id) as last_ruling,
           greatest(
             (select max(m.created_at) from case_comments m where m.case_id = c.id and m.deleted_at is null),
             (select max(d.created_at) from documents d where d.case_id = c.id and d.deleted_at is null),
             (select max(s.session_date)::timestamptz from sessions s where s.case_id = c.id),
             c.created_at
           ) as last_activity
    from cs c
    where c.kind = 'case' and c.status = 'jarri'
      and not exists (select 1 from sessions s where s.case_id = c.id and s.session_date >= public.riyadh_today())
      and not exists (select 1 from past p where p.case_id = c.id)
      and not exists (select 1 from tasks t where t.case_id = c.id and t.status = 'todo' and t.deleted_at is null)
  )
  select json_build_object(
    'sessions', coalesce((select json_agg(p order by p.session_date) from past p), '[]'::json),
    'cases',    coalesce((select json_agg(i order by i.last_activity) from idle i), '[]'::json)
  );
$$;

-- (٣) ملخّص المدير: عدد العناصر عند كل مسؤول (ومن بلا مسؤول). لغير المدير: لا شيء.
create or replace function public.cleanup_summary()
returns table (member_id uuid, member_name text, sessions_n int, cases_n int)
language sql stable
set search_path = public
as $$
  with live as (
    select c.* from cases c where c.deleted_at is null and c.status <> 'muntahia'
  ),
  past as (
    select c.assignee_id, s.case_id from sessions s join live c on c.id = s.case_id
    where s.closed_at is null and s.session_date < public.riyadh_today()
      and s.status is distinct from 'مؤجّلة'
  ),
  idle as (
    select c.assignee_id from live c
    where c.kind = 'case' and c.status = 'jarri'
      and not exists (select 1 from sessions s where s.case_id = c.id and s.session_date >= public.riyadh_today())
      and not exists (select 1 from past p where p.case_id = c.id)
      and not exists (select 1 from tasks t where t.case_id = c.id and t.status = 'todo' and t.deleted_at is null)
  ),
  agg as (
    select assignee_id, count(*)::int as s_n, 0 as c_n from past group by 1
    union all
    select assignee_id, 0, count(*)::int from idle group by 1
  )
  -- الاسم الكامل (المختصر قد يكون لاتينياً كاسم مستخدم)؛ وحساب مراجعة أبل ببياناته التجريبية خارج الملخّص
  select a.assignee_id, m.name, sum(a.s_n)::int, sum(a.c_n)::int
  from agg a left join team_members m on m.id = a.assignee_id
  where public.is_director_caller() and coalesce(m.is_reviewer, false) = false
  group by a.assignee_id, m.name
  order by sum(a.s_n) + sum(a.c_n) desc;
$$;

revoke all on function public.cleanup_items(uuid, boolean) from public, anon;
revoke all on function public.cleanup_summary() from public, anon;
grant execute on function public.cleanup_items(uuid, boolean) to authenticated;
grant execute on function public.cleanup_summary() to authenticated;
