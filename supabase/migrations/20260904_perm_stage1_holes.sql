-- مصفوفة الصلاحيات — المرحلة ١: سدّ ثغرتين قائمتين في الإنتاج
-- (اكتُشفتا 2026-09-04 بانتحال حساب موظف غير مدير، وأُثبتتا بالتجربة)
--
-- ١) **ترقية الذات**: جدول team_members عليه سياسة permissive ALL بـusing(true)،
--    فأي موظف يستطيع الكتابة على صفّ أي زميل — بما فيه ضبط is_director=true
--    على نفسه. التجربة أصابت ٥ صفوف مدراء من حساب موظف عادي.
-- ٢) **الأسرار مكشوفة**: lookup_values مفتوح كذلك، وفيه sms_config و
--    whatsapp_config وgmail_config — أي مفاتيح مسجات وسرّ هاتف. التجربة
--    قرأت ٦ صفوف إعدادات من حساب موظف عادي.
--
-- الأسلوب: سياسات **restrictive** فوق الـpermissive القائمة (تُضاف بـAND ولا
-- تلغي شيئاً)، فلا تُكسر أي قراءة مشروعة. ولا تغيّر هذه المرحلة سلوك أحد في
-- عمله اليومي — من لم يكن يحتاج هذه الصلاحيات لن يلحظ فرقاً.

begin;

/* ============ ١) team_members ============ */

-- التعديل: المدير أي صف، وغيره صفّه هو فقط
drop policy if exists tm_update_scope on public.team_members;
create policy tm_update_scope on public.team_members
  as restrictive for update to authenticated
  using (public.is_director_caller() or auth_id = auth.uid())
  with check (public.is_director_caller() or auth_id = auth.uid());

-- الإضافة والحذف: للمدير وحده
drop policy if exists tm_insert_director on public.team_members;
create policy tm_insert_director on public.team_members
  as restrictive for insert to authenticated
  with check (public.is_director_caller());

drop policy if exists tm_delete_director on public.team_members;
create policy tm_delete_director on public.team_members
  as restrictive for delete to authenticated
  using (public.is_director_caller());

-- ⚠️ WITH CHECK لا يرى القيمة القديمة، فلا يمنع وحده أن يرفع الموظف نفسه
--    مديراً في صفّه هو. الترقر يقارن القديم بالجديد ويمنع حقول الامتياز.
create or replace function public.tm_guard_privilege_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_director_caller() then return new; end if;
  if new.is_director is distinct from old.is_director
     or new.is_reviewer is distinct from old.is_reviewer
     or new.is_active   is distinct from old.is_active
     or new.auth_id     is distinct from old.auth_id then
    raise exception 'تغيير الصلاحيات أو حالة الحساب للمدير وحده';
  end if;
  return new;
end $$;

revoke execute on function public.tm_guard_privilege_fields() from anon, public;

drop trigger if exists tm_guard_privilege_trg on public.team_members;
create trigger tm_guard_privilege_trg
  before update on public.team_members
  for each row execute function public.tm_guard_privilege_fields();

/* ============ ٢) lookup_values ============ */

-- صفوف الإعدادات (‏*_config) فيها أسرار التكاملات — للمدير قراءةً وكتابةً.
-- بقية الأنواع (التصنيفات، عدّاد عروض الأسعار…) تبقى للجميع كما كانت.
drop policy if exists lookup_config_director_only on public.lookup_values;
create policy lookup_config_director_only on public.lookup_values
  as restrictive for all to authenticated
  using (public.is_director_caller() or type not like '%config%')
  with check (public.is_director_caller() or type not like '%config%');

commit;
