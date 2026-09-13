-- نقاش جديد مُسمّى بأعضاء (طلب المدير 2026-09-13:
-- «ودي أفتح نقاش جديد وأقدر أسميّه، وأضيف فيه الناس»)
--
-- النقاش المُسمّى = صف في cases بنوع 'channel' + أعضاؤه في channel_members.
-- لم تكن له واجهة إنشاء قط («إدارة المكتب» أُدخلت يدوياً)، وثلاثة أشياء تمنع إنشاءه بأمان:
--
-- (١) office_num إلزامي وفريد، ومولّد الترقيم يعطي القناة **رقم قضية** — هكذا ذهب
--     CASE26089 لقناة «إدارة المكتب» فانثقبت سلسلة أرقام الملفات. هنا تُعطى القناة
--     رقماً من خارج السلسلة (CH-…) فيتجاوزها المولّد (يعود فوراً متى وُجد رقم).
-- (٢) case_discussions() لا تُظهر خيطاً بلا رسائل — فالقناة الجديدة كانت ستختفي
--     من القائمة لحظة إنشائها. رسالة نظام عند الإنشاء تُظهرها وتقول مَن أنشأها ومَن فيها.
-- (٣) إضافة عضو لا تُشعره — فلا يعلم أنه صار في نقاش. ترقر على channel_members
--     يُشعر كل مضاف (عند الإنشاء وعند أي إضافة لاحقة من الويب أو التطبيق).

-- ── الإنشاء: ذرّي، وللمدير فقط (نفس حدّ إدارة الأعضاء القائم) ──
create or replace function public.create_channel(p_title text, p_member_ids uuid[] default '{}')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me    uuid;
  v_name  text;
  v_title text := btrim(coalesce(p_title, ''));
  v_id    uuid := gen_random_uuid();
  v_names text;
begin
  if not public.current_is_director() then
    raise exception 'إنشاء النقاشات للمدير فقط';
  end if;
  if v_title = '' then
    raise exception 'اكتب اسماً للنقاش';
  end if;
  if char_length(v_title) > 80 then
    raise exception 'اسم النقاش طويل — ٨٠ حرفاً على الأكثر';
  end if;

  select id, coalesce(short_name, name) into v_me, v_name
    from team_members where auth_id = auth.uid() limit 1;

  insert into cases (id, kind, title, office_num)
  values (v_id, 'channel', v_title, 'CH-' || upper(left(replace(v_id::text, '-', ''), 8)));

  -- المنشئ عضو دائماً؛ وحساب المراجعة والموقوفون لا يُضافون ولو مُرّروا
  insert into channel_members (channel_id, member_id, added_by)
  select v_id, t.id, v_me
    from team_members t
   where (t.id = v_me or t.id = any (coalesce(p_member_ids, '{}')))
     and coalesce(t.is_reviewer, false) = false
     and t.is_active is not false
  on conflict do nothing;

  select string_agg(coalesce(t.short_name, t.name), '، ' order by t.name)
    into v_names
    from channel_members m join team_members t on t.id = m.member_id
   where m.channel_id = v_id and m.member_id is distinct from v_me;

  insert into case_comments (case_id, author_id, body, kind)
  values (v_id, v_me,
          'أنشأ ' || coalesce(v_name, 'المدير') || ' النقاش' || coalesce(' وأضاف: ' || v_names, ''),
          'system');

  return v_id;
end $$;

revoke all on function public.create_channel(text, uuid[]) from public, anon;
grant execute on function public.create_channel(text, uuid[]) to authenticated;

-- ── حارس: حساب مراجعة أبل لا يدخل نقاشاً حقيقياً ولو من مسار الإضافة المباشر ──
create or replace function public.channel_member_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from team_members where id = new.member_id and coalesce(is_reviewer, false)) then
    raise exception 'حساب المراجعة لا يُضاف إلى النقاشات';
  end if;
  return new;
end $$;

drop trigger if exists channel_member_guard_trg on public.channel_members;
create trigger channel_member_guard_trg
  before insert on public.channel_members
  for each row execute function public.channel_member_guard();

-- ── إشعار المضاف ──
-- النوع 'mention' عمداً: وجهته في الدفع (notification_push_dispatch) وفي قائمة
-- إشعارات التطبيق وفي جرس الويب هي نقاش الخيط نفسه، وتفضيل «المنشن» عند العضو
-- يسري عليه — فلا حاجة لتعليم ثلاثة موجّهات نوعاً جديداً.
create or replace function public.channel_member_added_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text; v_by text;
begin
  if new.member_id is not distinct from new.added_by then return new; end if;  -- لا يُشعَر المرء بإضافة نفسه
  select title into v_title from cases where id = new.channel_id;
  select coalesce(short_name, name) into v_by from team_members where id = new.added_by;
  insert into notifications (type, title, message, recipient_id, case_id)
  values ('mention',
          'أضافك ' || coalesce(v_by, 'المدير') || ' إلى نقاش',
          coalesce(v_title, 'نقاش خاص'),
          new.member_id, new.channel_id);
  return new;
exception when others then
  return new;  -- الإشعار ثانوي — لا يمنع الإضافة
end $$;

drop trigger if exists channel_member_added_notify_trg on public.channel_members;
create trigger channel_member_added_notify_trg
  after insert on public.channel_members
  for each row execute function public.channel_member_added_notify();

revoke all on function public.channel_member_guard() from public, anon;
revoke all on function public.channel_member_added_notify() from public, anon;
