-- نقاش القضية بالخيوط — بديل مجموعات الواتساب
-- 2026-08-21
--
-- المشكلة (بكلام المستخدم): «أحدهم يرسل بالخاص وآخر بالقروب، وملف هنا وملف
-- هناك… ضيّعت مرة وانحاس العمل، أدوّر الملفات ما ألقاها». العمل بلا عنوان
-- ثابت: الكلام في واتساب والملف في محادثة أخرى ولا شيء منهما مرتبط بالقضية.
--
-- الحل: لكل قضية مجرى نقاش، وكل سؤال فيه **خيط** يجمع ردوده (نمط سلاك).
-- ملاحظة المستخدم الحاسمة: «الواتساب فيه رد لكنه اقتباس لا تجميع» — الرد
-- يهبط في المجرى فيزيد الازدحام؛ والخيط يسحبه من المجرى ويجمعه تحت سؤاله.
--
-- ⚠️ المرفقات تُسجَّل في `documents` نفسه لا في جدول منفصل: الملف المُرسل في
--    النقاش **هو** مستند القضية. جدول ثانٍ يعيد إنتاج نفس مشكلة التشتّت.

begin;

/* ===================== ١. الرسائل ===================== */

create table if not exists public.case_comments (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id) on delete cascade,
  -- الخيط: الجذر parent_id = null، والرد يحمل معرّف سؤاله.
  -- ⚠️ الردود لا تتفرّع (لا رد على رد) — عمداً: سلاك نفسه يمنعها، والتفرّع
  --    يعيد الفوضى التي جئنا نحلّها.
  parent_id   uuid references public.case_comments(id) on delete cascade,
  author_id   uuid references public.team_members(id),
  body        text,
  mentions    uuid[] not null default '{}',   -- من ذُكر بـ@ — يصله إشعار
  -- المرفق: صف في documents (مستند القضية) لا نسخة منفصلة
  document_id uuid references public.documents(id) on delete set null,
  -- «أرسل أيضاً إلى المجرى»: علاج عيب سلاك المعروف — الردود تُدفن في الخيوط
  -- فلا يراها من ليس فيه. الرد المعلَّم يظهر في المجرى أيضاً.
  also_to_stream boolean not null default false,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz,
  deleted_by  text,
  -- رسالة بلا نص وبلا مرفق لا معنى لها
  constraint case_comments_has_content
    check (coalesce(nullif(btrim(body), ''), null) is not null or document_id is not null)
);

comment on table public.case_comments is
  'نقاش القضية بالخيوط: parent_id=null جذر في المجرى، وغيره ردٌّ داخل خيط. المرفق يشير إلى documents.';

-- المجرى: الجذور مرتّبة زمنياً لقضية واحدة
create index if not exists case_comments_stream_idx
  on public.case_comments (case_id, created_at desc)
  where parent_id is null and deleted_at is null;

-- الخيط: ردود جذر واحد
create index if not exists case_comments_thread_idx
  on public.case_comments (parent_id, created_at)
  where parent_id is not null and deleted_at is null;

-- «ما ذُكرت فيه» عبر القضايا كلها
create index if not exists case_comments_mentions_idx
  on public.case_comments using gin (mentions);

/* ===================== ٢. القراءات (عدّاد غير المقروء) ===================== */

-- آخر لحظة فتح فيها العضو هذه القضية. غير المقروء = ما بعدها.
-- صف واحد لكل (عضو، قضية) — لا نخزّن حالة كل رسالة على حدة.
-- ⚠️ المفتاح **بديل لا مركّب**، وهذا مقصود: PostgREST يعتبر أي جدول مفتاحه
--    الأساسي مركّبٌ من مفتاحين أجنبيين **جدولَ وصل many-to-many**. المفتاح
--    المركّب (case_id, member_id) جعل بين cases و team_members مسارين —
--    المباشر assignee_id ومسار case_reads — فكسر كل استعلام يضمّ assignee
--    بـPGRST201 «تعذّر تحميل القضايا» على الإنتاج. قيد الفرادة يحفظ نفس
--    الضمان بلا هذا الأثر.
create table if not exists public.case_reads (
  id         uuid primary key default gen_random_uuid(),
  case_id    uuid not null references public.cases(id) on delete cascade,
  member_id  uuid not null references public.team_members(id) on delete cascade,
  read_at    timestamptz not null default now()
);

create unique index if not exists case_reads_unique_idx
  on public.case_reads (case_id, member_id);

comment on table public.case_reads is
  'آخر قراءة لكل عضو في كل قضية — أساس عدّاد غير المقروء. ⚠️ المفتاح بديل لا مركّب: المركّب يجعل PostgREST يراه جدول وصل فيكسر embed القضايا (PGRST201).';

