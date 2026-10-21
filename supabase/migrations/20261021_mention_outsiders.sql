-- المنشن خارج فريق الملف (اقتراح محمد الجندي 90c17630 + قرار المدير 2026-10-21): بيان ذكرت محمداً في نقاش ملف
-- ليس في فريقه، فوصله الإشعار وفُتحت له صفحة فارغة (الحواجز تحجب النقاش). القرار: يُنبَّه الكاتب قبل الإرسال
-- «محمد لا يرى هذا الملف — أضفه للفريق؟»، والإضافة للمدير ومسؤول الملف كما هي القاعدة.
-- هذه الدالة تقول للكاتب: مَن من المذكورين لا يرى الملف، وهل يملك هو إضافتهم.
create or replace function public.mention_outsiders(p_case uuid, p_members uuid[])
 returns jsonb language sql stable security definer set search_path to 'public'
as $$
  with c as (
    select id, kind, assignee_id from cases
     where id = p_case and kind in ('case', 'legal_service', 'property', 'bankruptcy')
       and public.can_access_case(p_case)          -- لا يسأل عن ملف لا يراه
  ),
  m as (
    select tm.id, tm.name as name
      from team_members tm, c
     where tm.id = any(p_members) and coalesce(tm.is_active, true)
       and not coalesce(tm.is_director, false) and not coalesce(tm.can_view_all, false)
       and tm.id is distinct from c.assignee_id
       and not exists (select 1 from case_members cm where cm.case_id = c.id and cm.member_id = tm.id)
       and not exists (select 1 from tasks t where t.case_id = c.id and t.deleted_at is null
                         and (t.assignee_id = tm.id
                              or exists (select 1 from task_participants tp where tp.task_id = t.id and tp.member_id = tm.id)))
  )
  select jsonb_build_object(
    'outsiders', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name)) from m), '[]'::jsonb),
    'can_add', coalesce((select public.is_director_caller() or c.assignee_id = public.my_member_id() from c), false)
  )
$$;
revoke all on function public.mention_outsiders(uuid, uuid[]) from public, anon;
grant execute on function public.mention_outsiders(uuid, uuid[]) to authenticated;
