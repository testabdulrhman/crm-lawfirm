-- CRM-1 (فحص 2026-11-17): sign-files توقّع الرابط لمن «يرى سجلاً يشير إليه» (visible_stored_urls)، لكن
-- الموظف يستطيع أن يكتب بنفسه سجلاً يشير إلى أي رابط — مصدراً في «الباحث»، أو مستنداً في ملفه، أو ملفاً
-- في مهمته — فيصير «يرى» ملفاً من ملفٍ محجوب عنه ثم يوقّعه أو يحلّله بالذكاء.
-- الحاجز هنا عند الكتابة لا عند القراءة: رابطٌ من مخزن documents لا يُكتب في أي عمود ملف إلا إن كان
--   (أ) الكاتب هو من رفع الكائن (storage.objects.owner)، أو
--   (ب) الرابط مرئيٌّ له أصلاً قبل هذه الكتابة (نسخ ملف يراه إلى مكان آخر — «انسخ للملف» وأمثاله)، أو
--   (ج) كائنٌ رفعته دالة خادمية (بلا مالك) قبل أقل من ٣٠ دقيقة — ناتج توقيع/تحويل طلبه هو للتو.
-- الكتابات الخادمية (service_role / بلا مستخدم) لا تُفحص. القيمة غير المتغيّرة في التعديل لا تُفحص.

create or replace function public.stored_object_meta(p_path text)
returns table (owner uuid, created_at timestamptz)
language sql stable security definer set search_path = public, storage
as $$
  select o.owner, o.created_at from storage.objects o where o.bucket_id = 'documents' and o.name = p_path limit 1
$$;
revoke all on function public.stored_object_meta(text) from public, anon, authenticated;
grant execute on function public.stored_object_meta(text) to authenticated;

-- security invoker: visible_stored_urls تُقاس بصلاحيات الكاتب نفسه
create or replace function public.guard_stored_url_write()
returns trigger language plpgsql set search_path = public
as $$
declare
  c text; v text; old_v text; m record;
  pfx constant text := 'https://zwaahunavepleczuamuy.supabase.co/storage/v1/object/public/documents/';
begin
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  foreach c in array tg_argv loop
    v := to_jsonb(new) ->> c;
    if v is null or left(v, length(pfx)) <> pfx then continue; end if;
    if tg_op = 'UPDATE' then
      old_v := to_jsonb(old) ->> c;
      if v is not distinct from old_v then continue; end if;
    end if;
    select * into m from public.stored_object_meta(
      split_part(replace(substr(v, length(pfx) + 1), '%20', ' '), '?', 1));
    if m.owner = auth.uid() then continue; end if;
    if m.owner is null and m.created_at > now() - interval '30 minutes' then continue; end if;
    if exists (select 1 from public.visible_stored_urls(array[v])) then continue; end if;
    raise exception 'لا يمكن ربط ملف لا تملك صلاحية عليه' using errcode = '42501';
  end loop;
  return new;
end $$;
revoke all on function public.guard_stored_url_write() from public, anon;

do $$
declare r record;
begin
  for r in select * from (values
    ('documents', array['file_url']), ('document_versions', array['file_url']),
    ('memo_documents', array['file_url']), ('legal_service_documents', array['file_url']),
    ('property_documents', array['file_url']), ('request_documents', array['file_url']),
    ('outgoing_letters', array['file_url']), ('outgoing_documents', array['file_url']),
    ('outgoing_approvals', array['original_file_url', 'signed_file_url']),
    ('office_documents', array['file_url']), ('engagements', array['file_url', 'signed_file_url']),
    ('contract_templates', array['file_url']), ('powers_of_attorney', array['document_url']),
    ('rulings', array['document_url', 'drop_document_url']), ('sessions', array['minutes_url']),
    ('task_files', array['file_url']), ('research_sources', array['file_url']),
    ('staff_applications', array['cv_url', 'lawyer_license_url', 'qualification_doc_url']),
    ('team_members', array['cv_url', 'lawyer_license_url', 'qualification_doc_url']),
    ('kyc_checks', array['authorization_doc_url', 'id_doc_url']),
    ('payroll_entries', array['file_url']), ('attendance_records', array['attachment_url']),
    ('change_requests', array['screenshot_url'])
  ) as t(tbl, cols) loop
    execute format('drop trigger if exists guard_stored_url_trg on public.%I', r.tbl);
    execute format(
      'create trigger guard_stored_url_trg before insert or update of %s on public.%I
         for each row execute function public.guard_stored_url_write(%s)',
      (select string_agg(quote_ident(x), ', ') from unnest(r.cols) x), r.tbl,
      (select string_agg(quote_literal(x), ', ') from unnest(r.cols) x));
  end loop;
end $$;

-- CRM-1 (الشق الثاني): هل يحق للمتصل قراءة ملف من مخزن documents؟ القاعدة نفسها لحاجز الكتابة.
-- تناديها ai-assistant وextract-contract بصلاحية الموظف قبل أن تنزّلا الملف بمفتاح الخادم.
create or replace function public.stored_url_readable(p_url text)
returns boolean language plpgsql stable set search_path = public
as $$
declare m record;
  pfx constant text := 'https://zwaahunavepleczuamuy.supabase.co/storage/v1/object/public/documents/';
begin
  if p_url is null or left(p_url, length(pfx)) <> pfx then return false; end if;
  select * into m from public.stored_object_meta(split_part(replace(substr(p_url, length(pfx) + 1), '%20', ' '), '?', 1));
  if m.owner is not null and m.owner = auth.uid() then return true; end if;
  if m.owner is null and m.created_at > now() - interval '30 minutes' then return true; end if;
  return exists (select 1 from public.visible_stored_urls(array[p_url]));
end $$;
revoke all on function public.stored_url_readable(text) from public, anon;
grant execute on function public.stored_url_readable(text) to authenticated;
