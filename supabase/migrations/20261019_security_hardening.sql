-- سدّ ثغرات فحص ChatGPT (2026-10-19) بموافقة المدير «ابدأ بكل شيء». كلها حواجز RESTRICTIVE فوق القائمة،
-- فلا تُكسر الأذونات الحالية لمن له حق، وتمنع من ليس له.

-- ===== ١) غرفة المهمة: لا أحد يلمس مهمة لا يراها =====
-- كان task_participants مفتوحاً، والمشاركة تفتح ملف المهمة (my_accessible_case_ids) — فيضيف الموظف نفسه
-- لمهمة في ملف محجوب عنه فيُفتح له الملف. ومثله التعليقات والنسخ والقائمة الفرعية والاعتمادات.
create or replace function public.task_visible(p_task uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select public.my_member_id() is not null and exists (
    select 1 from tasks t
     where t.id = p_task
       and (t.case_id is null or public.is_office_viewer_caller()
            or t.case_id = any(public.my_accessible_case_ids()))
       and (not public.is_collaborator_caller() or public.collab_can_see_task(t.id))
       and (not public.is_reviewer_caller()
            or t.case_id in (select id from cases where office_num like 'DEMO%'))
  )
$$;
revoke all on function public.task_visible(uuid) from public, anon;
grant execute on function public.task_visible(uuid) to authenticated;

do $$
declare t text;
begin
  foreach t in array array['task_participants','task_comments','task_files','task_subtasks','task_approvals'] loop
    execute format('drop policy if exists task_room_scope on public.%I', t);
    execute format('create policy task_room_scope on public.%I as restrictive for all to authenticated
                    using (public.task_visible(task_id)) with check (public.task_visible(task_id))', t);
  end loop;
end $$;

-- ===== ٢) الاعتماد باسم صاحبه فقط =====
-- من بيده الاعتماد: أي مدير، أو من أُحيلت إليه المهمة في آخر رفع/إحالة (لا من حالة tasks، لأن المتصفح
-- يحدّث المهمة قبل أن يكتب السجل فتتغير review_by).
create or replace function public.task_is_my_approval(p_task uuid)
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select public.is_director_caller() or coalesce((
    select a.forwarded_to = public.my_member_id()
      from task_approvals a
     where a.task_id = p_task and a.action in ('submitted', 'forwarded')
     order by a.created_at desc limit 1), false)
$$;
revoke all on function public.task_is_my_approval(uuid) from public, anon;
grant execute on function public.task_is_my_approval(uuid) to authenticated;

drop policy if exists task_approvals_actor on public.task_approvals;
create policy task_approvals_actor on public.task_approvals as restrictive for insert to authenticated
  with check (
    actor_id = public.my_member_id()
    and (action = 'submitted' or public.task_is_my_approval(task_id))
  );
drop policy if exists task_approvals_immutable_upd on public.task_approvals;
create policy task_approvals_immutable_upd on public.task_approvals as restrictive for update to authenticated
  using (public.is_director_caller());
drop policy if exists task_approvals_immutable_del on public.task_approvals;
create policy task_approvals_immutable_del on public.task_approvals as restrictive for delete to authenticated
  using (public.is_director_caller());

-- approved_by في المهمة نفسها: لا يُكتب إلا باسم الكاتب وبيده الاعتماد
create or replace function public.tasks_guard_approval()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or auth.uid() is null then return new; end if;
  if new.approved_by is distinct from old.approved_by and new.approved_by is not null then
    if new.approved_by is distinct from public.my_member_id() or not public.task_is_my_approval(new.id) then
      raise exception 'الاعتماد لمن أُحيلت إليه المهمة أو للمدير، وباسمه هو';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists tasks_guard_approval_trg on public.tasks;
create trigger tasks_guard_approval_trg before update on public.tasks
  for each row execute function public.tasks_guard_approval();

-- ===== ٣) أجهزة الإشعارات: كلٌّ أجهزته =====
-- كان أي موظف يربط رمز جواله بحساب المدير فتصله إشعاراته، أو يحذف أجهزة غيره.
drop policy if exists push_devices_own on public.push_devices;
create policy push_devices_own on public.push_devices as restrictive for all to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
-- جهاز يتنقّل بين حسابين (خروج ثم دخول بآخر): التسجيل upsert على token، وصفّه القديم لعضو آخر لا يراه
-- الداخل الجديد فيُرفض التحديث. نحذف الصف القديم قبل الإدراج فيصير إدراجاً عادياً.
create or replace function public.push_devices_take_over()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.member_id is not null and new.member_id = public.my_member_id() then
    delete from push_devices where token = new.token and member_id is distinct from new.member_id;
  end if;
  return new;
