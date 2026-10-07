-- قرار المدير 2026-10-07 («نعم»): راكان (المساعد الإداري — can_view_all) يضيف ويعدّل في كل أقسام الملفات
-- التي يطّلع عليها، والحذف يبقى للمدير. بعد بلاغين في يوم واحد (النقاشات ثم المهام) من الفجوة نفسها:
-- القراءة is_office_viewer_caller والإضافة/التعديل is_director_caller.
-- يشمل: كل جداول perm_case_scope_* (الجلسات، الأطراف، الوكالات، الصادر، المذكرات، الأحكام، المهل، فحص
-- التعارض، دراسة القضية ومقترحاتها ونسخها، ملخّص الجلسة، إشعارات الملف، مشاريع الملف، المستندات…)
-- وتعديل بيانات الملف نفسه (perm_case_update). وتبقى: حذف الكل للمدير (perm_case_scope_del / perm_delete_director
-- / guard_soft_delete)، والقنوات الخاصة والمحادثات المباشرة على حواجزها.
-- (يُعاد هنا ما سبق في _can_discuss و_can_task على role authenticated كالأصل بدل public.)

do $$
declare t text;
  cond text := '(case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[]))';
begin
  for t in
    select distinct polrelid::regclass::text from pg_policy
     where polname = 'perm_case_scope_ins' and polrelid::regclass::text not like 'pg_%'
  loop
    execute format('drop policy if exists perm_case_scope_ins on %s', t);
    execute format('create policy perm_case_scope_ins on %s as restrictive for insert to authenticated with check (%s)', t, cond);
  end loop;
  for t in
    select distinct polrelid::regclass::text from pg_policy where polname = 'perm_case_scope_upd'
  loop
    execute format('drop policy if exists perm_case_scope_upd on %s', t);
    execute format('create policy perm_case_scope_upd on %s as restrictive for update to authenticated using (%s) with check (%s)', t, cond, cond);
  end loop;
end $$;

drop policy if exists perm_case_update on public.cases;
create policy perm_case_update on public.cases as restrictive for update to authenticated
  using ((id is null) or (select is_office_viewer_caller()) or (id = any ((select my_accessible_case_ids())::uuid[])))
  with check ((id is null) or (select is_office_viewer_caller()) or (id = any ((select my_accessible_case_ids())::uuid[])));
