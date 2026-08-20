-- الذكاء الاصطناعي في نقاش القضايا — البنية (قرار المستخدم 2026-08-21)
--
-- «ابي يكون فيه ذكاء اصطناعي كامل: اقدر اعمل منشن للذكاء ويرد علي في
--  المحادثة، ولما بيان تقول ترفع مذكرة تلقائي تكون مهمة مجدولة»
--
-- v2 بعد مراجعة عدائية — أبرز ما أضافته:
-- • inbound_secret: بوابة سر داخلي فوق مفتاح anon العام — بدونها يستطيع أي
--   أحد استدعاء الدالة وإنفاق Anthropic بلا حد.
-- • source_comment_id + فهرس فريد: idempotency — الرسالة تُعالَج مرة واحدة.
-- • تشديد RLS على case_comments: كان with_check=true يسمح لأي موظف بتزوير
--   رسائل «الذكاء» وإعلانات النظام، وبالكتابة بهوية زميله — والكاشف يحوّل
--   الانتحال إلى مهام آلية موثَّقة باسم الضحية.
-- • عدّاد غير المقروء يستثني رسائل النظام — وإلا تضخّمت الشارات حتى يتعلم
--   الفريق تجاهلها.
-- • التسمية anon_key لا service_key — الاسم القديم فخّ يغري «إصلاحاً»
--   مستقبلياً بوضع مفتاح service_role الحقيقي في جدول يقرؤه كل موظف.

begin;

/* ============ ١. نوع الرسالة + أثر المعالجة ============ */

alter table public.case_comments
  add column if not exists kind text not null default 'user';

alter table public.case_comments
  drop constraint if exists case_comments_kind_check;
alter table public.case_comments
  add constraint case_comments_kind_check check (kind in ('user', 'ai', 'system'));

comment on column public.case_comments.kind is
  'user رسالة موظف · ai ردّ الذكاء · system إعلان آلي. الـtrigger يطلق على user فقط — قطعُ حلقةِ الذكاء يرد على نفسه.';

-- الرسالة البشرية التي سبّبت هذا الرد الآلي — مفتاح idempotency وسجل الأثر
alter table public.case_comments
  add column if not exists source_comment_id uuid references public.case_comments(id) on delete cascade;

create unique index if not exists case_comments_source_unique
  on public.case_comments (source_comment_id)
  where source_comment_id is not null;

/* ============ ٢. تشديد RLS ============ */

-- كانت authenticated_all (with_check=true): أي موظف يستطيع إدراج رسالة
-- kind='ai' مزوّرة، أو رسالة بهوية زميله فيُنشئ الكاشف مهمة باسم الضحية.
drop policy if exists authenticated_all on public.case_comments;

drop policy if exists case_comments_select on public.case_comments;
create policy case_comments_select on public.case_comments
  for select to authenticated using (true);

-- الإدراج من العميل: رسالة بشرية بهوية الكاتب نفسه فقط.
-- رسائل ai/system تكتبها الدالة بـservice_role (يتجاوز RLS) حصراً.
drop policy if exists case_comments_insert_own on public.case_comments;
create policy case_comments_insert_own on public.case_comments
  for insert to authenticated
  with check (
    kind = 'user'
    and author_id in (select id from public.team_members where auth_id = auth.uid())
  );

-- التعديل والحذف الناعم لرسائل الكاتب نفسه فقط
drop policy if exists case_comments_update_own on public.case_comments;
create policy case_comments_update_own on public.case_comments
  for update to authenticated
  using (author_id in (select id from public.team_members where auth_id = auth.uid()))
  with check (author_id in (select id from public.team_members where auth_id = auth.uid()));

