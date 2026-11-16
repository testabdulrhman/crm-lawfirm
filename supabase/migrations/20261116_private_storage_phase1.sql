-- المخزن الخاص — المرحلة ١ (المراجعة الشاملة 2026-11-15، الدفعة ٤ البند ١):
-- أي الروابط المخزّنة يحق للمتصل رؤيتها؟ = يرى (بصلاحياته RLS) سجلاً يشير إلى الرابط نفسه.
-- security invoker عمداً: الحكم هو صلاحيات الموظف نفسه، فالمتعاون الخارجي لا يرى إلا ملفات ملفاته.
-- تنادِيها دالة sign-files قبل توقيع رابط مؤقت. أي عمود جديد يحفظ رابط ملف من مخزن documents يُضاف هنا.
create or replace function public.visible_stored_urls(p_urls text[])
returns setof text
language sql stable
set search_path = public
as $$
  select u.url from unnest(p_urls) as u(url)
  where exists (select 1 from public.documents x where x.file_url = u.url)
      or exists (select 1 from public.document_versions x where x.file_url = u.url)
      or exists (select 1 from public.memo_documents x where x.file_url = u.url)
      or exists (select 1 from public.legal_service_documents x where x.file_url = u.url)
      or exists (select 1 from public.legal_services x where x.file_url = u.url)
      or exists (select 1 from public.property_documents x where x.file_url = u.url)
      or exists (select 1 from public.request_documents x where x.file_url = u.url)
      or exists (select 1 from public.outgoing_letters x where x.file_url = u.url)
      or exists (select 1 from public.outgoing_documents x where x.file_url = u.url)
      or exists (select 1 from public.outgoing_approvals x where x.original_file_url = u.url)
      or exists (select 1 from public.outgoing_approvals x where x.signed_file_url = u.url)
      or exists (select 1 from public.office_documents x where x.file_url = u.url)
      or exists (select 1 from public.engagements x where x.file_url = u.url)
      or exists (select 1 from public.engagements x where x.signed_file_url = u.url)
      or exists (select 1 from public.contract_templates x where x.file_url = u.url)
      or exists (select 1 from public.powers_of_attorney x where x.document_url = u.url)
      or exists (select 1 from public.rulings x where x.document_url = u.url)
      or exists (select 1 from public.rulings x where x.drop_document_url = u.url)
      or exists (select 1 from public.sessions x where x.minutes_url = u.url)
      or exists (select 1 from public.task_files x where x.file_url = u.url)
      or exists (select 1 from public.research_sources x where x.file_url = u.url)
      or exists (select 1 from public.staff_applications x where x.cv_url = u.url)
      or exists (select 1 from public.staff_applications x where x.lawyer_license_url = u.url)
      or exists (select 1 from public.staff_applications x where x.qualification_doc_url = u.url)
      or exists (select 1 from public.team_members x where x.cv_url = u.url)
      or exists (select 1 from public.team_members x where x.lawyer_license_url = u.url)
      or exists (select 1 from public.team_members x where x.qualification_doc_url = u.url)
      or exists (select 1 from public.kyc_checks x where x.authorization_doc_url = u.url)
      or exists (select 1 from public.kyc_checks x where x.id_doc_url = u.url)
      or exists (select 1 from public.payroll_entries x where x.file_url = u.url)
      or exists (select 1 from public.attendance_records x where x.attachment_url = u.url)
      or exists (select 1 from public.change_requests x where x.screenshot_url = u.url);
$$;

revoke all on function public.visible_stored_urls(text[]) from public, anon;
grant execute on function public.visible_stored_urls(text[]) to authenticated;
