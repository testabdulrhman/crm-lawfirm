-- إضافة الملفات من غير المدير كانت مكسورة كلياً منذ مصفوفة الصلاحيات (2026-09-04) — ظهرت في
-- سجل الأخطاء لرنا «تعذّرت إضافة القضية — new row violates row-level security policy
-- "perm_case_select"». ثلاث علل، تُصلح معاً:
--
-- (١) الترقيم: generate_office_num يحسب «أكبر رقم + 1» من الملفات التي يراها المستدعي، والموظف
--     لا يرى إلا ملفاته ⇒ رقم مأخوذ ⇒ cases_office_num_key. صارت security definer فتعدّ الكل
--     (نفس درس gotcha-client-numbering-vs-rls).
--
-- (٢) الإرجاع: المتصفح يطلب الملف الجديد مع الإدراج (RETURNING)، وبوابة perm_case_select تسأل
--     my_accessible_case_ids() بلقطة ما قبل الإدراج فلا ترى الملف ولو أُسند للموظف نفسه.
--     العلاج في المتصفح (useCreateCase): إدراج بلا إرجاع ثم قراءة بالمعرّف في طلب مستقل.
--
-- (٣) الاختفاء: ملف يُنشئه الموظف ويسنده لزميل أو يتركه بلا مسؤول يغيب عنه فوراً — والخدمات
--     والتوثيقات العقارية كذلك (عرضاهما يُدرجان بلا مسؤول). الحل: منشئ الملف يدخل «فريق الملف»
--     (case_members) تلقائياً — وهو ما تمنحه مصفوفة الصلاحيات أصلاً، والمدير يزيله إن شاء.

create or replace function public.generate_office_num()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  yr      text := to_char(now(), 'YY');
  max_seq int;
begin
  if new.office_num is not null and new.office_num <> '' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('office_num:CASE' || yr));
  select coalesce(max(nullif(regexp_replace(office_num, '^CASE' || yr, ''), '')::int), 0)
    into max_seq
    from cases
   where office_num ~ ('^CASE' || yr || '[0-9]+$');
  new.office_num := 'CASE' || yr || lpad((max_seq + 1)::text, 3, '0');
  return new;
end $function$;

revoke all on function public.generate_office_num() from public, anon, authenticated;

create or replace function public.case_creator_access()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_me uuid := public.my_member_id();
begin
  if v_me is null
     or new.kind not in ('case', 'legal_service', 'property', 'bankruptcy')
     or new.assignee_id is not distinct from v_me
     or public.is_director_caller() then
    return new;
  end if;
  -- case_member_notify لا يُشعر من أضاف نفسه
  insert into case_members (case_id, member_id, role, added_by)
  values (new.id, v_me, 'منشئ الملف', v_me)
  on conflict do nothing;
  return new;
exception when others then
  return new;
end $function$;

revoke all on function public.case_creator_access() from public, anon, authenticated;

drop trigger if exists case_creator_access_trg on public.cases;
create trigger case_creator_access_trg
  after insert on public.cases
  for each row execute function public.case_creator_access();