/* ============ ٣. الدالتان تُرجعان النوع ============ */

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
    c.id, c.author_id, tm.short_name, c.body, c.kind, c.document_id, d.name,
    c.mentions, c.created_at,
    (select count(*) from case_comments r
      where r.parent_id = c.id and r.deleted_at is null),
    (select max(r.created_at) from case_comments r
      where r.parent_id = c.id and r.deleted_at is null)
  from case_comments c
  left join team_members tm on tm.id = c.author_id
  left join documents d on d.id = c.document_id
  where c.case_id = p_case_id
    and c.deleted_at is null
    and (c.parent_id is null or c.also_to_stream)
  order by c.created_at asc, c.id asc;
$$;

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
  )
  select
    l.case_id,
    cs.title,
    cs.office_num,
    l.body,
    l.created_at,
    case when l.kind = 'ai' then 'الذكاء'
         when l.kind = 'system' then null
         else tm.short_name end,
    (l.document_id is not null),
    (
      select count(*)
      from case_comments u
      where u.case_id = l.case_id
        and u.deleted_at is null
        -- رسائل النظام لا تُحتسب غير مقروءة: شارة تتضخم بالآلي تُتجاهل
        -- فيموت العدّاد للرسائل البشرية أيضاً
        and u.kind <> 'system'
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

revoke execute on function public.case_stream(uuid)  from anon, public;
revoke execute on function public.case_discussions() from anon, public;
grant  execute on function public.case_stream(uuid)  to authenticated;
grant  execute on function public.case_discussions() to authenticated;

/* ============ ٤. إعدادات الاستدعاء ============ */

-- anon_key عمداً لا "service_key": lookup_values يقرؤه كل موظف، والاسم
-- القديم فخّ يغري بوضع مفتاح service_role الحقيقي فيه مستقبلاً.
insert into public.lookup_values (type, label, value)
select 'discussion_ai_config', 'function_url',
       'https://zwaahunavepleczuamuy.supabase.co/functions/v1/discussion-ai'
where not exists (
  select 1 from public.lookup_values
  where type = 'discussion_ai_config' and label = 'function_url'
);

insert into public.lookup_values (type, label, value)
select 'discussion_ai_config', 'anon_key', v.value
from (select value from public.lookup_values
      where type = 'appt_confirm_config' and label = 'service_key' limit 1) v
where not exists (
  select 1 from public.lookup_values
  where type = 'discussion_ai_config' and label = 'anon_key'
);

-- سر داخلي عشوائي يتحقق منه كود الدالة — بوابة فوق مفتاح anon العام
insert into public.lookup_values (type, label, value)
select 'discussion_ai_config', 'inbound_secret', md5(gen_random_uuid()::text || clock_timestamp()::text)
where not exists (
  select 1 from public.lookup_values
  where type = 'discussion_ai_config' and label = 'inbound_secret'
);

/* ============ ٥. المشغّل ============ */

create or replace function public.case_comment_ai_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text;
  akey   text;
  secret text;
begin
  -- رسائل البشر فقط — الذكاء والنظام لا يستدعيان الذكاء (قطع الحلقة)
  if new.kind is distinct from 'user' then return new; end if;
  if new.deleted_at is not null then return new; end if;
  if coalesce(btrim(new.body), '') = '' then return new; end if;

  select value into fn_url from public.lookup_values
   where type = 'discussion_ai_config' and label = 'function_url' limit 1;
  select value into akey from public.lookup_values
   where type = 'discussion_ai_config' and label = 'anon_key' limit 1;
  select value into secret from public.lookup_values
   where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1;
  if fn_url is null or akey is null or secret is null then return new; end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || akey,
                 'x-ai-secret',   secret
               ),
    body    := jsonb_build_object('comment_id', new.id)
  );
  return new;
exception when others then
  -- الذكاء ثانوي: أي خطأ هنا يجب ألا يمنع حفظ الرسالة نفسها
  return new;
end;
$$;

revoke execute on function public.case_comment_ai_dispatch() from anon, public;

drop trigger if exists case_comment_ai_trg on public.case_comments;
create trigger case_comment_ai_trg
  after insert on public.case_comments
  for each row execute function public.case_comment_ai_dispatch();

commit;