end $$;
drop trigger if exists push_devices_take_over_trg on public.push_devices;
create trigger push_devices_take_over_trg before insert on public.push_devices
  for each row execute function public.push_devices_take_over();

-- ===== ٤) سجل النشاط: لا يُقرأ منه ملف لا تراه =====
-- كانت أسماء ملفات المحادثات الخاصة والقنوات ظاهرة للفريق كله (٢٤ صفاً) بروابطها. القراءة الآن بحواجز
-- الملفات نفسها (RLS جدول cases داخل الاستعلام)، والكتابة للمشغّل log_activity وحده (definer).
drop policy if exists activity_case_scope on public.activity_log;
create policy activity_case_scope on public.activity_log as restrictive for select to authenticated
  using (case_id is null or exists (select 1 from cases c where c.id = activity_log.case_id));
drop policy if exists activity_no_direct_write on public.activity_log;
create policy activity_no_direct_write on public.activity_log as restrictive for insert to authenticated
  with check (false);
drop policy if exists activity_no_direct_upd on public.activity_log;
create policy activity_no_direct_upd on public.activity_log as restrictive for update to authenticated
  using (false);
drop policy if exists activity_no_direct_del on public.activity_log;
create policy activity_no_direct_del on public.activity_log as restrictive for delete to authenticated
  using (false);

-- ===== ٥) بيانات المكتب يعدّلها المدير =====
drop policy if exists office_info_director_write on public.office_info;
create policy office_info_director_write on public.office_info as restrictive for insert to authenticated
  with check (public.is_director_caller());
drop policy if exists office_info_director_upd on public.office_info;
create policy office_info_director_upd on public.office_info as restrictive for update to authenticated
  using (public.is_director_caller()) with check (public.is_director_caller());
drop policy if exists office_info_director_del on public.office_info;
create policy office_info_director_del on public.office_info as restrictive for delete to authenticated
  using (public.is_director_caller());

-- ===== ٦) الموقوف بلا صلاحية =====
-- كان الإيقاف يغيّر is_active وحده، ودوال الهوية لا تفحصه — فالموقوف برمزه القائم يقرأ ويكتب،
-- والمدير الموقوف يبقى مديراً. الآن: الهوية تتطلب النشاط، والإيقاف يحظر الدخول نفسه (banned_until)
-- فلا يتجدّد رمزه، والتفعيل يرفع الحظر.
create or replace function public.my_member_id()
 returns uuid language sql stable security definer set search_path to 'public'
as $$
  select id from team_members where auth_id = auth.uid() and coalesce(is_active, true) limit 1
$$;
create or replace function public.is_director_caller()
 returns boolean language sql stable security definer set search_path to 'public'
as $$
  select coalesce(
    (select is_director from team_members where auth_id = auth.uid() and coalesce(is_active, true) limit 1),
    false
  );
$$;

create or replace function public.team_members_sync_ban()
 returns trigger language plpgsql security definer set search_path to 'public', 'auth'
as $$
begin
  if new.auth_id is not null and new.is_active is distinct from old.is_active then
    update auth.users
       set banned_until = case when coalesce(new.is_active, true) then null else 'infinity'::timestamptz end
     where id = new.auth_id;
  end if;
  return new;
end $$;
drop trigger if exists team_members_sync_ban_trg on public.team_members;
create trigger team_members_sync_ban_trg after update of is_active on public.team_members
  for each row execute function public.team_members_sync_ban();
