-- الإجازة السنوية تُستحق شهرياً لا دفعة واحدة (تصحيح المدير 2026-09-23:
-- «الإجازة تحسب مباشرة مو لازم تكمل سنة، ٢١ يوم قسمة ١٢ شهر بالشهر ١٫٧٥»).
--
-- كانت الدالة تمنح ٢١ يوماً كاملة أول يوم في سنة الخدمة. الآن: كل شهر مكتمل من سنة
-- الخدمة الحالية = ٢١ ÷ ١٢ = ١٫٧٥ يوم (و٣٠ ÷ ١٢ = ٢٫٥ بعد خمس سنوات متصلة).
--
-- ⚠️ توافق التطبيق المنشور: iOS يفكّ entitlement/used/pending/remaining أعداداً صحيحة
--    (Int)، ورقم كسري مثل 13.25 يُسقط بطاقة الرصيد كلها. فتبقى هذه الأربعة صحيحة
--    (remaining = الجزء الصحيح من المستحق − المستخدم)، والدقيق في حقول جديدة:
--    accrued · remaining_exact · monthly_rate · months_accrued.

create or replace function public.leave_balance(p_member uuid default null)
returns jsonb
language plpgsql stable security definer
set search_path to 'public'
as $function$
declare
  v_me      uuid;
  v_member  uuid;
  v_join    date;
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

  select join_date into v_join from team_members where id = v_member;
  if v_join is null then
    return jsonb_build_object('member_id', v_member, 'join_date', null, 'missing_join_date', true);
  end if;
  if v_join > current_date then
    return jsonb_build_object('member_id', v_member, 'join_date', v_join, 'not_started', true);
  end if;

  v_years := extract(year from age(current_date, v_join))::int;
  v_start := (v_join + make_interval(years => v_years))::date;
  v_end   := (v_start + interval '1 year' - interval '1 day')::date;
  v_ent   := case when v_years >= v_after then v_senior else v_base end;

  -- الأشهر المكتملة من بداية سنة الخدمة الحالية (٠ في شهرها الأول، ١٢ لا تُبلغ داخل السنة)
  v_months  := (extract(year from age(current_date, v_start)) * 12
                + extract(month from age(current_date, v_start)))::int;
  v_rate    := round(v_ent / 12.0, 2);
  v_accrued := round(v_months * v_ent / 12.0, 2);

  select
    coalesce(sum(greatest(0, least(end_date, v_end) - greatest(start_date, v_start) + 1)) filter (where status = 'approved'), 0),
    coalesce(sum(greatest(0, least(end_date, v_end) - greatest(start_date, v_start) + 1)) filter (where status = 'pending'), 0)
    into v_used, v_pending
    from hr_requests
   where member_id = v_member and kind = 'leave' and leave_type = 'annual'
     and start_date <= v_end and end_date >= v_start;

  return jsonb_build_object(
    'member_id', v_member, 'join_date', v_join, 'missing_join_date', false,
    'years_of_service', v_years, 'service_year_start', v_start, 'service_year_end', v_end,
    'entitlement', v_ent, 'used', v_used, 'pending', v_pending,
    'remaining', trunc(v_accrued - v_used)::int,
    'accrual', 'monthly', 'monthly_rate', v_rate, 'months_accrued', v_months,
    'accrued', v_accrued, 'remaining_exact', v_accrued - v_used,
    'senior_after_years', v_after, 'counting', 'calendar_days');
end $function$;
