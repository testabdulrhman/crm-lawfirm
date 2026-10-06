-- «يطّلع على كل شغل المكتب» (طلب المدير 2026-10-06: «عدّل الموظف راكان … مساعد إداري، وعنده الاطلاع على
-- كل شيء في النظام» ← اختار «كل شغل المكتب»: اطلاع ومتابعة على الملفات والنقاشات والمهام والجلسات
-- والوكالات والمستندات والصادر — بلا رواتب ولا مستندات الموظفين الشخصية ولا أسرار الربط ولا حذف ولا اعتماد).
--
-- الوصول للملفات يقرّره قيد واحد مكرر في الجداول: «المدير، أو صاحب صلة بالملف». أُضيف عمود can_view_all
-- ودالة is_office_viewer_caller() (المدير أو صاحب العمود)، وقُسم كل قيد «للكل» إلى قيد قراءة يعرف المطّلع
-- وقيود كتابة كما كانت حرفياً — فالمطّلع يقرأ كل الملفات ولا يعدّل إلا ما له صلة به.
-- لا يتغير: المال (case_fees/engagements)، والرواتب، ومرفقات الموظفين، وطلبات الإجازة، والأسرار، والحذف،
-- والقنوات الخاصة والمحادثات المباشرة (بواباتها مستقلة).

alter table public.team_members add column if not exists can_view_all boolean not null default false;

create or replace function public.is_office_viewer_caller()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce(
    (select (is_director or can_view_all) from team_members where auth_id = auth.uid() and is_active limit 1),
    false
  );
$function$;
revoke all on function public.is_office_viewer_caller() from public, anon;
grant execute on function public.is_office_viewer_caller() to authenticated;

-- الحارس: منح الاطلاع الشامل للمدير وحده (لا يمنحه موظف لنفسه)
create or replace function public.tm_guard_privilege_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if public.is_director_caller() or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if new.is_director  is distinct from old.is_director
     or new.is_reviewer is distinct from old.is_reviewer
     or new.is_active   is distinct from old.is_active
     or new.auth_id     is distinct from old.auth_id
     or new.member_type is distinct from old.member_type
     or new.can_view_all is distinct from old.can_view_all then
    raise exception 'تغيير الصلاحيات أو حالة الحساب للمدير وحده';
  end if;
  if new.join_date is distinct from old.join_date
     or new.name      is distinct from old.name
     or new.role      is distinct from old.role
     or new.email     is distinct from old.email
     or new.id_number is distinct from old.id_number then
    raise exception 'الاسم والمسمّى والبريد ورقم الهوية وتاريخ التعيين يعدّلها المدير';
  end if;
  return new;
end $function$;
revoke execute on function public.tm_guard_privilege_fields() from public, anon, authenticated;

-- كل قيد perm_case_scope «للكل» ⇒ قراءة تعرف المطّلع + إدراج/تعديل/حذف كما كانت
do $$
declare
  r record;
  q text;
  c text;
begin
  for r in
    select c2.relname tbl, pg_get_expr(p.polqual, p.polrelid) qual, pg_get_expr(p.polwithcheck, p.polrelid) chk
    from pg_policy p join pg_class c2 on c2.oid = p.polrelid
    where c2.relnamespace = 'public'::regnamespace and p.polname = 'perm_case_scope' and p.polcmd = '*'
  loop
    q := r.qual;
    c := coalesce(r.chk, r.qual);
    execute format('drop policy perm_case_scope on public.%I', r.tbl);
    execute format('create policy perm_case_scope_read on public.%I as restrictive for select to authenticated using (%s)',
                   r.tbl, replace(q, 'is_director_caller()', 'is_office_viewer_caller()'));
    execute format('create policy perm_case_scope_ins on public.%I as restrictive for insert to authenticated with check (%s)', r.tbl, c);
    execute format('create policy perm_case_scope_upd on public.%I as restrictive for update to authenticated using (%s) with check (%s)', r.tbl, q, c);
    execute format('create policy perm_case_scope_del on public.%I as restrictive for delete to authenticated using (%s)', r.tbl, q);
  end loop;
end $$;

-- الملفات نفسها وفريق الملف: القراءة تعرف المطّلع
drop policy if exists perm_case_select on public.cases;
create policy perm_case_select on public.cases as restrictive for select to authenticated
  using ((id IS NULL) OR (select public.is_office_viewer_caller()) OR (id = ANY ((select public.my_accessible_case_ids())::uuid[])));

drop policy if exists case_members_read on public.case_members;
create policy case_members_read on public.case_members for select to authenticated
  using ((case_id IS NULL) OR (select public.is_office_viewer_caller()) OR (case_id = ANY ((select public.my_accessible_case_ids())::uuid[])));
