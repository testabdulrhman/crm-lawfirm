-- علّة انكشفت بأول تشغيل حقيقي لسلّم التصعيد (2026-08-29):
-- السلّم يُنبّه على المتأخّر في اليوم الأول ثم كل سبعة أيام. لكن المهام
-- التي تأخّرت **قبل** تشغيله لا تقع على النمط (كانت ٦ و٨ و٩ أيام) فتسقط
-- منه صامتة — وهي أخطرها. أول تشغيل أرسل صفر إشعارات رغم ثلاث متأخّرات.
--
-- الإصلاح: من لم يُنبَّه عن فواته قط يُنبَّه الآن، ثم يتبع النمط الأسبوعي.
-- الدرس: أي سلّم تنبيه دوري يحتاج «حالة أولى» صريحة للمتراكم السابق.

create or replace function public.notify_deadline_ladder()
returns int
language plpgsql security definer set search_path to 'public'
as $$
declare
  r record; v_days int; v_title text; v_msg text; v_sent int := 0; v_dir uuid;
  v_first boolean;
begin
  perform close_stale_session_tasks();

  select id into v_dir from team_members
  where is_director is true and coalesce(is_active, true) is true
    and coalesce(is_reviewer, false) is false
  order by created_at limit 1;

  for r in
    select t.id, t.title, t.case_id, t.due_date, t.assignee_id
    from tasks t
    where t.derived_key is not null and t.deleted_at is null
      and t.status <> 'done' and t.due_date is not null
  loop
    v_days := r.due_date - current_date;
    v_first := not exists (
      select 1 from notifications n
      where n.task_id = r.id and n.title like 'مهلة فائتة%');

    if v_days in (14, 7, 3, 1) then
      v_title := 'مهلة تقترب — ' || v_days::text || ' يوم';
      v_msg   := r.title || ' · الاستحقاق ' || r.due_date::text;
    elsif v_days = 0 then
      v_title := 'مهلة تستحق اليوم';
      v_msg   := r.title;
    elsif v_days < 0 and (v_days = -1 or (-v_days) % 7 = 0 or v_first) then
      v_title := 'مهلة فائتة منذ ' || (-v_days)::text || ' يوم';
      v_msg   := r.title || ' · كان الاستحقاق ' || r.due_date::text;
    else
      continue;
    end if;

    if r.assignee_id is not null and not exists (
         select 1 from notifications n
         where n.task_id = r.id and n.title = v_title
           and n.created_at::date = current_date)
    then
      insert into notifications (type, title, message, recipient_id, case_id, task_id)
      values ('task', v_title, v_msg, r.assignee_id, r.case_id, r.id);
      v_sent := v_sent + 1;
    end if;

    if v_days <= 0 and v_dir is not null and v_dir is distinct from r.assignee_id
       and not exists (
         select 1 from notifications n
         where n.task_id = r.id and n.title = v_title
           and n.recipient_id = v_dir and n.created_at::date = current_date)
    then
      insert into notifications (type, title, message, recipient_id, case_id, task_id)
      values ('task', v_title, v_msg, v_dir, r.case_id, r.id);
      v_sent := v_sent + 1;
    end if;
  end loop;

  return v_sent;
end;
$$;

revoke execute on function public.notify_deadline_ladder() from anon, public;
