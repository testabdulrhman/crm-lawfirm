-- سلة الاسترجاع (طلب المستخدم 2026-08-22 بعد مقارنة إعدادات Clio):
-- الحذف الناعم موجود في كل الجداول منذ البداية بلا واجهة استرجاع —
-- كل استرجاع كان يمر بتدخل يدوي في القاعدة.
--
-- دالتان للمدير فقط (فحص is_director داخلهما):
-- trash_items()  — كل المحذوفات موحّدة (النوع، التسمية، السياق، متى ومن)
-- restore_item() — استرجاع صف واحد عبر قائمة جداول بيضاء

begin;

create or replace function public.is_director_caller() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select is_director from team_members where auth_id = auth.uid() limit 1),
    false
  );
$$;
revoke execute on function public.is_director_caller() from anon, public;
grant execute on function public.is_director_caller() to authenticated;

create or replace function public.trash_items()
returns table (
  item_kind  text,
  id         uuid,
  label      text,
  context    text,
  deleted_at timestamptz,
  deleted_by text
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select * from (
    select 'case'::text, c.id, coalesce(c.title, c.office_num, 'ملف'),
           case c.kind when 'legal_service' then 'استشارة / لائحة'
                       when 'property' then 'توثيق عقاري'
                       else 'قضية' end || coalesce(' · ' || c.office_num, ''),
           c.deleted_at, c.deleted_by
    from cases c where c.deleted_at is not null and is_director_caller()

    union all
    select 'task', t.id, coalesce(t.title, 'مهمة'),
           coalesce((select cs.title from cases cs where cs.id = t.case_id), 'مهمة عامة'),
           t.deleted_at, t.deleted_by
    from tasks t where t.deleted_at is not null and is_director_caller()

    union all
    select 'document', d.id, coalesce(d.name, 'مستند'),
           coalesce((select cs.title from cases cs where cs.id = d.case_id), 'بلا ملف'),
           d.deleted_at, d.deleted_by
    from documents d where d.deleted_at is not null and is_director_caller()

    union all
    select 'comment', m.id,
           coalesce(nullif(left(m.body, 90), ''), 'مرفق'),
           coalesce((select cs.title from cases cs where cs.id = m.case_id), 'عام — المكتب'),
           m.deleted_at, m.deleted_by
    from case_comments m where m.deleted_at is not null and is_director_caller()

    union all
    select 'task_comment', tc.id, coalesce(nullif(left(tc.body, 90), ''), 'تعليق'),
           coalesce((select t.title from tasks t where t.id = tc.task_id), 'مهمة'),
           tc.deleted_at, tc.deleted_by
    from task_comments tc where tc.deleted_at is not null and is_director_caller()

    union all
    select 'poa', p.id, 'وكالة ' || coalesce(nullif(p.poa_number, ''), '—'),
           coalesce(p.client_name, '—'),
           p.deleted_at, p.deleted_by
    from powers_of_attorney p where p.deleted_at is not null and is_director_caller()

    union all
    select 'engagement', e.id, coalesce(e.title, 'عقد'), null,
           e.deleted_at, e.deleted_by
    from engagements e where e.deleted_at is not null and is_director_caller()

    union all
    select 'letter', l.id, coalesce(l.subject, 'خطاب صادر'), null,
           l.deleted_at, l.deleted_by
    from outgoing_letters l where l.deleted_at is not null and is_director_caller()
  ) x
  order by deleted_at desc
  limit 500;
$$;

revoke execute on function public.trash_items() from anon, public;
grant execute on function public.trash_items() to authenticated;

create or replace function public.restore_item(p_kind text, p_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not is_director_caller() then
    raise exception 'الاسترجاع للمدير فقط';
  end if;
  case p_kind
    when 'case' then
      update cases set deleted_at = null, deleted_by = null where id = p_id;
    when 'task' then
      update tasks set deleted_at = null, deleted_by = null where id = p_id;
    when 'document' then
      update documents set deleted_at = null, deleted_by = null where id = p_id;
    when 'comment' then
      update case_comments set deleted_at = null, deleted_by = null where id = p_id;
    when 'task_comment' then
      update task_comments set deleted_at = null, deleted_by = null where id = p_id;
    when 'poa' then
      update powers_of_attorney set deleted_at = null, deleted_by = null where id = p_id;
    when 'engagement' then
      update engagements set deleted_at = null, deleted_by = null where id = p_id;
    when 'letter' then
      update outgoing_letters set deleted_at = null, deleted_by = null where id = p_id;
    else
      raise exception 'نوع غير معروف: %', p_kind;
  end case;
  return found;
end; $$;

revoke execute on function public.restore_item(text, uuid) from anon, public;
grant execute on function public.restore_item(text, uuid) to authenticated;

commit;
