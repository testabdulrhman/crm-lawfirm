-- غرفة عمل المهام: فريق + ملفات بنسخ + تعليقات بمنشن + سلسلة اعتماد
-- 2026-08-11
--
-- التصور (طلب المستخدم): المهمة تصير غرفة عمل يشتغل فيها عدة موظفين،
-- يرفعون ملف العمل وتُحدَّث نسخه، يتناقشون بتعليقات ومنشن، ثم تُرفع
-- للاعتماد: يعتمدها مدير نهائياً أو يعتمد ويحيلها لمدير آخر (اعتماد متسلسل).

begin;

/* ===================== ١. فريق المهمة ===================== */

create table if not exists public.task_participants (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  member_id   uuid not null references public.team_members(id) on delete cascade,
  role        text not null default 'worker',   -- worker منفّذ · watcher متابع
  added_by    uuid references public.team_members(id),
  created_at  timestamptz not null default now(),
  unique (task_id, member_id)
);

comment on table public.task_participants is
  'فريق المهمة إلى جانب المسؤول الأساسي (tasks.assignee_id)';

create index if not exists task_participants_task_idx on public.task_participants (task_id);
create index if not exists task_participants_member_idx on public.task_participants (member_id);

/* ===================== ٢. ملف العمل بنسخ ===================== */

create table if not exists public.task_files (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  version     integer,                          -- يملؤه المشغّل تلقائياً إن تُرك فارغاً
  file_url    text not null,
  file_name   text,
  file_size   bigint,
  note        text,                             -- «ما الذي تغيّر في هذه النسخة»
  uploaded_by uuid references public.team_members(id),
  created_at  timestamptz not null default now(),
  unique (task_id, version)
);

comment on table public.task_files is
  'نسخ ملف العمل: كل رفع = نسخة جديدة برقم متسلسل، والقديمة تبقى للمقارنة';

create index if not exists task_files_task_idx on public.task_files (task_id, version desc);

-- ترقيم النسخ ذرّياً في القاعدة لا في المتصفح (رفعان متزامنان لا يتصادمان بصمت:
-- القيد الفريد يوقف الثاني والمشغّل يعيد الترقيم عند إعادة المحاولة)
create or replace function public.task_files_next_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.version is null then
    select coalesce(max(version), 0) + 1 into new.version
    from public.task_files where task_id = new.task_id;
  end if;
  return new;
end;
$$;

drop trigger if exists task_files_version_trg on public.task_files;
create trigger task_files_version_trg
  before insert on public.task_files
  for each row execute function public.task_files_next_version();

/* ===================== ٣. التعليقات والمنشن ===================== */

create table if not exists public.task_comments (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  author_id   uuid references public.team_members(id),
  body        text not null,
  mentions    uuid[] not null default '{}',     -- من ذُكر بـ@ — يصله إشعار داخلي
  file_id     uuid references public.task_files(id) on delete set null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  deleted_by  text
);

create index if not exists task_comments_task_idx on public.task_comments (task_id, created_at);

/* ===================== ٤. سلسلة الاعتماد ===================== */

-- كل حدث في دورة الاعتماد صف: رفع للاعتماد، اعتماد نهائي، اعتماد وإحالة، إرجاع.
-- الجدول هو سجل التدقيق الكامل — من فعل ماذا ومتى وبأي ملاحظة.
create table if not exists public.task_approvals (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks(id) on delete cascade,
  file_id       uuid references public.task_files(id) on delete set null,
  action        text not null,                  -- submitted | approved | forwarded | returned
  actor_id      uuid references public.team_members(id),
  note          text,
  forwarded_to  uuid references public.team_members(id),  -- عند action=forwarded أو submitted لمعتمِد محدّد
  created_at    timestamptz not null default now()
);

comment on table public.task_approvals is
  'سجل دورة الاعتماد: submitted رفع · approved اعتماد نهائي · forwarded اعتماد وإحالة لمدير آخر · returned إرجاع بملاحظة';

create index if not exists task_approvals_task_idx on public.task_approvals (task_id, created_at);

/* ============ ٥. حالة الاعتماد على المهمة نفسها ============ */

alter table public.tasks
  add column if not exists submitted_at  timestamptz,
  add column if not exists submitted_by  uuid references public.team_members(id),
  add column if not exists review_by     uuid references public.team_members(id),
  add column if not exists approved_at   timestamptz,
  add column if not exists approved_by   uuid references public.team_members(id);

comment on column public.tasks.review_by is
  'من بيده الاعتماد الآن (null والحالة review = أي مدير). يتغيّر عند الإحالة';

-- شارة «بانتظار اعتمادك» للمدير
create index if not exists tasks_review_idx on public.tasks (review_by)
  where deleted_at is null and status = 'review';

/* ============ ٦. ربط الإشعار بالمهمة (فتح مباشر لغرفتها) ============ */

alter table public.notifications
  add column if not exists task_id uuid references public.tasks(id) on delete cascade;

/* ===================== ٧. الصلاحيات ===================== */

alter table public.task_participants enable row level security;
alter table public.task_files        enable row level security;
alter table public.task_comments     enable row level security;
alter table public.task_approvals    enable row level security;

drop policy if exists authenticated_all on public.task_participants;
create policy authenticated_all on public.task_participants
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_all on public.task_files;
create policy authenticated_all on public.task_files
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_all on public.task_comments;
create policy authenticated_all on public.task_comments
  for all to authenticated using (true) with check (true);

drop policy if exists authenticated_all on public.task_approvals;
create policy authenticated_all on public.task_approvals
  for all to authenticated using (true) with check (true);

-- ⚠️ فخّ Supabase المسجَّل: المنصّة تمنح anon صلاحيات صريحة على كل جدول جديد.
--    RLS يمنع، لكن نلغي المنحة دفاعاً في العمق (انظر gotcha-supabase-revoke-public).
revoke all on public.task_participants from anon;
revoke all on public.task_files        from anon;
revoke all on public.task_comments     from anon;
revoke all on public.task_approvals    from anon;
revoke execute on function public.task_files_next_version() from anon, public;

commit;
