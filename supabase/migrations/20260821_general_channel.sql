-- النقاش v2: القناة العامة + تفاعلات + محفوظات (قرارات المستخدم 2026-08-21)
--
-- «كل قضية فيها محادثة وفيه محادثة عامة؟» → نعم: لكل قضية نقاشها + قناة
-- عامة **واحدة** لا ثالث (تكاثر القنوات مقتل سلاك). التمثيل: case_id فارغ
-- = «عام — المكتب». لا جدول جديد — الخيوط والذكاء والعدّادات تعمل تلقائياً.
--
-- «ابي تفاعل ايموجي + بوك مارك وتعديل وحذف» → جدولا reactions وbookmarks،
-- والتعديل/الحذف الناعم موجودان عمودياً (edited_at/deleted_at) وRLS يقصرهما
-- على الكاتب — المطلوب واجهات فقط + دوال قراءة مخصّبة.

begin;

/* ============ ١. القضية اختيارية = القناة العامة ============ */

alter table public.case_comments alter column case_id drop not null;
alter table public.case_reads    alter column case_id drop not null;

-- ⚠️ NULLS NOT DISTINCT (PG15+): بدونها كل صف قراءة للعامة يُعد فريداً
--    فتتكاثر صفوف القراءة بلا حد.
drop index if exists case_reads_unique_idx;
create unique index case_reads_unique_idx
  on public.case_reads (case_id, member_id) nulls not distinct;

/* ============ ٢. التفاعلات (إيموجي) ============ */

create table if not exists public.case_comment_reactions (
  comment_id uuid not null references public.case_comments(id) on delete cascade,
  member_id  uuid not null references public.team_members(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id, emoji)
);

comment on table public.case_comment_reactions is
  'تفاعلات الإيموجي على رسائل النقاش — صف لكل (رسالة، عضو، إيموجي)';

alter table public.case_comment_reactions enable row level security;

drop policy if exists reactions_select on public.case_comment_reactions;
create policy reactions_select on public.case_comment_reactions
  for select to authenticated using (true);

-- التفاعل باسمك أنت فقط — إضافةً وحذفاً
drop policy if exists reactions_insert_own on public.case_comment_reactions;
create policy reactions_insert_own on public.case_comment_reactions
  for insert to authenticated
  with check (member_id in (select id from public.team_members where auth_id = auth.uid()));

drop policy if exists reactions_delete_own on public.case_comment_reactions;
create policy reactions_delete_own on public.case_comment_reactions
  for delete to authenticated
  using (member_id in (select id from public.team_members where auth_id = auth.uid()));

revoke all on public.case_comment_reactions from anon;

/* ============ ٣. المحفوظات (بوك مارك) ============ */

-- «ما اقدر احط نجمة على بعض الإجابات عشان ارجع لها بعدين؟» — سؤال المستخدم
-- القديم يتحقق هنا. المحفوظات **خاصة**: لا يرى أحد ماذا حفظ غيره.
create table if not exists public.case_comment_bookmarks (
  comment_id uuid not null references public.case_comments(id) on delete cascade,
  member_id  uuid not null references public.team_members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id)
);

comment on table public.case_comment_bookmarks is
  'رسائل حفظها العضو للرجوع إليها — خاصة به وحده';

alter table public.case_comment_bookmarks enable row level security;

drop policy if exists bookmarks_own on public.case_comment_bookmarks;
create policy bookmarks_own on public.case_comment_bookmarks
  for all to authenticated
  using (member_id in (select id from public.team_members where auth_id = auth.uid()))
  with check (member_id in (select id from public.team_members where auth_id = auth.uid()));

revoke all on public.case_comment_bookmarks from anon;

/* ============ ٤. دوال القراءة المخصّبة ============ */

-- reactions: [{"e":"👍","n":2,"me":true},…] · bookmarked: هل حفظتُها أنا
drop function if exists public.case_stream(uuid);
create function public.case_stream(p_case_id uuid)
returns table (
  id            uuid,
  author_id     uuid,
  author_name   text,
  body          text,
  kind          text,
  document_id   uuid,
  document_name text,
  document_url  text,
  mentions      uuid[],
  created_at    timestamptz,
  edited_at     timestamptz,
  reply_count   bigint,
  last_reply_at timestamptz,
  reactions     jsonb,
  bookmarked    boolean
)
language sql
stable
set search_path to 'public'
as $$
  with me as (
    select id as tm_id from team_members where auth_id = auth.uid() limit 1
  )
  select
    c.id, c.author_id, tm.short_name, c.body, c.kind, c.document_id, d.name, d.file_url,
    c.mentions, c.created_at, c.edited_at,
    (select count(*) from case_comments r
      where r.parent_id = c.id and r.deleted_at is null),
    (select max(r.created_at) from case_comments r
      where r.parent_id = c.id and r.deleted_at is null),
    coalesce((
      select jsonb_agg(jsonb_build_object('e', x.emoji, 'n', x.n, 'me', x.me) order by x.emoji)
      from (
        select emoji, count(*) n,
               bool_or(member_id = (select tm_id from me)) me
        from case_comment_reactions
        where comment_id = c.id
        group by emoji
      ) x
    ), '[]'::jsonb),
    exists (
      select 1 from case_comment_bookmarks b
      where b.comment_id = c.id and b.member_id = (select tm_id from me)
    )
  from case_comments c
  left join team_members tm on tm.id = c.author_id
  left join documents d on d.id = c.document_id
  where c.case_id is not distinct from p_case_id
    and c.deleted_at is null
    and (c.parent_id is null or c.also_to_stream)
  order by c.created_at asc, c.id asc;
