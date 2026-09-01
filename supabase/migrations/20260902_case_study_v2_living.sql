-- دراسة القضية v2 (طلب المستخدم 2026-09-02 «ابي كل هذه المميزات») — مطبَّق على الإنتاج
-- باسمي case_study_v2_living و case_study_v2_reviewer_gates.
-- نسخ محفوظة + دراسة حيّة تُعلَّم قديمة بأحداث الملف + مخرجات تنفيذية
-- (مهام/مخاطر/أسئلة) + ملخص ما قبل الجلسة + أعمدة السوابق والأسانيد.

alter table case_studies
  add column if not exists version int not null default 1,
  add column if not exists what_changed text,
  add column if not exists precedents text,
  add column if not exists statutes text,
  add column if not exists stale_since timestamptz,
  add column if not exists stale_reasons jsonb not null default '[]'::jsonb;

create table if not exists case_study_versions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (case_id, version)
);
alter table case_study_versions enable row level security;
create policy authenticated_read on case_study_versions for select to authenticated using (true);

create table if not exists case_study_proposals (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references cases(id) on delete cascade,
  study_version int not null default 1,
  kind text not null check (kind in ('task','risk','question')),
  title text not null,
  detail text,
  due_date date,
  priority text,
  status text not null default 'proposed' check (status in ('proposed','accepted','dismissed')),
  accepted_task_id uuid references tasks(id) on delete set null,
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists case_study_proposals_case_idx on case_study_proposals(case_id, status);
alter table case_study_proposals enable row level security;
create policy authenticated_all on case_study_proposals for all to authenticated using (true) with check (true);

create table if not exists session_briefs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  case_id uuid not null references cases(id) on delete cascade,
  brief text not null,
  generated_at timestamptz not null default now(),
  generated_by text,
  notified_at timestamptz
);
alter table session_briefs enable row level security;
create policy authenticated_read on session_briefs for select to authenticated using (true);

-- حساب المراجعة لا يرى الدراسات والمقترحات والملخصات (وقائع موكّلين)
create policy reviewer_case_studies on case_studies as restrictive for select to authenticated using (not is_reviewer_caller());
create policy reviewer_study_versions on case_study_versions as restrictive for select to authenticated using (not is_reviewer_caller());
create policy reviewer_study_proposals on case_study_proposals as restrictive for all to authenticated using (not is_reviewer_caller());
create policy reviewer_session_briefs on session_briefs as restrictive for select to authenticated using (not is_reviewer_caller());

-- الدراسة الحيّة: الأحداث الجوهرية تعلّم الدراسة قديمة بسببها؛ تُجدَّد ليلاً
create or replace function public.mark_study_stale(p_case uuid, p_kind text, p_text text)
returns void language sql security definer set search_path = public as $$
  update case_studies set
    stale_since = coalesce(stale_since, now()),
    stale_reasons = stale_reasons || jsonb_build_object('kind', p_kind, 'at', now(), 'text', left(coalesce(p_text, ''), 160))
  where case_id = p_case;
$$;
revoke all on function public.mark_study_stale(uuid, text, text) from public, anon, authenticated;

create or replace function public.trg_study_stale_event() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind in ('session', 'ruling') then perform mark_study_stale(new.matter_id, new.kind, new.sentence); end if;
  return new;
end $$;
drop trigger if exists study_stale_on_event on matter_events;
create trigger study_stale_on_event after insert on matter_events for each row execute function trg_study_stale_event();

create or replace function public.trg_study_stale_memo() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform mark_study_stale(new.case_id, 'memo', new.title); return new; end $$;
drop trigger if exists study_stale_on_memo on memos;
create trigger study_stale_on_memo after insert on memos for each row execute function trg_study_stale_memo();

create or replace function public.trg_study_stale_doc() returns trigger
language plpgsql security definer set search_path = public as $$
begin if new.case_id is not null then perform mark_study_stale(new.case_id, 'document', new.name); end if; return new; end $$;
drop trigger if exists study_stale_on_doc on documents;
create trigger study_stale_on_doc after insert on documents for each row execute function trg_study_stale_doc();

-- cron: session-briefs يومياً 03:00 UTC (٦ ص الرياض) {mode:"upcoming"}،
--       study-refresh-stale يومياً 01:00 UTC {mode:"stale"} — بمفتاح anon في الترويسة (نمط المشروع)
