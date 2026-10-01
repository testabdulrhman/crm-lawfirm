-- سجل المساعد الذكي (طلب المدير 2026-10-01: «فيه سجل لاستخدام المساعد الذكي؟» ← «نعم، سوّه»).
-- كل طلب للمساعد: من سأل ومتى، ونص الطلب، والرد، والأدوات المستدعاة وما فشل منها، والإجراءات
-- المنفّذة فعلاً، وهل اكتمل. وُلد من بلاغ «ورد علي تم، ولا حصلت القضية» — المحادثات لم تكن تُحفظ.
--
-- النص قد يحمل أسماء موكّلين وأرقام قضايا ⇒ القراءة للمدير وحده، والكتابة لدالة ai-assistant
-- بمفتاح الخادم وحده (لا سياسة إدراج للموظفين).
create table if not exists public.ai_assistant_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id uuid references public.team_members(id) on delete set null,
  user_name text,
  request text,
  reply text,
  tools text[] not null default '{}',
  failed_tools text[] not null default '{}',
  actions text[] not null default '{}',
  finished boolean not null default true,
  ms integer,
  model text,
  error text
);

create index if not exists ai_assistant_runs_created_idx on public.ai_assistant_runs (created_at desc);
create index if not exists ai_assistant_runs_member_idx on public.ai_assistant_runs (member_id, created_at desc);

alter table public.ai_assistant_runs enable row level security;

drop policy if exists ai_runs_director_read on public.ai_assistant_runs;
create policy ai_runs_director_read on public.ai_assistant_runs
  for select to authenticated
  using ((select public.is_director_caller()));

revoke all on public.ai_assistant_runs from anon, authenticated;
grant select on public.ai_assistant_runs to authenticated;
