-- المتعاون الخارجي — عضوية ثالثة بجانب «مدير» و«موظف»
--
-- الطلب: «حسابات متعاونين مثل المستشارين، هذولا متعاونين على مشاريع محددة».
--
-- الفرق عن الموظف: الموظف بعد مصفوفة الصلاحيات يرى ملفاته + جهات الاتصال
-- والوارد والمواعيد والوكالات وقناة «عام — المكتب» وزملاءه. والمتعاون **لا
-- يرى من المكتب شيئاً** — يفتح النظام فيجد ملفاته ومهامه فقط.
--
-- ⚠️ **جهات الاتصال تُقصَر ولا تُحجب**: لو حُجبت كلياً لاختفى اسم الموكّل من
--    ملف المتعاون نفسه. فيرى من جهات الاتصال ما كان موكّلاً في ملف يصل إليه.
--
-- النمط: سياسات **restrictive** بصيغة `not is_collaborator_caller() or <نطاق>`
-- فلا تمسّ أحداً غير المتعاون، ولا تُلغي سياسة قائمة (تُضاف بـAND).

begin;

/* ============ ١) نوع العضوية ============ */

alter table public.team_members
  add column if not exists member_type text not null default 'employee';

alter table public.team_members drop constraint if exists team_members_member_type_check;
alter table public.team_members add constraint team_members_member_type_check
  check (member_type in ('employee', 'collaborator'));

comment on column public.team_members.member_type is
  'employee = موظف المكتب · collaborator = متعاون خارجي يرى ملفاته فقط';

create or replace function public.is_collaborator_caller()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members
     where auth_id = auth.uid() and member_type = 'collaborator'
  );
$$;
revoke execute on function public.is_collaborator_caller() from anon, public;
grant execute on function public.is_collaborator_caller() to authenticated;

-- ⚠️ حقل امتياز: يُضاف إلى حارس المرحلة ١ كي لا يرقّي المتعاون نفسه موظفاً
create or replace function public.tm_guard_privilege_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_director_caller() then return new; end if;
  if new.is_director  is distinct from old.is_director
     or new.is_reviewer is distinct from old.is_reviewer
     or new.is_active   is distinct from old.is_active
     or new.auth_id     is distinct from old.auth_id
     or new.member_type is distinct from old.member_type then
    raise exception 'تغيير الصلاحيات أو حالة الحساب للمدير وحده';
  end if;
  return new;
end $$;

/* ============ ٢) الحجب الكامل ============ */

do $$
declare t text;
begin
  foreach t in array array[
    'contacts_log','sms_log','email_messages','hatif_calls',
    'appointments','incoming_requests','request_documents','request_evaluations','kyc_checks',
    'outgoing_letters','outgoing_documents','outgoing_approvals',
    'staff_applications','staff_application_analysis',
    'office_documents','message_templates','contract_templates','error_logs',
    'activity_log','birthday_celebrations','booking_blocked_dates','engagements'
  ] loop
    execute format('drop policy if exists collab_block on public.%I', t);
    execute format(
      'create policy collab_block on public.%I as restrictive for all to authenticated
         using (not public.is_collaborator_caller())
         with check (not public.is_collaborator_caller())', t);
  end loop;
end $$;

/* ============ ٣) قياس الاستعمال: يُحجب عن القراءة ويبقى الكتابة ============
   لو حُجب الإدراج انكسر تتبّع الجلسات عند دخوله. */
do $$
declare t text;
begin
  foreach t in array array['usage_sessions','usage_daily'] loop
    execute format('drop policy if exists collab_block_read on public.%I', t);
    execute format(
      'create policy collab_block_read on public.%I as restrictive for select to authenticated
         using (not public.is_collaborator_caller())', t);
  end loop;
end $$;

/* ============ ٤) جهات الاتصال: موكّلو ملفاته فقط ============ */

create or replace function public.collab_can_see_contact(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c
     where c.contact_id = cid and c.deleted_at is null and public.can_access_case(c.id)
  );
$$;
revoke execute on function public.collab_can_see_contact(uuid) from anon, public;
grant execute on function public.collab_can_see_contact(uuid) to authenticated;

drop policy if exists collab_contacts_scope on public.contacts;
create policy collab_contacts_scope on public.contacts
  as restrictive for all to authenticated
  using  (not public.is_collaborator_caller() or public.collab_can_see_contact(id))
  with check (not public.is_collaborator_caller() or public.collab_can_see_contact(id));

/* ============ ٥) قناة «عام — المكتب» ============
   نقاش بلا ملف (case_id is null) = القناة العامة. المتعاون ليس من أهلها. */

drop policy if exists collab_no_public_channel on public.case_comments;
create policy collab_no_public_channel on public.case_comments
  as restrictive for all to authenticated
  using  (not public.is_collaborator_caller() or case_id is not null)
  with check (not public.is_collaborator_caller() or case_id is not null);

commit;
