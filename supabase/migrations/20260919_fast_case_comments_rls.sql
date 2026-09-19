-- سرعة النقاشات (طلب المدير 2026-09-19: «سريع جداً وسلس»).
-- سياسات case_comments كانت تستدعي can_access_case(case_id) وcan_access_thread(case_id) ودوال
-- «هل المنادي مدير/مراجع/متعاون» لكل رسالة، فتتكرر آلاف المرات في سؤال واحد (قائمة النقاشات
-- تعيد فحص الرسائل لكل نقاش). هنا يُحسب ما يخص المنادي **مرة واحدة** لكل سؤال:
--   (select fn()) ← initplan يُقيَّم مرة؛ والملفات المسموحة مصفوفة واحدة تُفحص عضويتها لكل رسالة.
-- المنطق مطابق حرفياً (تحقّق بانتحال ست هويات: الرسائل المرئية وقائمة النقاشات ونتائج الكتابة
-- متطابقة قبل وبعد). القياس: موظف 160ms→12ms، المدير 82ms→15ms لكل قائمة نقاشات.

-- الملفات التي يراها المنادي — مرآة can_access_case بلا فرعَي «الملف فارغ» و«المدير» (يبقيان في السياسة)
create or replace function public.my_accessible_case_ids() returns uuid[]
language sql stable security definer set search_path to 'public' as $f$
  select coalesce(array_agg(distinct x), '{}') from (
    select c.id as x from cases c where c.assignee_id = public.my_member_id()
    union select cm.case_id from case_members cm where cm.member_id = public.my_member_id()
    union select t.case_id from tasks t
           where t.case_id is not null and t.deleted_at is null
             and (t.assignee_id = public.my_member_id()
                  or exists (select 1 from task_participants tp
                             where tp.task_id = t.id and tp.member_id = public.my_member_id()))
    union select cm.channel_id from channel_members cm
           join team_members tm on tm.id = cm.member_id
           where tm.auth_id = auth.uid()
  ) s where x is not null
$f$;

-- القنوات المحجوبة عن المنادي — مرآة can_access_thread بلا فرعَي «فارغ» و«المدير»
create or replace function public.my_blocked_channel_ids() returns uuid[]
language sql stable security definer set search_path to 'public' as $f$
  select coalesce(array_agg(c.id), '{}') from cases c
  where c.kind = 'channel' and not public.is_channel_member(c.id)
$f$;

revoke all on function public.my_accessible_case_ids() from public, anon, authenticated;
revoke all on function public.my_blocked_channel_ids() from public, anon, authenticated;
grant execute on function public.my_accessible_case_ids() to authenticated;
grant execute on function public.my_blocked_channel_ids() to authenticated;

alter policy perm_case_scope on public.case_comments
  using (case_id is null or (select public.is_director_caller())
         or case_id = any((select public.my_accessible_case_ids())::uuid[]))
  with check (case_id is null or (select public.is_director_caller())
              or case_id = any((select public.my_accessible_case_ids())::uuid[]));

alter policy channel_comments_select_gate on public.case_comments
  using (case_id is null or (select public.current_is_director())
         or not (case_id = any((select public.my_blocked_channel_ids())::uuid[])));

alter policy channel_comments_insert_gate on public.case_comments
  with check (case_id is null or (select public.current_is_director())
              or not (case_id = any((select public.my_blocked_channel_ids())::uuid[])));

alter policy collab_needs_case on public.case_comments
  using ((not (select public.is_collaborator_caller()))
         or (case_id is not null and ((select public.is_director_caller())
             or case_id = any((select public.my_accessible_case_ids())::uuid[]))))
  with check ((not (select public.is_collaborator_caller()))
              or (case_id is not null and ((select public.is_director_caller())
                  or case_id = any((select public.my_accessible_case_ids())::uuid[]))));

alter policy collab_no_public_channel on public.case_comments
  using ((not (select public.is_collaborator_caller())) or case_id is not null)
  with check ((not (select public.is_collaborator_caller())) or case_id is not null);

alter policy reviewer_comments on public.case_comments
  using ((not (select public.is_reviewer_caller()))
         or case_id in (select cases.id from cases where cases.office_num like 'DEMO%'));

alter policy reviewer_write_comments on public.case_comments
  with check ((not (select public.is_reviewer_caller()))
              or case_id in (select cases.id from cases where cases.office_num like 'DEMO%'));
