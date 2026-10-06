-- صندوق «العملاء»: الموظفون يراسلون العملاء على الواتساب من النظام (قرار المدير 2026-10-06).
--  - المحادثة لرقمٍ واحد (wa_threads) تُربط بملفٍ واحد؛ ومن ربطها مرة تذهب كل رسائل الرقم بعدها إلى الملف نفسه.
--  - يراها: مسؤول الملف وفريقه (can_access_case)، والمدير ومن له «الاطلاع على كل شيء» (راكان) يرون الكل.
--  - «غير مصنّف» (بلا ملف): للمدير وراكان وحدهما، وهما وحدهما يربطان ويغيّران الربط.
--  - النص نفسه يُقرأ من الـHub عند الفتح (law_thread عبر wa-inbox) — هنا الفهرس والربط والقراءة وسجل ما أرسلناه.
--  - النقاشات تبقى للفريق: لا شيء يُرسل للعميل من نقاش.

create table if not exists public.wa_threads (
  phone_e164      text primary key,
  contact_id      uuid references public.contacts(id) on delete set null,
  case_id         uuid references public.cases(id) on delete set null,
  display_name    text,
  last_message_at timestamptz,
  last_in_at      timestamptz,
  last_preview    text,
  last_direction  text,
  linked_by       uuid references public.team_members(id) on delete set null,
  linked_at       timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists wa_threads_case_idx on public.wa_threads(case_id);
create index if not exists wa_threads_last_idx on public.wa_threads(last_message_at desc);

create table if not exists public.wa_inbox_reads (
  phone_e164 text not null references public.wa_threads(phone_e164) on delete cascade,
  member_id  uuid not null references public.team_members(id) on delete cascade,
  read_at    timestamptz not null default now(),
  primary key (phone_e164, member_id)
);

-- ما أرسله موظفونا — به يُعرف اسم المرسل في المحادثة (المفتاح يعود من الـHub مع الرسالة)
create table if not exists public.wa_outbox (
  id              uuid primary key default gen_random_uuid(),
  phone_e164      text not null references public.wa_threads(phone_e164) on delete cascade,
  member_id       uuid references public.team_members(id) on delete set null,
  body            text not null,
  template        text,
  idempotency_key text not null unique,
  status          text not null default 'sending',
  error           text,
  created_at      timestamptz not null default now()
);
create index if not exists wa_outbox_phone_idx on public.wa_outbox(phone_e164, created_at desc);

-- الإشعار يحمل رقم المحادثة ليفتحها ويُعلَّم مقروءاً بفتحها
alter table public.notifications add column if not exists wa_phone text;

-- ---------- الرؤية ----------
create or replace function public.can_see_wa_thread(p_phone text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $$
  select public.is_office_viewer_caller()
      or exists (select 1 from wa_threads t
                  where t.phone_e164 = p_phone and t.case_id is not null
                    and public.can_access_case(t.case_id));
$$;
revoke all on function public.can_see_wa_thread(text) from public, anon;
grant execute on function public.can_see_wa_thread(text) to authenticated;

alter table public.wa_threads enable row level security;
alter table public.wa_inbox_reads enable row level security;
alter table public.wa_outbox enable row level security;

drop policy if exists wa_threads_read on public.wa_threads;
create policy wa_threads_read on public.wa_threads for select to authenticated
  using (public.is_office_viewer_caller() or (case_id is not null and public.can_access_case(case_id)));

drop policy if exists wa_inbox_reads_own on public.wa_inbox_reads;
create policy wa_inbox_reads_own on public.wa_inbox_reads for all to authenticated
  using (member_id = public.my_member_id())
  with check (member_id = public.my_member_id() and public.can_see_wa_thread(phone_e164));

drop policy if exists wa_outbox_read on public.wa_outbox;
create policy wa_outbox_read on public.wa_outbox for select to authenticated
  using (public.can_see_wa_thread(phone_e164));
-- لا كتابة مباشرة: الإرسال من wa-inbox بمفتاح الخدمة، والربط من wa_link_thread
revoke insert, update, delete on public.wa_threads, public.wa_outbox from anon, authenticated;
revoke all on public.wa_threads, public.wa_inbox_reads, public.wa_outbox from anon;

-- ---------- الربط الآلي ----------
-- جهة اتصال وحيدة بالرقم (آخر ٩ خانات من الجوال أو الجوال الثاني) ⇒ تُربط؛
-- ولها ملف مفتوح وحيد ⇒ يُربط به. وما سوى ذلك يبقى «غير مصنّف» للمدير وراكان.
create or replace function public.wa_guess_link(p_phone text)
 returns table(contact_id uuid, case_id uuid)
 language plpgsql
 stable security definer
 set search_path to 'public'
as $$
declare
  v_tail text := right(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), 9);
  v_contacts uuid[];
  v_cases uuid[];
begin
  if length(v_tail) < 9 then return; end if;
  select array_agg(distinct c.id) into v_contacts from contacts c
   where right(regexp_replace(coalesce(c.phone, ''), '\D', '', 'g'), 9) = v_tail
      or right(regexp_replace(coalesce(c.phone2, ''), '\D', '', 'g'), 9) = v_tail;
  -- الرقم نفسه قد يكون «متصلاً» سجّله هاتف و«موكّلاً» معاً ⇒ يُقدَّم الموكّل
  if coalesce(array_length(v_contacts, 1), 0) > 1 then
    select array_agg(id) into v_contacts from contacts where id = any(v_contacts) and type = 'client';
  end if;
  if coalesce(array_length(v_contacts, 1), 0) <> 1 then return; end if;
  select array_agg(m.id) into v_cases from cases m
   where m.contact_id = v_contacts[1] and m.deleted_at is null
     and m.kind in ('case', 'legal_service', 'property', 'bankruptcy')
     and coalesce(m.status, '') not in ('muntahia', 'مكتملة', 'delivered');
  contact_id := v_contacts[1];
  case_id := case when coalesce(array_length(v_cases, 1), 0) = 1 then v_cases[1] end;
  return next;
end $$;
revoke all on function public.wa_guess_link(text) from public, anon, authenticated;

-- ---------- الوارد ⇒ المحادثة + إشعار ----------
create or replace function public.wa_thread_on_incoming()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  t wa_threads%rowtype;
  g record;
  v_preview text := left(coalesce(nullif(trim(new.body), ''), case when new.media_label is not null then '📎 ' || new.media_label else '📎 مرفق' end), 140);
  v_name text;
  v_case text;
  r uuid;
begin
  if new.direction <> 'in' or new.phone_e164 like 'test:%' then return new; end if;

  insert into wa_threads (phone_e164, last_message_at, last_in_at, last_preview, last_direction)
  values (new.phone_e164, new.created_at, new.created_at, v_preview, 'in')
  on conflict (phone_e164) do update
     set last_message_at = greatest(wa_threads.last_message_at, excluded.last_message_at),
         last_in_at = greatest(wa_threads.last_in_at, excluded.last_in_at),
         last_preview = excluded.last_preview, last_direction = 'in';

  select * into t from wa_threads where phone_e164 = new.phone_e164;
  -- لم يربطه أحدٌ بيده ⇒ يُعاد التخمين (قد تُسجَّل جهة الاتصال أو ملفها بعد أول رسالة)
  if t.linked_by is null and t.case_id is null then
    select * into g from wa_guess_link(new.phone_e164);
    if g.contact_id is not null then
      update wa_threads set contact_id = g.contact_id, case_id = g.case_id where phone_e164 = new.phone_e164
      returning * into t;
    end if;
  end if;

  v_name := coalesce((select name from contacts where id = t.contact_id), t.display_name,
                     '0' || right(new.phone_e164, 9));
  v_case := (select office_num from cases where id = t.case_id);

  -- من يُخطَر: مسؤول الملف وفريقه؛ وغير المصنّف للمدير وراكان. ولا يتكرر لمن عنده إشعار
  -- غير مقروء من المحادثة نفسها في آخر ٣٠ دقيقة (العميل يكتب على رسائل متتابعة).
  for r in
    select distinct x from (
      select c.assignee_id x from cases c where c.id = t.case_id
      union all select cm.member_id from case_members cm where cm.case_id = t.case_id
      union all select tm.id from team_members tm
                 where t.case_id is null and tm.is_active and (tm.is_director or tm.can_view_all)
    ) s where x is not null
  loop
    if exists (select 1 from team_members where id = r and is_active)
       and not exists (select 1 from notifications n
                        where n.recipient_id = r and n.type = 'wa_client' and n.wa_phone = new.phone_e164
                          and not n.is_read and n.created_at > now() - interval '30 minutes') then
      insert into notifications (type, title, message, recipient_id, case_id, wa_phone)
      values ('wa_client',
              '💬 ' || v_name || coalesce(' · ' || v_case, ' · غير مصنّف'),
              v_preview, r, t.case_id, new.phone_e164);
    end if;
  end loop;
  return new;
exception when others then
  return new; -- ثانوي: لا يمنع تسجيل الوارد
end $$;
revoke all on function public.wa_thread_on_incoming() from public, anon, authenticated;

drop trigger if exists wa_thread_on_incoming_trg on public.wa_reception_messages;
create trigger wa_thread_on_incoming_trg
  after insert on public.wa_reception_messages
  for each row execute function public.wa_thread_on_incoming();

-- ---------- الربط اليدوي (المدير وراكان) ----------
create or replace function public.wa_link_thread(p_phone text, p_case_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_contact uuid;
begin
  if not public.is_office_viewer_caller() then
    raise exception 'ربط المحادثات للمدير ومن له الاطلاع على كل شيء';
  end if;
  if p_case_id is not null then
    select contact_id into v_contact from cases where id = p_case_id and deleted_at is null;
    if not found then raise exception 'الملف غير موجود'; end if;
  end if;
  update wa_threads
     set case_id = p_case_id,
         contact_id = coalesce(v_contact, contact_id),
         linked_by = public.my_member_id(), linked_at = now()
   where phone_e164 = p_phone;
  if not found then raise exception 'المحادثة غير موجودة'; end if;
  -- إشعارات المحادثة القديمة تتبع ملفها الجديد
  update notifications set case_id = p_case_id where type = 'wa_client' and wa_phone = p_phone and not is_read;
end $$;
revoke all on function public.wa_link_thread(text, uuid) from public, anon;
grant execute on function public.wa_link_thread(text, uuid) to authenticated;

-- ---------- القراءة ----------
create or replace function public.wa_mark_read(p_phone text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_me uuid := public.my_member_id();
begin
  if v_me is null or not public.can_see_wa_thread(p_phone) then return; end if;
  insert into wa_inbox_reads (phone_e164, member_id, read_at) values (p_phone, v_me, now())
  on conflict (phone_e164, member_id) do update set read_at = now();
  update notifications set is_read = true
   where recipient_id = v_me and type = 'wa_client' and wa_phone = p_phone and not is_read;
end $$;
revoke all on function public.wa_mark_read(text) from public, anon;
grant execute on function public.wa_mark_read(text) to authenticated;

-- ---------- فئة الإشعار: «رسائل العملاء» مستقلة ----------
create or replace function public.notification_category(p_type text)
 returns text
 language sql
 immutable
 set search_path to 'public'
as $function$
  select case
    when p_type = 'mention'            then 'mention'
    when p_type like 'task%'           then 'tasks'
    when p_type like 'approval%'       then 'approvals'
    when p_type like 'session%'        then 'sessions'
    when p_type = 'deadline'           then 'deadlines'
    when p_type like 'appointment%'    then 'appointments'
    when p_type = 'birthday'           then 'birthdays'
    when p_type = 'incoming_message'   then 'inbox'
    when p_type = 'wa_client'          then 'clients'
    when p_type like 'hr%'             then 'hr'
    else 'other'
  end
$function$;

-- ---------- رجعياً: المحادثات القائمة بلا إشعار ----------
insert into public.wa_threads (phone_e164, last_message_at, last_in_at, last_preview, last_direction)
select distinct on (phone_e164) phone_e164, created_at, created_at,
       left(coalesce(nullif(trim(body), ''), '📎 ' || coalesce(media_label, 'مرفق')), 140), 'in'
  from public.wa_reception_messages
 where direction = 'in' and phone_e164 not like 'test:%'
 order by phone_e164, created_at desc
on conflict (phone_e164) do nothing;

update public.wa_threads t set contact_id = g.contact_id, case_id = g.case_id
  from public.wa_threads t2 cross join lateral public.wa_guess_link(t2.phone_e164) g
 where t.phone_e164 = t2.phone_e164 and t.linked_by is null and g.contact_id is not null;

update public.wa_threads t set display_name = nullif(trim(c.intake_data->>'name'), '')
  from public.wa_reception_conversations c
 where c.phone_e164 = t.phone_e164 and t.display_name is null;

-- ---------- إشعار الدفع: رسالة العميل تفتح محادثته في «العملاء» لا صفحة الملف ----------
create or replace function public.notification_push_dispatch()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  fn_url text; akey text; secret text; v_route text;
begin
  if new.recipient_id is null then return new; end if;
  if public.notification_pref_mode(new.recipient_id, new.type) = 'inapp' then return new; end if;

  select value into fn_url from public.lookup_values
   where type = 'push_config' and label = 'function_url' limit 1;
  select value into akey from public.lookup_values
   where type = 'discussion_ai_config' and label = 'anon_key' limit 1;
  select value into secret from public.lookup_values
   where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1;
  if fn_url is null or akey is null or secret is null then return new; end if;

  v_route := case
    when new.task_id is not null then '/tasks/' || new.task_id
    when new.type = 'wa_client' and new.wa_phone is not null then '/clients?phone=' || new.wa_phone
    when new.type = 'mention' and new.case_id is not null
      then '/discussions?case=' || new.case_id
    when new.type = 'mention' then '/discussions'
    when new.case_id is not null then '/cases/' || new.case_id
    when new.type like 'appointment%' then '/appointments'
    when new.type = 'hr_request' then '/hr/approvals'
    when new.type = 'hr_result' then '/me'
    when new.type = 'change_request' then '/change-requests'
    when new.type = 'office_doc_expiry' then '/office-documents'
    else '/'
  end;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || akey,
                 'x-ai-secret',   secret),
    body    := jsonb_build_object(
                 'member_ids',       jsonb_build_array(new.recipient_id),
                 'title',            coalesce(new.title, 'إشعار'),
                 'message',          coalesce(new.message, ''),
                 'route',            v_route,
                 'notification_ids', jsonb_build_array(new.id))
  );
  return new;
exception when others then
  return new;
end; $function$;
