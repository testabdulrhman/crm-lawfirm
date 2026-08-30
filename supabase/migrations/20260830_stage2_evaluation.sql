-- المرحلة الثانية من دورة العمل: «دراسة المطالبة وتقييم الجدوى» (2026-08-30)
-- + بند الملكية المزدوجة من المرحلة الرابعة (طلب العين الثانية بالاسم).
-- طُبّقا على الإنتاج عبر MCP بالاسمين evaluation_four_axes
-- وdeadline_second_eye_request؛ هذا الملف يجمعهما لسجل المستودع.

/* ===== مذكرة التقييم على المحاور الأربعة ===== */
alter table public.request_evaluations
  add column if not exists axis_procedural text,
  add column if not exists axis_merits     text,
  add column if not exists axis_evidence   text,
  add column if not exists axis_financial  text,
  add column if not exists risk_level      text
    check (risk_level in ('low','medium','high')),
  add column if not exists approved_by      uuid references public.team_members(id),
  add column if not exists approved_by_name text,
  add column if not exists approved_at      timestamptz;

create or replace function public.approve_request_evaluation(p_eval uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_me record;
begin
  select id, coalesce(short_name, name) as nm, is_director into v_me
  from team_members where auth_id = auth.uid();
  if v_me.id is null or v_me.is_director is not true then
    raise exception 'اعتماد المذكرة للمدير وحده — «لا عرض أتعاب من محامٍ منفرداً»';
  end if;
  update request_evaluations
  set approved_by=v_me.id, approved_by_name=v_me.nm,
      approved_at=now(), updated_at=now()
  where id=p_eval and approved_at is null;
  if not found then raise exception 'المذكرة غير موجودة أو معتمدة سلفاً'; end if;
end; $$;
revoke execute on function public.approve_request_evaluation(uuid) from anon, public;
grant execute on function public.approve_request_evaluation(uuid) to authenticated;

/* ===== طلب العين الثانية لمهلة حكم — بالاسم لا بافتراض المدير ===== */
create or replace function public.request_deadline_second_eye(
  p_task uuid, p_member uuid
) returns void language plpgsql security definer set search_path to 'public'
as $$
declare v_task record; v_me record; v_them text;
begin
  select id, coalesce(short_name, name) as nm into v_me
  from team_members where auth_id = auth.uid();
  if v_me.id is null then raise exception 'المستدعي غير معروف'; end if;

  select t.id, t.title, t.due_date, t.case_id into v_task
  from tasks t where t.id=p_task and t.derived_key like 'ruling:%' and t.deleted_at is null;
  if v_task.id is null then raise exception 'المهمة ليست مهلة حكم'; end if;

  select coalesce(short_name, name) into v_them from team_members
  where id=p_member and coalesce(is_active,true)
    and coalesce(is_reviewer,false)=false;
  if v_them is null then raise exception 'العضو المختار غير صالح'; end if;

  insert into notifications (type, title, message, recipient_id, case_id, task_id)
  values ('task','مهلة تنتظر عينك الثانية',
    coalesce(v_task.title,'مهلة اعتراض') ||
      coalesce(' — الاستحقاق '||to_char(v_task.due_date,'DD/MM/YYYY'),'') ||
      '. راجع الحساب واعتمده من لوحة التحكم.',
    p_member, v_task.case_id, v_task.id);

  perform log_matter_event(v_task.case_id,'deadline',
    'طلبتُ من '||v_them||' مراجعة حساب مهلة الاعتراض — صارت بعينين',
    jsonb_build_object('task_id',v_task.id,'second_eye',p_member),
    false,'second-eye:'||v_task.id, v_me.id, v_me.nm);
end; $$;
revoke execute on function public.request_deadline_second_eye(uuid,uuid) from anon, public;
grant execute on function public.request_deadline_second_eye(uuid,uuid) to authenticated;
