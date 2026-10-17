-- تاريخ انتهاء العلاقة العمالية وسببه (طلب المدير 2026-10-18) — تسجيل فقط: لا يوقف الحساب آلياً (قراره).
-- السبب اختياري لأن مكافأة نهاية الخدمة تختلف به (م٨٤ و٨٥ من نظام العمل).
alter table public.team_members
  add column if not exists end_date date,
  add column if not exists end_reason text;
alter table public.team_members drop constraint if exists team_members_end_reason_chk;
alter table public.team_members add constraint team_members_end_reason_chk
  check (end_reason is null or end_reason in ('resignation', 'termination', 'contract_end', 'mutual', 'other'));
alter table public.team_members drop constraint if exists team_members_end_after_join_chk;
alter table public.team_members add constraint team_members_end_after_join_chk
  check (end_date is null or join_date is null or end_date >= join_date);

-- يعدّلهما المدير وحده (كتاريخ التعيين)
create or replace function public.tm_guard_privilege_fields()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if public.is_director_caller() or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if new.is_director  is distinct from old.is_director
     or new.is_reviewer is distinct from old.is_reviewer
     or new.is_active   is distinct from old.is_active
     or new.auth_id     is distinct from old.auth_id
     or new.member_type is distinct from old.member_type
     or new.can_view_all is distinct from old.can_view_all then
    raise exception 'تغيير الصلاحيات أو حالة الحساب للمدير وحده';
  end if;
  if new.join_date is distinct from old.join_date
     or new.end_date  is distinct from old.end_date
     or new.end_reason is distinct from old.end_reason
     or new.name      is distinct from old.name
     or new.role      is distinct from old.role
     or new.email     is distinct from old.email
     or new.id_number is distinct from old.id_number then
    raise exception 'الاسم والمسمّى والبريد ورقم الهوية وتاريخا التعيين وانتهاء العلاقة يعدّلها المدير';
  end if;
  return new;
end $function$;

-- رصيد الإجازات يتوقف استحقاقه عند انتهاء العلاقة إن مضى (as_of) — فيُظهر المتبقي يوم الانتهاء، وهو ما يُعوَّض عنه
create or replace function public.leave_balance(p_member uuid default null::uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_me      uuid;
  v_member  uuid;
  v_join    date;
  v_left    date;
  v_asof    date;
  v_years   int;
  v_start   date;
  v_end     date;
  v_base    int := coalesce((select nullif(regexp_replace(value, '[^0-9]', '', 'g'), '')::int
                               from lookup_values where type = 'hr_config' and label = 'annual_days' limit 1), 21);
  v_senior  int := coalesce((select nullif(regexp_replace(value, '[^0-9]', '', 'g'), '')::int
                               from lookup_values where type = 'hr_config' and label = 'annual_days_senior' limit 1), 30);
  v_after   int := coalesce((select nullif(regexp_replace(value, '[^0-9]', '', 'g'), '')::int
                               from lookup_values where type = 'hr_config' and label = 'senior_after_years' limit 1), 5);
  v_ent     int;
  v_months  int;
  v_rate    numeric;
  v_accrued numeric;
  v_used    int;
  v_pending int;
begin
  select id into v_me from team_members where auth_id = auth.uid() limit 1;
  v_member := coalesce(p_member, v_me);
  if v_member is null then
    raise exception 'لم يُعرف الموظف';
  end if;
  if v_member is distinct from v_me and not public.is_director_caller() then
    raise exception 'رصيد الإجازات لصاحبه وللمدير فقط';
  end if;

  select join_date, end_date into v_join, v_left from team_members where id = v_member;
  if v_join is null then
    return jsonb_build_object('member_id', v_member, 'join_date', null, 'missing_join_date', true);
  end if;
  if v_join > current_date then
    return jsonb_build_object('member_id', v_member, 'join_date', v_join, 'not_started', true);
  end if;
  v_asof := least(current_date, coalesce(v_left, current_date));

  v_years  := extract(year from age(v_asof, v_join))::int;
  v_ent    := case when v_years >= v_after then v_senior else v_base end;
  v_rate   := round(v_ent / 12.0, 2);
  v_start  := (v_join + make_interval(years => v_years))::date;
  v_end    := (v_start + interval '1 year' - interval '1 day')::date;

  v_months  := (extract(year from age(v_asof, v_join)) * 12
                + extract(month from age(v_asof, v_join)))::int;
  v_accrued := round(
      least(v_months, v_after * 12) * v_base / 12.0
    + greatest(v_months - v_after * 12, 0) * v_senior / 12.0, 2);

  select
    coalesce(sum(greatest(0, end_date - greatest(start_date, v_join) + 1)) filter (where status = 'approved'), 0),
    coalesce(sum(greatest(0, end_date - greatest(start_date, v_join) + 1)) filter (where status = 'pending'), 0)
    into v_used, v_pending
    from hr_requests
   where member_id = v_member and kind = 'leave' and leave_type = 'annual'
     and end_date >= v_join;

  return jsonb_build_object(
    'member_id', v_member, 'join_date', v_join, 'missing_join_date', false,
    'end_date', v_left, 'as_of', v_asof, 'ended', v_left is not null and v_left <= current_date,
    'years_of_service', v_years, 'service_year_start', v_start, 'service_year_end', v_end,
    'entitlement', trunc(v_accrued)::int, 'annual_days', v_ent,
    'used', v_used, 'pending', v_pending,
    'remaining', trunc(v_accrued - v_used)::int,
    'accrual', 'monthly_since_join', 'monthly_rate', v_rate, 'months_accrued', v_months,
    'accrued', v_accrued, 'remaining_exact', v_accrued - v_used,
    'senior_after_years', v_after, 'counting', 'calendar_days');
end $function$;
