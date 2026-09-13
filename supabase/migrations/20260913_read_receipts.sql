-- إيصالات القراءة في النقاشات (طلب المدير 2026-09-13):
-- «ودي في صفحة النقاش يكون مثل الواتس أب مُرسل الرسالة يعرف من قرأ المحادثة»
--
-- لا جدول جديد: case_reads يسجّل آخر فتح لكل عضو لكل نقاش، فمن قرأ الرسالة M = كل عضو فتح
-- النقاش بعد وقت M (مثل الواتساب: فتح المحادثة). وسياسة own_reads تحجب صفوف الآخرين عن
-- العميل، فالحساب بدوال SECURITY DEFINER تُرجع للمُرسل وحده ما يخصّ رسائله.
-- ⚠️ توقيت القارئ هو آخر فتح له للنقاش لا لحظة قراءته هذه الرسالة — الواجهة تقوله صراحةً.

-- جمهور النقاش (من يُنتظر أن يقرأ) — داخلية، لا تُنادى من العميل
create or replace function public.thread_audience(p_case_id uuid)
returns table(member_id uuid)
language plpgsql stable security definer set search_path = public as $$
declare v_kind text; v_assignee uuid;
begin
  if p_case_id is null then
    -- القناة العامة: الفريق النشط، بلا حساب المراجعة ولا المتعاون الخارجي (لا يراها)
    return query
      select t.id from team_members t
       where t.is_active is not false and coalesce(t.is_reviewer, false) = false
         and coalesce(t.member_type, 'employee') <> 'collaborator';
    return;
  end if;
  select c.kind, c.assignee_id into v_kind, v_assignee from cases c where c.id = p_case_id;
  if v_kind = 'channel' then
    return query
      select t.id from channel_members m join team_members t on t.id = m.member_id
       where m.channel_id = p_case_id and t.is_active is not false and coalesce(t.is_reviewer, false) = false;
  else
    -- نقاش الملف: مسؤوله وفريقه والمدير
    return query
      select t.id from team_members t
       where t.is_active is not false and coalesce(t.is_reviewer, false) = false
         and (t.id = v_assignee or coalesce(t.is_director, false)
              or exists (select 1 from case_members cm where cm.case_id = p_case_id and cm.member_id = t.id));
  end if;
end $$;

revoke all on function public.thread_audience(uuid) from public, anon, authenticated;

-- علامات رسائلي في مجرى نقاش: كم قرأها، وكم من الجمهور لم يقرأها بعد
create or replace function public.stream_read_counts(p_case_id uuid)
returns table(comment_id uuid, readers int, pending int)
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid;
begin
  select id into v_me from team_members where auth_id = auth.uid() limit 1;
  if v_me is null or not public.can_access_thread(p_case_id) then
    return;
  end if;
  return query
    with aud as (select a.member_id as mid from public.thread_audience(p_case_id) a)
    select c.id,
      (select count(*)::int from case_reads r
        where r.case_id is not distinct from p_case_id
          and r.member_id <> c.author_id and r.read_at >= c.created_at),
      (select count(*)::int from aud
        where aud.mid <> c.author_id
          and not exists (select 1 from case_reads r
                           where r.case_id is not distinct from p_case_id
                             and r.member_id = aud.mid and r.read_at >= c.created_at))
    from case_comments c
    where c.case_id is not distinct from p_case_id
      and c.author_id = v_me and c.kind = 'user' and c.deleted_at is null
      and (c.parent_id is null or c.also_to_stream);
end $$;

revoke all on function public.stream_read_counts(uuid) from public, anon;
grant execute on function public.stream_read_counts(uuid) to authenticated;

-- من قرأ رسالتي ومن لم يقرأها — لمُرسلها وحده
create or replace function public.message_read_receipts(p_comment_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid;
  v_case uuid; v_author uuid; v_at timestamptz; v_found boolean;
begin
  select id into v_me from team_members where auth_id = auth.uid() limit 1;
  select true, c.case_id, c.author_id, c.created_at into v_found, v_case, v_author, v_at
    from case_comments c where c.id = p_comment_id and c.deleted_at is null;
  if v_found is null then
    raise exception 'الرسالة غير موجودة';
  end if;
  if v_author is distinct from v_me then
    raise exception 'معلومات القراءة لمُرسل الرسالة وحده';
  end if;
  if not public.can_access_thread(v_case) then
    raise exception 'لا تملك الوصول إلى هذا النقاش';
  end if;

  return jsonb_build_object(
    'readers', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', t.id, 'name', t.name, 'short_name', t.short_name,
               'avatar_initial', t.avatar_initial, 'avatar_color', t.avatar_color,
               'avatar_url', t.avatar_url, 'read_at', r.read_at) order by r.read_at desc)
        from case_reads r join team_members t on t.id = r.member_id
       where r.case_id is not distinct from v_case and r.member_id <> v_author
         and r.read_at >= v_at and coalesce(t.is_reviewer, false) = false), '[]'::jsonb),
    'not_read', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', t.id, 'name', t.name, 'short_name', t.short_name,
               'avatar_initial', t.avatar_initial, 'avatar_color', t.avatar_color,
               'avatar_url', t.avatar_url) order by t.name)
        from public.thread_audience(v_case) a join team_members t on t.id = a.member_id
       where a.member_id <> v_author
         and not exists (select 1 from case_reads r
                          where r.case_id is not distinct from v_case
                            and r.member_id = a.member_id and r.read_at >= v_at)), '[]'::jsonb));
end $$;

revoke all on function public.message_read_receipts(uuid) from public, anon;
grant execute on function public.message_read_receipts(uuid) to authenticated;
