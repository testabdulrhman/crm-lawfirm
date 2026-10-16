-- «الباحث» (طلب المدير 2026-10-16: «اداة ذكاء اصطناعي، الموظف يقدر يبحث عن أي شيء، ويقدر يحط مصادر من عنده»)
-- محادثات محفوظة كتطبيق Claude: يبحث في الإنترنت والأنظمة وبيانات النظام (بصلاحيات الموظف)، ويجيب من مصادر
-- يضيفها الموظف (ملف / رابط / نص). المصادر خاصة بصاحبها، ويشاركها مع «مكتبة المكتب» إن أراد.
-- الكتابة في الرسائل من دالة research وحدها (مفتاح الخادم بعد التحقق من المالك)؛ والمتصفح يقرأ.

create table if not exists public.research_chats (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references public.team_members(id) on delete cascade,
  title       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists research_chats_owner on public.research_chats(owner_id, updated_at desc) where deleted_at is null;

create table if not exists public.research_messages (
  id          uuid primary key default gen_random_uuid(),
  chat_id     uuid not null references public.research_chats(id) on delete cascade,
  role        text not null check (role in ('user', 'assistant')),
  content     text not null default '',
  citations   jsonb not null default '[]'::jsonb,   -- [{kind: web|source|system, title, url, source_id, quote}]
  tools       jsonb not null default '[]'::jsonb,   -- ما استُعمل: بحث إنترنت، قراءة صفحة، بيانات النظام
  model       text,
  created_at  timestamptz not null default now()
);
create index if not exists research_messages_chat on public.research_messages(chat_id, created_at);

create table if not exists public.research_sources (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.team_members(id) on delete cascade,
  kind            text not null check (kind in ('file', 'url', 'text')),
  title           text not null,
  file_url        text,
  url             text,
  mime            text,
  size            bigint,
  extracted_text  text,                                   -- Word والروابط والنص؛ وPDF والصور تُقرأ أصلاً
  status          text not null default 'pending' check (status in ('pending', 'ready', 'failed')),
  error           text,
  shared          boolean not null default false,         -- في «مكتبة المكتب»
  created_at      timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists research_sources_owner on public.research_sources(owner_id, created_at desc) where deleted_at is null;
create index if not exists research_sources_shared on public.research_sources(created_at desc) where shared and deleted_at is null;

create table if not exists public.research_chat_sources (
  chat_id     uuid not null references public.research_chats(id) on delete cascade,
  source_id   uuid not null references public.research_sources(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (chat_id, source_id)
);

-- ===== الصلاحيات =====
alter table public.research_chats enable row level security;
alter table public.research_messages enable row level security;
alter table public.research_sources enable row level security;
alter table public.research_chat_sources enable row level security;
revoke all on public.research_chats, public.research_messages, public.research_sources, public.research_chat_sources from anon;

-- موظف نشط غير متعاون خارجي ولا حساب مراجعة
create or replace function public.research_allowed_caller()
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from team_members
     where auth_id = auth.uid() and coalesce(is_active, true)
       and coalesce(member_type, 'staff') <> 'collaborator' and not coalesce(is_reviewer, false)
  );
$$;
revoke all on function public.research_allowed_caller() from public, anon;
grant execute on function public.research_allowed_caller() to authenticated;

drop policy if exists research_chats_own on public.research_chats;
create policy research_chats_own on public.research_chats for all to authenticated
  using (owner_id = (select my_member_id()) and (select research_allowed_caller()))
  with check (owner_id = (select my_member_id()) and (select research_allowed_caller()));

drop policy if exists research_messages_own on public.research_messages;
create policy research_messages_own on public.research_messages for select to authenticated
  using (exists (select 1 from research_chats c where c.id = chat_id and c.owner_id = (select my_member_id())));

drop policy if exists research_sources_read on public.research_sources;
create policy research_sources_read on public.research_sources for select to authenticated
  using ((select research_allowed_caller())
         and (owner_id = (select my_member_id()) or (shared and deleted_at is null)));
drop policy if exists research_sources_write on public.research_sources;
create policy research_sources_write on public.research_sources for insert to authenticated
  with check (owner_id = (select my_member_id()) and (select research_allowed_caller()));
drop policy if exists research_sources_update on public.research_sources;
create policy research_sources_update on public.research_sources for update to authenticated
  using (owner_id = (select my_member_id())) with check (owner_id = (select my_member_id()));
drop policy if exists research_sources_delete on public.research_sources;
create policy research_sources_delete on public.research_sources for delete to authenticated
  using (owner_id = (select my_member_id()));

-- ربط مصدر بمحادثة: المحادثة لي، والمصدر أراه (لي أو مشترك)
drop policy if exists research_chat_sources_own on public.research_chat_sources;
create policy research_chat_sources_own on public.research_chat_sources for all to authenticated
  using (exists (select 1 from research_chats c where c.id = chat_id and c.owner_id = (select my_member_id())))
  with check (
    exists (select 1 from research_chats c where c.id = chat_id and c.owner_id = (select my_member_id()))
    and exists (select 1 from research_sources s where s.id = source_id
                 and (s.owner_id = (select my_member_id()) or (s.shared and s.deleted_at is null)))
  );
