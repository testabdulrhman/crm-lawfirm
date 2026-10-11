-- مجلدات المستندات (اقتراح موظف 2026-10-11 وافق عليه المدير: «إنشاء المجلدات وتنظيم الملفات وترتيبها ونقلها
-- وحذفها أو استبدالها مثل Google Drive»). مجلدات داخل كل ملف بشجرة، وخمسة جاهزة تُنشأ مع أول مستند مصنّف،
-- والمستند المصنّف يدخل مجلده تلقائياً. الاستبدال يحفظ النسخة السابقة في document_versions — والصف نفسه يبقى
-- (نفس المعرّف)، فكل ما يقرأ المستندات (الدراسة، الصادر، النقاشات، الآيفون) يرى النسخة الحالية بلا تعديل.

-- ---------- المجلدات ----------
create table if not exists public.document_folders (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id) on delete cascade,
  parent_id   uuid references public.document_folders(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  sort_order  int not null default 0,
  created_by  uuid references public.team_members(id) on delete set null default public.my_member_id(),
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists document_folders_case on public.document_folders(case_id) where deleted_at is null;

alter table public.document_folders enable row level security;
revoke all on public.document_folders from anon;
revoke delete on public.document_folders from authenticated;   -- الحذف ناعم عبر delete_document_folder
drop policy if exists folders_all on public.document_folders;
create policy folders_all on public.document_folders for all to authenticated using (true) with check (true);
-- نطاق الملف نفسه الذي يحكم documents
drop policy if exists folders_case_scope on public.document_folders;
create policy folders_case_scope on public.document_folders as restrictive for all to authenticated
  using ((select is_office_viewer_caller()) or case_id = any ((select my_accessible_case_ids())::uuid[]))
  with check ((select is_office_viewer_caller()) or case_id = any ((select my_accessible_case_ids())::uuid[]));
drop policy if exists folders_reviewer on public.document_folders;
create policy folders_reviewer on public.document_folders as restrictive for select to authenticated
  using ((not (select is_reviewer_caller())) or case_id in (select id from cases where office_num like 'DEMO%'));

-- ---------- المستند ← مجلده ----------
alter table public.documents add column if not exists folder_id uuid references public.document_folders(id) on delete set null;
create index if not exists documents_folder on public.documents(folder_id) where deleted_at is null;

-- ---------- سجل النسخ (الاستبدال) ----------
create table if not exists public.document_versions (
  id           uuid primary key default gen_random_uuid(),
  document_id  uuid not null references public.documents(id) on delete cascade,
  name         text,
  file_url     text,
  file_path    text,
  file_type    text,
  file_size    bigint,
  uploaded_by_name text,
  replaced_at  timestamptz not null default now(),
  replaced_by_name text
);
create index if not exists document_versions_doc on public.document_versions(document_id, replaced_at desc);
alter table public.document_versions enable row level security;
revoke all on public.document_versions from anon;
revoke insert, update, delete on public.document_versions from authenticated;   -- تُكتب عبر replace_document_file وحدها
drop policy if exists versions_read on public.document_versions;
-- يراها من يرى المستند (سياسات documents تُطبَّق على الاستعلام الفرعي)
create policy versions_read on public.document_versions for select to authenticated
  using (exists (select 1 from documents d where d.id = document_id));

-- ---------- المجلدات الجاهزة والتصنيف ----------
create or replace function public.doc_folder_for_category(p_category text)
 returns text language sql immutable as $$
  select case p_category
    when 'لائحة / مذكرة' then 'المرافعات'
    when 'محضر جلسة'     then 'المرافعات'
    when 'حكم قضائي'     then 'الأحكام'
    when 'عقد'           then 'العقود والأصول'
    when 'صك'            then 'العقود والأصول'
    when 'وكالة'         then 'العقود والأصول'
    when 'هوية / سجل'    then 'العقود والأصول'
    when 'خطاب'          then 'المراسلات'
    when 'فاتورة / سند'  then 'الفواتير'
    when 'تقرير'         then 'التقارير'
    else null
  end
$$;

-- تُنشأ مرة واحدة في عمر الملف: ما حذفه المستخدم لا يعود
create or replace function public.ensure_default_folders(p_case uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if exists (select 1 from document_folders where case_id = p_case) then return; end if;
  if not exists (select 1 from cases where id = p_case and kind in ('case', 'legal_service', 'property', 'bankruptcy')) then return; end if;
  insert into document_folders (case_id, name, sort_order, created_by)
  select p_case, n, o, null from unnest(array['المرافعات', 'الأحكام', 'العقود والأصول', 'المراسلات', 'الفواتير', 'التقارير'])
    with ordinality as t(n, o);
end $$;
-- لا يناديها المتصفح: الترقر وحده (بعد أن اجتاز إدراج المستند صلاحية الملف)
revoke all on function public.ensure_default_folders(uuid) from public, anon, authenticated;

-- المستند المصنّف بلا مجلد يدخل مجلده (عند الرفع، أو حين يصنّفه الذكاء بعده)؛
-- والمجلد لا بد أن يكون من ملف المستند نفسه (النقل لملف آخر يُسقط مجلد الملف القديم)
create or replace function public.documents_auto_folder()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_name text; v_folder uuid;
begin
  if new.folder_id is not null and not exists (
       select 1 from document_folders where id = new.folder_id and case_id = new.case_id and deleted_at is null) then
    new.folder_id := null;
  end if;
  if new.folder_id is not null or new.case_id is null or new.category is null then return new; end if;
  -- التلقائي عند الرفع أو تغيّر التصنيف أو النقل لملف آخر — وإخراج المستخدم ملفاً من مجلده يُحترم
  if tg_op = 'UPDATE' and old.category is not distinct from new.category
     and old.case_id is not distinct from new.case_id then return new; end if;
  v_name := doc_folder_for_category(new.category);
  if v_name is null then return new; end if;
  perform ensure_default_folders(new.case_id);
  select id into v_folder from document_folders
   where case_id = new.case_id and parent_id is null and deleted_at is null and name = v_name
   order by created_at limit 1;
  new.folder_id := v_folder;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.documents_auto_folder() from public, anon, authenticated;
drop trigger if exists documents_auto_folder_trg on public.documents;
create trigger documents_auto_folder_trg before insert or update of category, folder_id, case_id on public.documents
  for each row execute function public.documents_auto_folder();

-- ---------- حذف مجلد: محتواه يصعد لأبيه (لا يُحذف ملف) ----------
create or replace function public.delete_document_folder(p_id uuid)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare f document_folders;
begin
  select * into f from document_folders where id = p_id and deleted_at is null;
  if f.id is null then raise exception 'المجلد غير موجود'; end if;
  if not (is_office_viewer_caller() or f.case_id = any (my_accessible_case_ids()::uuid[])) then
    raise exception 'ليس لديك صلاحية على هذا الملف' using errcode = '42501';
  end if;
  update documents set folder_id = f.parent_id where folder_id = f.id;
  update document_folders set parent_id = f.parent_id where parent_id = f.id and deleted_at is null;
  update document_folders set deleted_at = now() where id = f.id;
end $$;
revoke all on function public.delete_document_folder(uuid) from public, anon;
grant execute on function public.delete_document_folder(uuid) to authenticated;

-- ---------- استبدال الملف مع حفظ السابق ----------
create or replace function public.replace_document_file(
  p_doc uuid, p_file_url text, p_file_path text, p_file_type text, p_file_size bigint, p_by text)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare d documents;
begin
  select * into d from documents where id = p_doc and deleted_at is null;
  if d.id is null then raise exception 'المستند غير موجود'; end if;
  if not (is_office_viewer_caller() or d.case_id = any (my_accessible_case_ids()::uuid[])) then
    raise exception 'ليس لديك صلاحية على هذا الملف' using errcode = '42501';
  end if;
  insert into document_versions (document_id, name, file_url, file_path, file_type, file_size, uploaded_by_name, replaced_by_name)
  values (d.id, d.name, d.file_url, d.file_path, d.file_type, d.file_size, d.uploaded_by_name, p_by);
  update documents set file_url = p_file_url, file_path = p_file_path, file_type = p_file_type,
                       file_size = p_file_size, uploaded_by_name = p_by
   where id = d.id;
end $$;
revoke all on function public.replace_document_file(uuid, text, text, text, bigint, text) from public, anon;
grant execute on function public.replace_document_file(uuid, text, text, text, bigint, text) to authenticated;

-- ---------- ترحيل: المستندات الحالية إلى مجلداتها حسب تصنيفها ----------
do $$
declare r record;
begin
  for r in select distinct case_id from documents
            where deleted_at is null and case_id is not null and doc_folder_for_category(category) is not null loop
    perform ensure_default_folders(r.case_id);
  end loop;
  update documents d set folder_id = f.id
    from document_folders f
   where d.deleted_at is null and d.folder_id is null and f.case_id = d.case_id and f.parent_id is null
     and f.deleted_at is null and f.name = doc_folder_for_category(d.category);
end $$;
