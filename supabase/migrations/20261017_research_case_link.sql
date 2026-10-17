-- «اسأل الباحث» من صفحة الملف (2026-10-17): المحادثة مربوطة بملف فيقرؤه الباحث (get_case) دون ذكر رقمه.
-- ⚠️ بلا مفتاح أجنبي عمداً: research_chats فيها مفتاح لـteam_members، ومفتاح ثانٍ لـcases يجعلها «جدول ربط»
-- في نظر PostgREST فيلتبس كل ضمّ team_members( بلا اسم علاقة (gotcha-postgrest-embed-ambiguity).
alter table public.research_chats add column if not exists case_id uuid;
create index if not exists research_chats_case on public.research_chats(case_id) where case_id is not null;

-- الربط بملف يراه صاحب المحادثة فقط (RLS الملفات تُطبَّق داخل الاستعلام بصلاحية المستدعي)
drop policy if exists research_chats_own on public.research_chats;
create policy research_chats_own on public.research_chats for all to authenticated
  using (owner_id = (select my_member_id()) and (select research_allowed_caller()))
  with check (
    owner_id = (select my_member_id()) and (select research_allowed_caller())
    and (case_id is null or exists (select 1 from public.cases c where c.id = case_id))
  );
