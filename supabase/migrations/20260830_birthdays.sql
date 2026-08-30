-- أعياد ميلاد الفريق: احتفال تلقائي صباح يوم الميلاد (07:00 الرياض) —
-- منشور نظام في قناة «عام — المكتب» + إشعار لكل الفريق (الدفع يطير تلقائياً).
-- الخصوصية: لا سنة ولا عمر في أي نص معروض.
-- مطبَّق على الإنتاج 2026-08-30 باسم birthdays.

create table if not exists birthday_celebrations (
  member_id uuid not null references team_members(id) on delete cascade,
  year int not null,
  created_at timestamptz not null default now(),
  primary key (member_id, year)
);
alter table birthday_celebrations enable row level security;
create policy authenticated_read on birthday_celebrations
  for select to authenticated using (true);
-- لا سياسات كتابة: الدالة المعرِّفة وحدها تكتب

create or replace function public.celebrate_birthdays()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  m record;
  v_greeting text;
begin
  for m in
    select id, coalesce(short_name, name) as display
    from team_members
    where is_active
      and date_of_birth is not null
      and to_char(date_of_birth, 'MM-DD') = to_char(v_today, 'MM-DD')
  loop
    -- احتفال واحد في السنة مهما أعيد تشغيل المهمة
    begin
      insert into birthday_celebrations (member_id, year)
      values (m.id, extract(year from v_today)::int);
    exception when unique_violation then
      continue;
    end;

    v_greeting := '🎉 اليوم عيد ميلاد ' || m.display || ' — كل عام وكل خير! 🎂';

    -- منشور نظام في القناة العامة «عام — المكتب» (case_id فارغ)
    insert into case_comments (case_id, author_id, body, kind, mentions, also_to_stream)
    values (null, null, v_greeting, 'system', '{}', false);

    -- إشعار للفريق النشط الموصول (حساب المراجعة بلا جوال فيسقط بالشرط)
    insert into notifications (type, title, message, recipient_id)
    select
      'birthday',
      case when tm.id = m.id
        then '🎂 كل عام وأنتم بخير!'
        else '🎉 عيد ميلاد ' || m.display end,
      case when tm.id = m.id
        then 'فريق المكتب يهنئكم بعيد ميلادكم — يوم سعيد!'
        else 'اليوم عيد ميلاد ' || m.display || ' — شاركوه التهنئة في قناة عام المكتب.' end,
      tm.id
    from team_members tm
    where tm.is_active and tm.auth_id is not null and tm.phone is not null;
  end loop;
end;
$$;

revoke all on function public.celebrate_birthdays() from public, anon, authenticated;

select cron.schedule(
  'birthday-celebrations',
  '0 4 * * *',  -- 07:00 صباحاً بتوقيت الرياض
  'select public.celebrate_birthdays()'
);
