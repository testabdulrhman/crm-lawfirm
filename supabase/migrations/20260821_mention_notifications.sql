-- منشن الموظفين في النقاش (طلب المستخدم 2026-08-21: «ابي اعمل منشن للي عندي»)
--
-- العمود case_comments.mentions uuid[] موجود منذ إنشاء النقاش بلا استخدام.
-- العملاء (ويب/تطبيق) يرسلون معرّفات المذكورين صراحةً — لا تحليل نصّي
-- للأسماء (هشّ مع الأسماء العربية المركّبة) — وهذا الترقر يوصل الإشعار.

begin;

create or replace function public.notify_mentions() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.kind = 'user'
     and new.mentions is not null
     and array_length(new.mentions, 1) > 0 then
    insert into notifications (type, title, message, recipient_id, case_id)
    select
      'mention',
      'ذكرك ' || coalesce(
        (select coalesce(short_name, name) from team_members where id = new.author_id),
        'زميل') || ' في النقاش',
      left(coalesce(new.body, 'مرفق'), 140),
      m,
      new.case_id
    from unnest(new.mentions) as m
    where m is distinct from new.author_id;  -- ذكر النفس لا يُشعر
  end if;
  return new;
exception when others then
  return new; -- الإشعار ثانوي — لا يمنع حفظ الرسالة
end; $$;

revoke execute on function public.notify_mentions() from anon, public;

drop trigger if exists case_comment_mentions_trg on public.case_comments;
create trigger case_comment_mentions_trg
  after insert on public.case_comments
  for each row execute function public.notify_mentions();

commit;

-- ثانياً (طلب المستخدم نفسه اليوم): «لما افتح نقاش تابع لقضية ودي اقدر اروح
-- لهذه القضية» — الزر يحتاج نوع الملف ليعرف الوجهة (قضية/استشارة/توثيق)،
-- فنضيف kind آخر أعمدة case_discussions. تغيير التوقيع يستلزم drop أولاً؛
-- العمود الأخير إضافة آمنة للتطبيق المنشور (قراءة بالأسماء لا بالمواضع).

begin;

drop function if exists public.case_discussions();

create or replace function public.case_discussions()
returns table (
  case_id      uuid,
  case_title   text,
  office_num   text,
  last_body    text,
  last_at      timestamptz,
  last_author  text,
  has_file     boolean,
  unread       bigint,
  kind         text
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
      ) as unread,
      cs.kind
    from last_msg l
    left join cases cs on cs.id = l.case_id
    left join team_members tm on tm.id = l.author_id
  )
  select * from rows_with_msgs
  union all
  -- العامة تظهر دائماً ولو بلا رسائل — قناة غير مرئية قناة ميتة
  select null::uuid, 'عام — المكتب', null, null, null, null, false, 0::bigint, null
  where not exists (
    select 1 from case_comments where case_id is null and deleted_at is null
  )
  order by last_at desc nulls last;
$$;

revoke execute on function public.case_discussions() from anon, public;
grant  execute on function public.case_discussions() to authenticated;

commit;
