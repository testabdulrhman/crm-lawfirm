-- «لوحتي» تعرض وكالات ملفاتي فقط (اقتراح تعديل 2026-10-10 من مستشار بلا ملفات: «الوكالات ما لي دخل فيهن»).
-- كانت expiring_poas (العدد والقائمة) تتجاهل p_scope فتظهر وكالات المكتب كله في رئيسية الآيفون لكل موظف.
-- الآن: في 'mine' وكالات الملفات التي أنا مسؤولها أو عضو فريقها؛ والوكالة بلا ملف تبقى في «لوحة المكتب» وحدها.
create or replace function public.dashboard_overview(p_scope text default 'all'::text)
 returns json
 language sql
 stable
 set search_path to 'public'
as $function$
  with me as (
    select id as tm_id from team_members where auth_id = auth.uid() limit 1
  ),
  my_cases as (
    select id from cases where assignee_id = (select tm_id from me)
    union
    select case_id from case_members where member_id = (select tm_id from me)
  )
  select json_build_object(
    'scope', p_scope,
    'stats', json_build_object(
      'cases_total', (select count(*) from cases where kind = 'case'),
      'cases_active', (select count(*) from cases where kind = 'case' and status='jarri'),
      'contacts', (select count(*) from contacts),
      'staff_active', (select count(*) from team_members where is_active=true),
      'open_tasks', (select count(*) from tasks tk
        where tk.status='todo'
        and (p_scope='all' or tk.assignee_id = (select tm_id from me))),
      'overdue_tasks', (select count(*) from tasks tk
        where tk.status='todo' and tk.due_date < CURRENT_DATE
        and (p_scope='all' or tk.assignee_id = (select tm_id from me))),
      'upcoming_sessions', (select count(*) from sessions se
        where se.session_date >= CURRENT_DATE
        and (p_scope='all' or se.case_id in (select id from cases where assignee_id = (select tm_id from me)))),
      'upcoming_appointments', (select count(*) from appointments where appointment_date >= CURRENT_DATE and status='confirmed'),
      'pending_applications', (select count(*) from staff_applications where status='pending' and deleted_at is null),
      'pending_requests', (select count(*) from incoming_requests where status='under_review'),
      'expiring_poas', (select count(*) from powers_of_attorney where deleted_at is null and status='active' and expiry_date between CURRENT_DATE and CURRENT_DATE + 30
        and (p_scope='all' or case_id in (select id from my_cases)))
    ),
    'upcoming_sessions', (select coalesce(json_agg(s), '[]'::json) from (
      select se.id, se.case_id, se.title, se.session_date, se.session_time, se.court,
             c.title as case_title, c.office_num
      from sessions se left join cases c on c.id = se.case_id
      where se.session_date >= CURRENT_DATE
        and (p_scope='all' or c.assignee_id = (select tm_id from me))
      order by se.session_date, se.session_time limit 8
    ) s),
    'tasks', (select coalesce(json_agg(t), '[]'::json) from (
      select tk.id, tk.case_id, tk.title, tk.due_date, tk.priority, tk.is_urgent,
             (tk.due_date < CURRENT_DATE) as overdue,
             c.title as case_title
      from tasks tk left join cases c on c.id = tk.case_id
      where tk.status='todo'
        and (p_scope='all' or tk.assignee_id = (select tm_id from me))
      order by tk.is_urgent desc, (tk.due_date < CURRENT_DATE) desc,
               tk.due_date asc nulls last limit 8
    ) t),
    'appointments', (select coalesce(json_agg(a), '[]'::json) from (
      select ap.id, ap.client_name, ap.appointment_date, ap.appointment_time, ap.status
      from appointments ap where ap.appointment_date >= CURRENT_DATE
      order by ap.appointment_date, ap.appointment_time limit 5
    ) a),
    'applications', (select coalesce(json_agg(ap), '[]'::json) from (
      select id, full_name, qualifications, created_at, (cv_url is not null) as has_cv
      from staff_applications where status='pending' and deleted_at is null
      order by created_at desc limit 5
    ) ap),
    'requests', (select coalesce(json_agg(r), '[]'::json) from (
      select id, client_name, request_type, description, created_at
      from incoming_requests where status='under_review'
      order by created_at desc limit 5
    ) r),
    'expiring_poas', (select coalesce(json_agg(p), '[]'::json) from (
      select id, poa_number, client_name, expiry_date, (expiry_date - CURRENT_DATE) as days_left
      from powers_of_attorney
      where deleted_at is null and status='active'
        and expiry_date between CURRENT_DATE and CURRENT_DATE + 30
        and (p_scope='all' or case_id in (select id from my_cases))
      order by expiry_date asc limit 5
    ) p)
  );
$function$;