/* ===================== ٣. قائمة النقاشات (شاشة التطبيق) ===================== */

-- شاشة «النقاشات» تحتاج لكل قضية: آخر رسالة ووقتها وكاتبها وعدد غير المقروء.
-- حسابها في العميل يعني N استعلاماً؛ دالة واحدة تكفي.
-- ⚠️ security invoker (الافتراضي) — RLS يطبَّق بهوية المستدعي لا بهوية المُنشئ.
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
      c.case_id, c.body, c.created_at, c.document_id, c.author_id
    from case_comments c
    where c.deleted_at is null
    -- ⚠️ now() يُرجع وقت **بداية المعاملة** لا اللحظة: رسائل أُدرجت معاً تحمل
    --    الطابع نفسه فيصير الترتيب عشوائياً وتظهر رسالة خاطئة كـ«آخر رسالة».
    --    id فاصلُ تعادل يجعل الترتيب حتمياً.
    order by c.case_id, c.created_at desc, c.id desc
  )
  select
    l.case_id,
    cs.title,
    cs.office_num,
    l.body,
    l.created_at,
    tm.short_name,
    (l.document_id is not null),
    (
      select count(*)
      from case_comments u
      where u.case_id = l.case_id
        and u.deleted_at is null
        and u.author_id is distinct from (select tm_id from me)
        and u.created_at > coalesce(
          (select r.read_at from case_reads r
            where r.case_id = l.case_id and r.member_id = (select tm_id from me)),
          '-infinity'::timestamptz
        )
    )
  from last_msg l
  join cases cs on cs.id = l.case_id
  left join team_members tm on tm.id = l.author_id
  order by l.created_at desc, l.case_id;
$$;

comment on function public.case_discussions is
  'قائمة نقاشات القضايا مرتّبة بالأحدث مع عدّاد غير المقروء — تخدم تبويب «النقاشات»';

/* ===================== ٤. عدد ردود كل خيط ===================== */

-- المجرى يعرض الجذور فقط، وكل جذر يحمل «ن ردود · آخرها متى».
create or replace function public.case_stream(p_case_id uuid)
returns table (
  id            uuid,
  author_id     uuid,
  author_name   text,
  body          text,
  document_id   uuid,
  document_name text,
  mentions      uuid[],
  created_at    timestamptz,
  reply_count   bigint,
  last_reply_at timestamptz
)
language sql
stable
set search_path to 'public'
as $$
  select
    c.id, c.author_id, tm.short_name, c.body, c.document_id, d.name, c.mentions, c.created_at,
    (select count(*) from case_comments r
      where r.parent_id = c.id and r.deleted_at is null),
    (select max(r.created_at) from case_comments r
      where r.parent_id = c.id and r.deleted_at is null)
  from case_comments c
  left join team_members tm on tm.id = c.author_id
  left join documents d on d.id = c.document_id
  where c.case_id = p_case_id
    and c.deleted_at is null
    -- الجذور، ومعها الردود المعلَّمة «أرسل أيضاً إلى المجرى»
    and (c.parent_id is null or c.also_to_stream)
  order by c.created_at asc, c.id asc;
$$;

comment on function public.case_stream is
  'مجرى القضية: الجذور فقط (والردود المعلَّمة also_to_stream) مع عدد ردود كل خيط';

/* ===================== ٥. الصلاحيات ===================== */

alter table public.case_comments enable row level security;
alter table public.case_reads    enable row level security;

drop policy if exists authenticated_all on public.case_comments;
create policy authenticated_all on public.case_comments
  for all to authenticated using (true) with check (true);

-- كل عضو يقرأ ويكتب قراءاته هو فقط — لا معنى لرؤية متى قرأ غيرك
drop policy if exists own_reads on public.case_reads;
create policy own_reads on public.case_reads
  for all to authenticated
  using (member_id in (select id from team_members where auth_id = auth.uid()))
  with check (member_id in (select id from team_members where auth_id = auth.uid()));

-- ⚠️ فخّ Supabase المسجَّل: المنصّة تمنح anon صلاحيات صريحة على كل جدول جديد،
--    و«revoke from public» لا يكفي — يجب تسمية anon و authenticated صراحةً.
--    (سبّب ثلاث ثغرات تسريب على الإنتاج سابقاً.)
revoke all on public.case_comments from anon;
revoke all on public.case_reads    from anon;
revoke execute on function public.case_discussions()      from anon, public;
revoke execute on function public.case_stream(uuid)       from anon, public;
grant  execute on function public.case_discussions()      to authenticated;
grant  execute on function public.case_stream(uuid)       to authenticated;

commit;
