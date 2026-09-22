-- المحادثات المباشرة بين الزملاء (طلب المدير 2026-09-22:
-- «بارسل لرنا أو بيان أو سعود، كيف؟؟ أو العكس رنا بتتناقش مع بيان»)
--
-- لم يكن في النظام طريق لذلك: نقاش الملف لمن يرى الملف، وقناة «عام» للجميع،
-- والقنوات المسمّاة **ينشئها المدير وحده**. فالموظف لا يملك وسيلة لمراسلة زميله.
--
-- المحادثة المباشرة = صف cases بنوع 'dm' وعضوان في channel_members — فترث
-- الخيوط وإيصالات القراءة والمرفقات والملاحظات الصوتية والمنشن والتطبيق بلا جدول جديد.
--
-- ⚠️ قرار المدير: **الطرفان فقط** يقرآنها — لا استثناء للمدير. لذلك حواجز
--    الـdm أدناه لا تحوي `is_director_caller()` بخلاف حواجز القنوات.

begin;

/* ===== 1) نوع جديد ===== */
alter table public.cases drop constraint if exists cases_kind_check;
alter table public.cases add constraint cases_kind_check
  check (kind = any (array['case','legal_service','property','bankruptcy','channel','dm']));

/* ===== 2) من لا يرى أي محادثة مباشرة ===== */
-- نفس شكل my_blocked_channel_ids: تُحسب مرة لكل سؤال بـ(select …)
create or replace function public.my_blocked_dm_ids()
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(c.id), '{}') from cases c
  where c.kind = 'dm' and not public.is_channel_member(c.id)
$$;
revoke execute on function public.my_blocked_dm_ids() from anon;

/* ===== 3) الحواجز — بلا استثناء للمدير ===== */
drop policy if exists dm_select_gate on public.cases;
create policy dm_select_gate on public.cases
  as restrictive for select to authenticated
  using ((kind is distinct from 'dm')
         or (id is null)
         or (not (id = any ((select public.my_blocked_dm_ids())::uuid[]))));

-- لا أحد يعدّل صفّ المحادثة أو يحذفه من التطبيق (الإنشاء عبر open_dm وحدها)
drop policy if exists dm_update_gate on public.cases;
create policy dm_update_gate on public.cases
  as restrictive for update to authenticated
  using (kind is distinct from 'dm');

drop policy if exists dm_delete_gate on public.cases;
create policy dm_delete_gate on public.cases
  as restrictive for delete to authenticated
  using (kind is distinct from 'dm');

-- الرسائل: قراءةً وكتابةً وتعديلاً وحذفاً — للطرفين وحدهما
drop policy if exists dm_comments_gate on public.case_comments;
create policy dm_comments_gate on public.case_comments
  as restrictive for all to authenticated
  using ((case_id is null)
         or (not (case_id = any ((select public.my_blocked_dm_ids())::uuid[]))))
  with check ((case_id is null)
         or (not (case_id = any ((select public.my_blocked_dm_ids())::uuid[]))));

-- إيصالات القراءة: متى فتح الطرف الآخر المحادثة ليس شأن ثالث
drop policy if exists dm_reads_gate on public.case_reads;
create policy dm_reads_gate on public.case_reads
  as restrictive for all to authenticated
  using ((case_id is null)
         or (not (case_id = any ((select public.my_blocked_dm_ids())::uuid[]))))
  with check ((case_id is null)
         or (not (case_id = any ((select public.my_blocked_dm_ids())::uuid[]))));

-- حتى «من يحادث من» لا يُقرأ من خارج المحادثة
drop policy if exists dm_members_gate on public.channel_members;
create policy dm_members_gate on public.channel_members
  as restrictive for all to authenticated
  using (not (channel_id = any ((select public.my_blocked_dm_ids())::uuid[])))
  with check (not (channel_id = any ((select public.my_blocked_dm_ids())::uuid[])));

