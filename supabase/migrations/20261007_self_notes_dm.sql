-- «ملاحظاتي»: المحادثة المباشرة مع نفسك (طلب المدير 2026-10-07: «في المحادثة المباشرة ودي أقدر احادث نفسي
-- عشان مثلاً لو استخدمه كأنه محفوظات») — كـ«راسل نفسك» في الواتساب. نقاش dm بعضوٍ واحد، فحواجز المحادثة
-- المباشرة نفسها (my_blocked_dm_ids) تحجبه عن غيرك بلا استثناء — حتى المدير.

CREATE OR REPLACE FUNCTION public.open_dm(p_other uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_me uuid; v_id uuid;
begin
  select id into v_me from team_members
   where auth_id = auth.uid() and is_active is not false limit 1;
  if v_me is null then raise exception 'لا حساب موظف لهذا المستخدم'; end if;
  if p_other is null then raise exception 'اختر زميلاً'; end if;
  if public.is_collaborator_caller() then
    raise exception 'المحادثات المباشرة غير متاحة للمتعاون الخارجي';
  end if;
  if exists (select 1 from team_members
              where id in (v_me, p_other) and coalesce(is_reviewer, false)) then
    raise exception 'حساب المراجعة لا يدخل المحادثات';
  end if;
  if not exists (select 1 from team_members
                  where id = p_other and is_active is not false) then
    raise exception 'هذا الزميل غير مُفعّل';
  end if;

  -- «ملاحظاتي»: محادثة مع نفسك — عضوٌ واحد (طلب المدير 2026-10-07: «ودي أقدر احادث نفسي… كأنه محفوظات»)
  if p_other = v_me then
    perform pg_advisory_xact_lock(hashtextextended('self:' || v_me::text, 0));
    select c.id into v_id from cases c
     where c.kind = 'dm'
       and exists (select 1 from channel_members m where m.channel_id = c.id and m.member_id = v_me)
       and (select count(*) from channel_members m where m.channel_id = c.id) = 1
     limit 1;
    if v_id is not null then return v_id; end if;
    v_id := gen_random_uuid();
    insert into cases (id, kind, title, office_num)
    values (v_id, 'dm', 'ملاحظاتي', 'DM-' || upper(left(replace(v_id::text, '-', ''), 8)));
    insert into channel_members (channel_id, member_id, added_by) values (v_id, v_me, v_me);
    return v_id;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(v_me, p_other)::text || greatest(v_me, p_other)::text, 0));

  select c.id into v_id from cases c
   where c.kind = 'dm'
     and exists (select 1 from channel_members m
                  where m.channel_id = c.id and m.member_id = v_me)
     and exists (select 1 from channel_members m
                  where m.channel_id = c.id and m.member_id = p_other)
     and (select count(*) from channel_members m where m.channel_id = c.id) = 2
   limit 1;
  if v_id is not null then return v_id; end if;

  v_id := gen_random_uuid();
  insert into cases (id, kind, title, office_num)
  values (v_id, 'dm', 'محادثة مباشرة',
          'DM-' || upper(left(replace(v_id::text, '-', ''), 8)));
  insert into channel_members (channel_id, member_id, added_by)
  values (v_id, v_me, v_me), (v_id, p_other, v_me);
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.case_discussions()
 RETURNS TABLE(case_id uuid, case_title text, office_num text, last_body text, last_at timestamp with time zone, last_author text, has_file boolean, unread bigint, kind text, peer_avatar_url text, peer_avatar_initial text)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with me as (
    select id as tm_id, avatar_url as my_avatar_url,
           coalesce(avatar_initial, left(coalesce(short_name, name, '؟'), 1)) as my_initial
      from team_members where auth_id = auth.uid() limit 1
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
             -- محادثة بلا طرفٍ آخر = «ملاحظاتي» (محادثتك مع نفسك — 2026-10-07)
             then coalesce(p.short_name, p.name, case when p.channel_id is null then 'ملاحظاتي' end, 'محادثة مباشرة')
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
      case when cs.kind = 'dm' then
             case when p.channel_id is null then (select my_avatar_url from me) else p.avatar_url end end as peer_avatar_url,
      case when cs.kind = 'dm' then
             case when p.channel_id is null then (select my_initial from me)
                  else coalesce(p.avatar_initial, left(coalesce(p.short_name, p.name, '؟'), 1)) end end as peer_avatar_initial
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
$function$
;
