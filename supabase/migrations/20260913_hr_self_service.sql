-- «صفحتي» — الخدمة الذاتية للموظف (طلب المدير 2026-09-13: «تطبيق الأيفون ودي يكون الموظف
-- يقدر يستفيد منه، يقدم على إجازة ويستأذن»). اختار: القسم الأول كاملاً + رصيد الإجازات.
--
-- طلبات الموظفين موجودة في الويب منذ مدة ولم يُقدَّم عبرها إلا طلبان — الموظف يعيش في الجوال.
-- هذه الهجرة تجهّز القاعدة لصفحة الموظف في التطبيق والويب:

-- ── ١) رصيد الإجازة السنوية ──
-- ٢١ يوماً عن كل سنة خدمة، و٣٠ متى أتمّ خمس سنوات متصلة (المادة ١٠٩ من نظام العمل).
-- يُحسب لسنة الخدمة الجارية (من ذكرى التعيين إلى ما قبل الذكرى التالية) ويُخصم منه المعتمد
-- من الإجازات السنوية داخلها، ويُعرض المعلّق منفصلاً. الأيام بأيام التقويم شاملة الطرفين —
-- نفس عدّ الطلبات في الويب (hrDays). القيم قابلة للضبط من lookup_values (hr_config).
create or replace function public.leave_balance(p_member uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
    'entitlement', v_ent, 'used', v_used, 'pending', v_pending, 'remaining', v_ent - v_used,
    'senior_after_years', v_after, 'counting', 'calendar_days');
end $$;

revoke all on function public.leave_balance(uuid) from public, anon;
grant execute on function public.leave_balance(uuid) to authenticated;

-- ── ٢) الموظف يحدّث بياناته بنفسه — لكن الهوية الوظيفية وتاريخ التعيين للمدير ──
-- سياسة tm_update_scope تسمح للموظف بتعديل صفه أصلاً؛ وكان الحارس يمنع الصلاحيات وحدها،
-- فكان يستطيع تغيير تاريخ تعيينه (أساس الرصيد) أو اسمه ومسمّاه.
create or replace function public.tm_guard_privilege_fields()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if public.is_director_caller() then return new; end if;
  if new.is_director  is distinct from old.is_director
     or new.is_reviewer is distinct from old.is_reviewer
     or new.is_active   is distinct from old.is_active
     or new.auth_id     is distinct from old.auth_id
     or new.member_type is distinct from old.member_type then
    raise exception 'تغيير الصلاحيات أو حالة الحساب للمدير وحده';
  end if;
  if new.join_date is distinct from old.join_date
     or new.name      is distinct from old.name
     or new.role      is distinct from old.role
     or new.email     is distinct from old.email
     or new.id_number is distinct from old.id_number then
    raise exception 'الاسم والمسمّى والبريد ورقم الهوية وتاريخ التعيين يعدّلها المدير';
  end if;
  return new;
end $function$;

-- ── ٣) حساب مراجعة أبل: يرى طلباته هو (وإلا بدت الميزة معطّلة للمراجِع) ولا يُزعج المدير ──
drop policy if exists reviewer_hr_requests on public.hr_requests;
create policy reviewer_hr_requests on public.hr_requests as restrictive for select to authenticated
  using (not is_reviewer_caller()
         or member_id in (select id from team_members where auth_id = auth.uid()));

create or replace function public.hr_request_notify_insert()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare v_name text; v_when text;
begin
  if exists (select 1 from team_members where id = new.member_id and coalesce(is_reviewer, false)) then
    return new;
  end if;
  select coalesce(short_name, name) into v_name from team_members where id = new.member_id;
  v_when := case when new.kind = 'permission'
                 then to_char(new.start_date, 'YYYY-MM-DD') || coalesce(' ' || to_char(new.from_time, 'HH24:MI') || '–' || to_char(new.to_time, 'HH24:MI'), '')
                 when new.start_date = new.end_date then to_char(new.start_date, 'YYYY-MM-DD')
                 else to_char(new.start_date, 'YYYY-MM-DD') || ' → ' || to_char(new.end_date, 'YYYY-MM-DD') end;
  insert into notifications (type, title, message, recipient_id)
  select 'hr_request',
         'طلب ' || hr_kind_label(new.kind) || ' من ' || coalesce(v_name, 'موظف'),
         v_when || coalesce(' — ' || left(new.reason, 120), ''),
         id
    from team_members where is_director = true and coalesce(is_active, true) and id <> new.member_id;
  return new;
end $function$;

-- ── ٤) وجهة إشعارات الموظفين في التطبيق ──
-- كانت تسقط إلى '/' (الصفحة الرئيسية) — نفس علّة إشعار حجز الموعد.
create or replace function public.notification_push_dispatch()
returns trigger language plpgsql security definer
set search_path to 'public', 'extensions' as $function$
declare
  fn_url text; akey text; secret text; v_route text;
begin
  if new.recipient_id is null then return new; end if;
  if public.notification_pref_mode(new.recipient_id, new.type) = 'inapp' then return new; end if;

  select value into fn_url from public.lookup_values
   where type = 'push_config' and label = 'function_url' limit 1;
  select value into akey from public.lookup_values
   where type = 'discussion_ai_config' and label = 'anon_key' limit 1;
  select value into secret from public.lookup_values
   where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1;
  if fn_url is null or akey is null or secret is null then return new; end if;

  v_route := case
    when new.task_id is not null then '/tasks/' || new.task_id
    when new.type = 'mention' and new.case_id is not null
      then '/discussions?case=' || new.case_id
    when new.type = 'mention' then '/discussions'
    when new.case_id is not null then '/cases/' || new.case_id
    when new.type like 'appointment%' then '/appointments'
    when new.type = 'hr_request' then '/hr/approvals'
    when new.type = 'hr_result' then '/me'
    else '/'
  end;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || akey,
                 'x-ai-secret',   secret),
    body    := jsonb_build_object(
                 'member_ids',       jsonb_build_array(new.recipient_id),
                 'title',            coalesce(new.title, 'إشعار'),
                 'message',          coalesce(new.message, ''),
                 'route',            v_route,
                 'notification_ids', jsonb_build_array(new.id))
  );
  return new;
exception when others then
  return new;
end; $function$;