$$;

-- ردود خيط واحد — نفس شكل المجرى (فالواجهة تعامل الاثنين تعاملاً واحداً)
create or replace function public.case_thread(p_root uuid)
returns table (
  id            uuid,
  author_id     uuid,
  author_name   text,
  avatar_initial text,
  avatar_color  text,
  body          text,
  kind          text,
  document_id   uuid,
  document_name text,
  document_url  text,
  created_at    timestamptz,
  edited_at     timestamptz,
  reactions     jsonb,
  bookmarked    boolean
)
language sql
stable
set search_path to 'public'
as $$
  with me as (
    select id as tm_id from team_members where auth_id = auth.uid() limit 1
  )
  select
    c.id, c.author_id, tm.short_name, tm.avatar_initial, tm.avatar_color,
    c.body, c.kind, c.document_id, d.name, d.file_url,
    c.created_at, c.edited_at,
    coalesce((
      select jsonb_agg(jsonb_build_object('e', x.emoji, 'n', x.n, 'me', x.me) order by x.emoji)
      from (
        select emoji, count(*) n,
               bool_or(member_id = (select tm_id from me)) me
        from case_comment_reactions
        where comment_id = c.id
        group by emoji
      ) x
    ), '[]'::jsonb),
    exists (
      select 1 from case_comment_bookmarks b
      where b.comment_id = c.id and b.member_id = (select tm_id from me)
    )
  from case_comments c
  left join team_members tm on tm.id = c.author_id
  left join documents d on d.id = c.document_id
  where c.parent_id = p_root
    and c.deleted_at is null
  order by c.created_at asc, c.id asc;
$$;

-- «محفوظاتي» عبر كل النقاشات — بالأحدث حفظاً
create or replace function public.my_bookmarks()
returns table (
  comment_id  uuid,
  case_id     uuid,
  case_title  text,
  body        text,
  kind        text,
  author_name text,
  created_at  timestamptz,
  saved_at    timestamptz
)
language sql
stable
set search_path to 'public'
as $$
  select
    c.id, c.case_id,
    coalesce(cs.title, 'عام — المكتب'),
    c.body, c.kind, tm.short_name, c.created_at, b.created_at
  from case_comment_bookmarks b
  join case_comments c on c.id = b.comment_id and c.deleted_at is null
  left join cases cs on cs.id = c.case_id
  left join team_members tm on tm.id = c.author_id
  where b.member_id in (select id from team_members where auth_id = auth.uid())
  order by b.created_at desc;
$$;

/* ============ ٥. قائمة النقاشات تعرف العامة ============ */

create or replace function public.case_discussions()
returns table (
  case_id      uuid,
  case_title   text,
  office_num   text,
  last_body    text,
  last_at      timestamptz,
  last_author  text,
  has_file     boolean,
  unread       bigint
)
language sql
stable
set search_path to 'public'
as $$
  with me as (
    select id as tm_id from team_members where auth_id = auth.uid() limit 1
  ),
  last_msg as (
    select distinct on (c.case_id)
      c.case_id, c.body, c.created_at, c.document_id, c.author_id, c.kind
    from case_comments c
    where c.deleted_at is null
    order by c.case_id, c.created_at desc, c.id desc
  ),
  rows_with_msgs as (
    select
      l.case_id,
      coalesce(cs.title, 'عام — المكتب') as case_title,
      cs.office_num,
      l.body as last_body,
      l.created_at as last_at,
      case when l.kind = 'ai' then 'الذكاء'
           when l.kind = 'system' then null
           else tm.short_name end as last_author,
      (l.document_id is not null) as has_file,
      (
        select count(*)
        from case_comments u
        where u.case_id is not distinct from l.case_id
          and u.deleted_at is null
          and u.kind <> 'system'
          and u.author_id is distinct from (select tm_id from me)
          and u.created_at > coalesce(
            (select r.read_at from case_reads r
              where r.case_id is not distinct from l.case_id
                and r.member_id = (select tm_id from me)),
            '-infinity'::timestamptz
          )
      ) as unread
    from last_msg l
    left join cases cs on cs.id = l.case_id
    left join team_members tm on tm.id = l.author_id
  )
  select * from rows_with_msgs
  union all
  -- العامة تظهر دائماً ولو بلا رسائل — قناة غير مرئية قناة ميتة
  select null::uuid, 'عام — المكتب', null, null, null, null, false, 0::bigint
  where not exists (
    select 1 from case_comments where case_id is null and deleted_at is null
  )
  order by last_at desc nulls last;
$$;

revoke execute on function public.case_stream(uuid)   from anon, public;
revoke execute on function public.case_thread(uuid)   from anon, public;
revoke execute on function public.my_bookmarks()      from anon, public;
revoke execute on function public.case_discussions()  from anon, public;
grant  execute on function public.case_stream(uuid)   to authenticated;
grant  execute on function public.case_thread(uuid)   to authenticated;
grant  execute on function public.my_bookmarks()      to authenticated;
grant  execute on function public.case_discussions()  to authenticated;

commit;