/* ===== 4) فتح المحادثة — واحدة لكل ثنائي ===== */
create or replace function public.open_dm(p_other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid; v_id uuid;
begin
  select id into v_me from team_members
   where auth_id = auth.uid() and is_active is not false limit 1;
  if v_me is null then raise exception 'لا حساب موظف لهذا المستخدم'; end if;
  if p_other is null or p_other = v_me then raise exception 'اختر زميلاً غير نفسك'; end if;
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

  -- قفل على الثنائي: لو ضغط الاثنان «محادثة» في اللحظة نفسها لم تُنشأ محادثتان
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
  -- العنوان هنا ثابت، والمعروض في القائمة اسم الطرف الآخر (لكل قارئ اسمه)
  insert into cases (id, kind, title, office_num)
  values (v_id, 'dm', 'محادثة مباشرة',
          'DM-' || upper(left(replace(v_id::text, '-', ''), 8)));
  insert into channel_members (channel_id, member_id, added_by)
  values (v_id, v_me, v_me), (v_id, p_other, v_me);
  return v_id;
end $$;

revoke all on function public.open_dm(uuid) from public, anon;
grant execute on function public.open_dm(uuid) to authenticated;

/* ===== 5) المحادثة لا تدخل سجلّ المكتب ولا قصة الملفات ===== */
create or replace function public.log_case_birth() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind not in ('channel', 'dm') then
    perform log_matter_event(new.id, 'birth',
      'فُتح الملف' || coalesce(' — ' || nullif(new.title,''), '') ||
        ' بتاريخ ' || to_char(coalesce(new.open_date, current_date),'DD/MM/YYYY'),
      '{}'::jsonb, false, 'birth:' || new.id);
  end if;
  return new;
end; $$;

create or replace function public.feed_cases() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- المحادثة المباشرة خاصة: لا تُعلن في نشاط المكتب
  if new.kind = 'dm' then return new; end if;
  if tg_op = 'INSERT' then
    perform log_activity('create', new.kind, new.id, new.title,
      case when new.kind = 'case' then new.id else null end);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform log_activity('status', new.kind, new.id, new.title,
      case when new.kind = 'case' then new.id else null end,
      null, null, old.status, new.status);
  end if;
  return new;
exception when others then return new;
end; $$;

/* ===== 6) الإشعارات ===== */
-- فتح المحادثة ليس «إضافة إلى نقاش» — لا إشعار حتى تصل رسالة
create or replace function public.channel_member_added_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text; v_by text; v_kind text;
begin
  if new.member_id is not distinct from new.added_by then return new; end if;
  select title, kind into v_title, v_kind from cases where id = new.channel_id;
  if v_kind = 'dm' then return new; end if;
  select coalesce(short_name, name) into v_by from team_members where id = new.added_by;
  insert into notifications (type, title, message, recipient_id, case_id)
  values ('mention',
          'أضافك ' || coalesce(v_by, 'المدير') || ' إلى نقاش',
          coalesce(v_title, 'نقاش خاص'),
          new.member_id, new.channel_id);
  return new;
exception when others then
  return new;
end $$;

-- ورسالة المحادثة المباشرة تُشعر الطرف الآخر دائماً، لا عند المنشن وحده
create or replace function public.dm_message_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_other uuid; v_by text;
begin
  if new.kind <> 'user' or new.case_id is null then return new; end if;
  if not exists (select 1 from cases where id = new.case_id and kind = 'dm') then
    return new;
  end if;
  select m.member_id into v_other from channel_members m
   where m.channel_id = new.case_id
     and m.member_id is distinct from new.author_id
   limit 1;
  if v_other is null then return new; end if;
  -- لا إشعارَين لرسالة واحدة
  if new.mentions is not null and v_other = any (new.mentions) then return new; end if;

  select coalesce(short_name, name) into v_by from team_members where id = new.author_id;
  insert into notifications (type, title, message, recipient_id, case_id)
  values ('mention',
          'رسالة من ' || coalesce(v_by, 'زميل'),
          left(coalesce(new.body, 'مرفق'), 140),
          v_other, new.case_id);
  return new;
exception when others then
  return new;   -- الإشعار ثانوي — لا يمنع حفظ الرسالة
end $$;

drop trigger if exists dm_message_notify_trg on public.case_comments;
create trigger dm_message_notify_trg
  after insert on public.case_comments
  for each row execute function public.dm_message_notify();

commit;
