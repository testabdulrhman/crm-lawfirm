-- مرفقات الموظفين (طلب المدير 2026-09-26: «ودي يكون فيه إضافة مرفقات للموظفين في صفحتهم،
-- ويكون فيه تحقق من إكتمال الملف الشخصي والمرفقات — الهوية الوطنية، وثيقة البكالوريوس، صورة شخصية»).
--
-- الهوية والشهادة وثائق شخصية حساسة، فمكانها مخزن **خاص** (staff-docs) لا مخزن المستندات
-- المفتوح بالرابط؛ تُعرض بروابط موقّتة. المسار: <member_id>/<ملف> — والمجلد الأول هو الحارس.
-- الصورة الشخصية ليست هنا: هي avatar_url نفسها فتظهر في النظام كله.
-- من يرى ويرفع: المدير لكل موظف، والموظف لنفسه فقط.

create table if not exists public.member_documents (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,
  doc_type text not null check (doc_type in ('national_id', 'degree', 'cv', 'license', 'contract', 'other')),
  file_path text not null,
  file_name text,
  mime text,
  size_bytes bigint,
  note text,
  uploaded_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists member_documents_member_idx on public.member_documents (member_id, doc_type);

alter table public.member_documents enable row level security;

drop policy if exists member_docs_select on public.member_documents;
create policy member_docs_select on public.member_documents
  for select to authenticated
  using ((select public.is_director_caller()) or member_id = (select public.my_member_id()));

drop policy if exists member_docs_insert on public.member_documents;
create policy member_docs_insert on public.member_documents
  for insert to authenticated
  with check (
    ((select public.is_director_caller()) or member_id = (select public.my_member_id()))
    and uploaded_by = (select public.my_member_id())
  );

drop policy if exists member_docs_delete on public.member_documents;
create policy member_docs_delete on public.member_documents
  for delete to authenticated
  using ((select public.is_director_caller()) or member_id = (select public.my_member_id()));

-- حساب مراجعة أبل لا يلمسها
drop policy if exists member_docs_no_reviewer on public.member_documents;
create policy member_docs_no_reviewer on public.member_documents
  as restrictive for all to authenticated
  using (not (select public.is_reviewer_caller()))
  with check (not (select public.is_reviewer_caller()));

revoke all on public.member_documents from anon, authenticated;
grant select, insert, delete on public.member_documents to authenticated;

-- ===== المخزن الخاص =====
insert into storage.buckets (id, name, public, file_size_limit)
values ('staff-docs', 'staff-docs', false, 20971520)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists staff_docs_read on storage.objects;
create policy staff_docs_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'staff-docs'
    and not (select public.is_reviewer_caller())
    and ((select public.is_director_caller())
         or (storage.foldername(name))[1] = (select public.my_member_id())::text)
  );

drop policy if exists staff_docs_upload on storage.objects;
create policy staff_docs_upload on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'staff-docs'
    and not (select public.is_reviewer_caller())
    and ((select public.is_director_caller())
         or (storage.foldername(name))[1] = (select public.my_member_id())::text)
  );

drop policy if exists staff_docs_delete on storage.objects;
create policy staff_docs_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'staff-docs'
    and ((select public.is_director_caller())
         or (storage.foldername(name))[1] = (select public.my_member_id())::text)
  );
