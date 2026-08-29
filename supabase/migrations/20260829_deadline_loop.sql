-- إغلاق حلقة المهل (المرحلة ١ من تطبيق دورة العمل الاحترافية، 2026-08-29)
--
-- الاشتقاق يعمل منذ 20260821: حكم ← مهمة اعتراض، جلسة ← تحضير، وكالة ←
-- تجديد. لكن الفحص كشف أن الحلقة **لا تُغلق**: ١٩ مهمة مشتقّة، سبعٌ منها
-- متأخّرة، وخمسٌ من ست مهام الوكالات **بلا مكلَّف** — لأن الوكالة كثيراً
-- ما تكون بلا قضية، و spawn_derived_task تأخذ المكلَّف من القضية وحدها.
-- مهمة بلا صاحب لا تظهر في «مهامي» عند أحد، فتنام حتى يفوت الميعاد.
--
-- والوثيقة المرجعية تضع لهذا المؤشر الوحيد بلا هامش تسامح:
-- «المواعيد النظامية المفوَّتة = صفر».

begin;

/* ============ ١. لا مهمة مشتقّة بلا صاحب ============ */

-- سلسلة الإسناد: مسؤول القضية ← فمدير المكتب. المدير خيار أخير مقصود:
-- ظهورها في قائمة أحدهم — ولو المدير — أفضل من ضياعها بلا قائمة.
create or replace function public.spawn_derived_task(
  p_key      text,
  p_case_id  uuid,
  p_title    text,
  p_due      date,
  p_notes    text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_assignee uuid;
  v_task_id  uuid;
begin
  if p_case_id is not null then
    select assignee_id into v_assignee from cases where id = p_case_id;
  end if;

  -- الاحتياط: أقدم مدير نشط (المراجع مستثنى — حسابه معزول ببيانات تجريبية)
  if v_assignee is null then
    select id into v_assignee
    from team_members
    where is_director is true
      and coalesce(is_active, true) is true
      and coalesce(is_reviewer, false) is false
    order by created_at
    limit 1;
  end if;

  insert into tasks (case_id, title, assignee_id, due_date, status, notes, derived_key)
  values (p_case_id, p_title, v_assignee, p_due, 'todo', p_notes, p_key)
  on conflict (derived_key) where derived_key is not null do nothing
  returning id into v_task_id;

  if v_task_id is not null and v_assignee is not null then
    insert into notifications (type, title, message, recipient_id, case_id, task_id)
    values ('task', 'مهمة مولّدة تلقائياً', p_title || ' — استحقاق ' || p_due::text,
            v_assignee, p_case_id, v_task_id);
  end if;
exception when others then
  -- الاشتقاق ثانوي: فشله يجب ألا يمنع حفظ الكيان الأصلي أبداً
  null;
end;
$$;

revoke execute on function public.spawn_derived_task(text, uuid, text, date, text) from anon, public;

-- معالجة اليتيمات القائمة الآن (الخمس المكتشفة في الفحص)
update public.tasks t
set assignee_id = coalesce(
      (select c.assignee_id from cases c where c.id = t.case_id),
      (select id from team_members
        where is_director is true and coalesce(is_active, true) is true
          and coalesce(is_reviewer, false) is false
        order by created_at limit 1)
    )
where t.derived_key is not null
  and t.assignee_id is null
  and t.deleted_at is null
  and t.status <> 'done';

/* ============ ٢. الملكية المزدوجة لمهل الطعون ============ */

-- الوثيقة: «مهل الطعون تُعتمد من شخصين» — فوات ميعاد الاعتراض سقوط حق
-- لا تأخير، وحسابه من شخص واحد خطر لا يُحتمل. الحقلان يخصّان المهام
-- المشتقّة من الأحكام؛ بقية المهام لا تتأثر.
alter table public.tasks
  add column if not exists deadline_confirmed_by uuid references public.team_members(id),
  add column if not exists deadline_confirmed_at timestamptz;

comment on column public.tasks.deadline_confirmed_by is
  'الملكية المزدوجة: من اعتمد صحة احتساب المهلة النظامية (غير من حسبها)';

/* ============ ٣. سلّم التنبيه والتصعيد ============ */

-- قبل الاستحقاق: ١٤ · ٧ · ٣ · ١ يوم ← تنبيه المكلَّف.
-- يوم الاستحقاق: المكلَّف + المدير.
-- بعد الفوات: اليوم الأول ثم كل سبعة أيام ← المدير (تصعيد لا تكرار يومي).
create or replace function public.notify_deadline_ladder()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r         record;
  v_days    int;
  v_title   text;
  v_msg     text;
  v_sent    int := 0;
  v_dir     uuid;
begin
  select id into v_dir
  from team_members
  where is_director is true and coalesce(is_active, true) is true
    and coalesce(is_reviewer, false) is false
  order by created_at limit 1;

  for r in
    select t.id, t.title, t.case_id, t.due_date, t.assignee_id,
           split_part(t.derived_key, ':', 1) as src
    from tasks t
    where t.derived_key is not null
      and t.deleted_at is null
      and t.status <> 'done'
      and t.due_date is not null
  loop
    v_days := r.due_date - current_date;

    if v_days in (14, 7, 3, 1) then
      v_title := 'مهلة تقترب — ' || v_days::text || ' يوم';
      v_msg   := r.title || ' · الاستحقاق ' || r.due_date::text;
    elsif v_days = 0 then
      v_title := 'مهلة تستحق اليوم';
      v_msg   := r.title;
    elsif v_days < 0 and (v_days = -1 or (-v_days) % 7 = 0) then
      v_title := 'مهلة فائتة منذ ' || (-v_days)::text || ' يوم';
      v_msg   := r.title || ' · كان الاستحقاق ' || r.due_date::text;
    else
      continue;
    end if;

    -- المستقبِلون: المكلَّف دائماً، ويُضاف المدير عند الاستحقاق وبعده
    if r.assignee_id is not null
       and not exists (
         select 1 from notifications n
         where n.task_id = r.id and n.title = v_title
           and n.created_at::date = current_date
       )
    then
      insert into notifications (type, title, message, recipient_id, case_id, task_id)
      values ('task', v_title, v_msg, r.assignee_id, r.case_id, r.id);
      v_sent := v_sent + 1;
    end if;

    if v_days <= 0 and v_dir is not null and v_dir is distinct from r.assignee_id
       and not exists (
         select 1 from notifications n
         where n.task_id = r.id and n.title = v_title
           and n.recipient_id = v_dir and n.created_at::date = current_date
       )
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

-- يومياً ٦:٣٠ UTC = ٩:٣٠ صباحاً بالرياض — بعد توليد مهام الوكالات بنصف ساعة
select cron.unschedule('deadline-ladder')
where exists (select 1 from cron.job where jobname = 'deadline-ladder');

select cron.schedule(
  'deadline-ladder',
  '30 6 * * *',
  $$select public.notify_deadline_ladder()$$
);

/* ============ ٤. نظرة المهل — للوحة والتقارير ============ */

-- invoker عمداً: تخضع لسياسات RLS فيرى كلٌّ نطاقه (وحساب المراجعة معزول).
create or replace function public.deadlines_overview()
returns table (
  overdue     int,
  due_3       int,
  due_14      int,
  unassigned  int,
  unconfirmed int
)
language sql
stable
security invoker
set search_path to 'public'
as $$
  select
    count(*) filter (where due_date < current_date)::int,
    count(*) filter (where due_date between current_date and current_date + 3)::int,
    count(*) filter (where due_date between current_date and current_date + 14)::int,
    count(*) filter (where assignee_id is null)::int,
    count(*) filter (
      where derived_key like 'ruling:%' and deadline_confirmed_at is null
    )::int
  from tasks
  where derived_key is not null
    and deleted_at is null
    and status <> 'done'
    and due_date is not null;
$$;

revoke execute on function public.deadlines_overview() from anon, public;
grant execute on function public.deadlines_overview() to authenticated;

commit;
