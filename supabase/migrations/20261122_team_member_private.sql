-- بلاغ المدير 2026-11-22: «ليه الموظفين ... تطلع للكل؟» — صفحة الموظف تُظهر الهوية والآيبان والعنوان وجهة
-- الطوارئ للمدير وصاحبها وحدهما، لكن القاعدة كانت تُرسلها لكل موظف (useTeamMembers = select *) فهي في متصفح
-- كل زميل. قراره: قائمة الزملاء تبقى (الاسم والمسمّى والصورة والجوال)، والحساس للمدير وصاحبه.
--
-- المرحلة ١ (هنا): دالةٌ تُرجع الحساس لمن يحق له، والويب والآيفون يقرآن منها ولا يطلبانه من الجدول.
-- المرحلة ٢ (بعد أن يحدّث كل الموظفين تطبيق الآيفون — النسخ المنشورة تطلب هذه الأعمدة في «صفحتي»):
--   revoke select على الجدول من authenticated و grant select على الأعمدة العامة وحدها.

create or replace function public.team_member_private(p_id uuid default null)
 returns table (
   id uuid, id_number text, national_address text, bank_name text, bank_iban text,
   emergency_contact_name text, emergency_contact_phone text, emergency_contact_relation text,
   cv_url text, lawyer_license_url text, qualification_doc_url text, end_reason text
 )
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select m.id, m.id_number, m.national_address, m.bank_name, m.bank_iban,
         m.emergency_contact_name, m.emergency_contact_phone, m.emergency_contact_relation,
         m.cv_url, m.lawyer_license_url, m.qualification_doc_url, m.end_reason
    from team_members m
   where (p_id is null or m.id = p_id)
     and auth.uid() is not null
     and (m.auth_id = auth.uid() or public.is_director_caller())
$$;
revoke all on function public.team_member_private(uuid) from public, anon;
grant execute on function public.team_member_private(uuid) to authenticated;
