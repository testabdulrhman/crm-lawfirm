-- CRM-3 (فحص 2026-11-17): رفع المهمة للاعتماد (submitted) كان يقبل أي forwarded_to، والاعتماد يُستمد
-- من آخر رفع/إحالة — فغير المدير يرفعها إلى نفسه عبر الـAPI ثم يعتمدها، متجاوزاً المدير.
-- الواجهة لا تعرض للرفع والإحالة إلا المدراء (أو «أي مدير» = null)، فالقاعدة تفرض الشيء نفسه.

drop policy if exists task_approvals_actor on public.task_approvals;
create policy task_approvals_actor on public.task_approvals as restrictive for insert to authenticated
  with check (
    actor_id = public.my_member_id()
    and (action = 'submitted' or public.task_is_my_approval(task_id))
    and (
      action not in ('submitted', 'forwarded')
      or forwarded_to is null
      or exists (select 1 from public.team_members m
                  where m.id = forwarded_to and m.is_director and m.is_active)
    )
  );
