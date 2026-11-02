-- الرد على رسالة كالواتساب (طلب المدير 2026-11-03: «ودي … أرد على محادثة، وإذا رديت على محادثة يتسجل الرد في
-- الخيط حق المحادثة»). الرد = ردّ في خيط الرسالة يظهر في المجرى أيضاً (parent_id + also_to_stream)، وكان المجرى
-- يعرضه بلا ما يدلّ على أصله. صار يُرجع معرّف الأصل ومقتطفه (كاتبه، أول نصه، اسم مرفقه) فتُعرض فوق الرد
-- «فقاعة اقتباس» تفتح الخيط. ما عدا الأعمدة الأربعة الأخيرة فالدالة كما هي حرفاً.
drop function if exists public.case_stream(uuid);
create function public.case_stream(p_case_id uuid)
 returns table(id uuid, author_id uuid, author_name text, body text, kind text, document_id uuid, document_name text,
               document_url text, mentions uuid[], created_at timestamp with time zone, edited_at timestamp with time zone,
               reply_count bigint, last_reply_at timestamp with time zone, reactions jsonb, bookmarked boolean,
               parent_id uuid, parent_author text, parent_body text, parent_doc_name text)
 language sql
 stable
 set search_path to 'public'
as $function$
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
    ),
    c.parent_id,
    case when pc.id is null then null
         when pc.kind = 'ai' then 'الذكاء'
         else coalesce(ptm.short_name, ptm.name) end,
    case when pc.deleted_at is not null then 'رسالة محذوفة' else left(pc.body, 160) end,
    case when pc.deleted_at is null then pd.name end
  from case_comments c
  left join team_members tm on tm.id = c.author_id
  left join documents d on d.id = c.document_id
  left join case_comments pc on pc.id = c.parent_id
  left join team_members ptm on ptm.id = pc.author_id
  left join documents pd on pd.id = pc.document_id
  where c.case_id is not distinct from p_case_id
    and c.deleted_at is null
    and (c.parent_id is null or c.also_to_stream)
  order by c.created_at asc, c.id asc;
$function$;
revoke execute on function public.case_stream(uuid) from anon, public;
grant execute on function public.case_stream(uuid) to authenticated;
