-- مصفوفة الصلاحيات — المرحلة ٢: نطاق الملفات والمال والحذف
-- (قرارات المستخدم 2026-09-04: الموظف يرى المسندة إليه فقط · المال والحذف
--  للمدير وحده · المدير عبدالرحمن وحده، ودور «مدير إداري» يأتي لاحقاً)
--
-- قاعدة الوصول ليست «المسؤول وحده»: يرى الملف من أُسند إليه، أو **عليه مهمة
-- مفتوحة فيه**، أو أُضيف لقناته — لأن ٤ مهام قائمة مسندة لأشخاص على ملفات
-- مسؤولها غيرهم، وحصرها في المسؤول يقطعهم عن سياق عملهم.
--
-- الأسلوب: سياسات restrictive فوق الـpermissive القائمة (AND لا إلغاء).

create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from team_members where auth_id = auth.uid() limit 1
$$;
revoke execute on function public.my_member_id() from anon, public;
grant execute on function public.my_member_id() to authenticated;

create or replace function public.can_access_case(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select cid is null
      or public.is_director_caller()
      or exists (select 1 from cases c
                  where c.id = cid and c.assignee_id = public.my_member_id())
      or exists (select 1 from tasks t
                  where t.case_id = cid and t.deleted_at is null
                    and (t.assignee_id = public.my_member_id()
                         or exists (select 1 from task_participants tp
                                     where tp.task_id = t.id
                                       and tp.member_id = public.my_member_id())))
      or public.is_channel_member(cid);
$$;
revoke execute on function public.can_access_case(uuid) from anon, public;
grant execute on function public.can_access_case(uuid) to authenticated;

-- الملف: القراءة والتعديل بالقاعدة، والحذف للمدير.
-- الإنشاء يبقى مفتوحاً عمداً — WITH CHECK لا يرى الصفّ الجديد فيمنع الإدراج ظلماً.
drop policy if exists perm_case_select on public.cases;
create policy perm_case_select on public.cases as restrictive for select to authenticated
  using (public.can_access_case(id));
drop policy if exists perm_case_update on public.cases;
create policy perm_case_update on public.cases as restrictive for update to authenticated
  using (public.can_access_case(id));
drop policy if exists perm_case_delete on public.cases;
create policy perm_case_delete on public.cases as restrictive for delete to authenticated
  using (public.is_director_caller());

-- توابع الملف تتبعه
do $$
declare t text;
begin
  foreach t in array array[
    'sessions','documents','rulings','memos','case_parties','deadlines',
    'case_studies','case_study_proposals','case_study_versions','session_briefs',
    'case_notifications','case_projects','conflict_checks','powers_of_attorney',
    'outgoing_letters','tasks','case_comments','case_reads'
  ] loop
    execute format('drop policy if exists perm_case_scope on public.%I', t);
    execute format(
      'create policy perm_case_scope on public.%I as restrictive for all to authenticated
         using (public.can_access_case(case_id))
         with check (public.can_access_case(case_id))', t);
  end loop;
end $$;

-- المال للمدير وحده
drop policy if exists perm_money_director on public.case_fees;
create policy perm_money_director on public.case_fees as restrictive for all to authenticated
  using (public.is_director_caller()) with check (public.is_director_caller());
drop policy if exists perm_money_director on public.engagements;
create policy perm_money_director on public.engagements as restrictive for all to authenticated
  using (public.is_director_caller()) with check (public.is_director_caller());

-- الحذف للمدير: الصلب بسياسة، والناعم بترقر — لأن الحذف في النظام تحديثُ
-- عمود deleted_at لا أمر DELETE، فالسياسة وحدها لا تمنعه.
create or replace function public.guard_soft_delete()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.deleted_at is null and new.deleted_at is not null
     and not public.is_director_caller() then
    raise exception 'الحذف للمدير وحده';
  end if;
  return new;
end $$;
revoke execute on function public.guard_soft_delete() from anon, public;

do $$
declare t text;
begin
  foreach t in array array[
    'cases','documents','tasks','memos','outgoing_letters','powers_of_attorney',
    'deadlines','engagements','contract_templates','legal_service_documents',
    'memo_documents','outgoing_documents','property_documents','request_documents'
  ] loop
    execute format('drop trigger if exists guard_soft_delete_trg on public.%I', t);
    execute format('create trigger guard_soft_delete_trg before update on public.%I
                      for each row execute function public.guard_soft_delete()', t);
    execute format('drop policy if exists perm_delete_director on public.%I', t);
    execute format('create policy perm_delete_director on public.%I
                      as restrictive for delete to authenticated
                      using (public.is_director_caller())', t);
  end loop;
end $$;

drop policy if exists perm_delete_director on public.contacts;
create policy perm_delete_director on public.contacts
  as restrictive for delete to authenticated using (public.is_director_caller());
