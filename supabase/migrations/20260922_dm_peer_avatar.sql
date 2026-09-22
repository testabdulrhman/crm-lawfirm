-- صورة الطرف الآخر في المحادثة المباشرة مكان الرمز العام
-- (طلب المدير 2026-09-22: «ودي تطلع صورتي… تكون مكان الرمز»)
--
-- عمودان في آخر الدالة: التطبيق المنشور يقرأ بالأسماء لا بالمواضع فلا يتأثر.
-- ⚠️ drop function يمسح الصلاحيات — تُعاد في آخر الملف كما كانت منذ 20260821.

drop function if exists public.case_discussions();

create function public.case_discussions()
returns table(case_id uuid, case_title text, office_num text, last_body text,
              last_at timestamp with time zone, last_author text, has_file boolean,
              unread bigint, kind text,
              peer_avatar_url text, peer_avatar_initial text)
language sql stable set search_path to 'public' as $function$
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
  peer as (
    select cm.channel_id, t.short_name, t.name, t.avatar_url, t.avatar_initial
    from channel_members cm
    join team_members t on t.id = cm.member_id
    join cases c on c.id = cm.channel_id and c.kind = 'dm'
    where cm.member_id is distinct from (select tm_id from me)
  ),
  rows_with_msgs as (
    select
      l.case_id,
      case when cs.kind = 'dm'
             then coalesce(p.short_name, p.name, 'محادثة مباشرة')
           else coalesce(cs.title, 'عام — المكتب') end as case_title,
      case when cs.kind = 'dm' then null else cs.office_num end as office_num,
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
      ) as unread,
      cs.kind,
      case when cs.kind = 'dm' then p.avatar_url end as peer_avatar_url,
      case when cs.kind = 'dm' then coalesce(p.avatar_initial,
             left(coalesce(p.short_name, p.name, '؟'), 1)) end as peer_avatar_initial
    from last_msg l
    left join cases cs on cs.id = l.case_id
    left join team_members tm on tm.id = l.author_id
    left join peer p on p.channel_id = cs.id
  )
  select * from rows_with_msgs
  union all
  select null::uuid, 'عام — المكتب', null, null, null, null, false, 0::bigint, null, null, null
  where not exists (
    select 1 from case_comments where case_id is null and deleted_at is null
  )
  order by last_at desc nulls last;
$function$;

revoke execute on function public.case_discussions() from anon, public;
grant execute on function public.case_discussions() to authenticated;
