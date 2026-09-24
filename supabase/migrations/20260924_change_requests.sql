-- «اقترح تعديلاً» من داخل النظام (طلب المدير 2026-09-24: «فيه طريقة اقدر اعدل في النظام
-- من داخل النظام نفسه؟» ثم اختار زرّ الاقتراح في كل صفحة).
--
-- الموظف يكتب طلبه من الصفحة التي هو فيها، فيُحفظ معه مسارها وعنوانها ولقطة شاشة لها —
-- فلا يحتاج وصف «أين كنت». وجلسة التطوير تقرأ الجديد منها («شف الطلبات») وتنفّذ، ثم
-- تردّ على كل طلب هنا بما عملته، فيصل صاحبَه إشعار.

create table if not exists public.change_requests (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.team_members(id) default public.my_member_id(),
  platform      text not null default 'web' check (platform in ('web', 'ios')),
  page_path     text,
  page_title    text,
  body          text not null check (char_length(btrim(body)) > 0),
  screenshot_url text,
  -- new: لم يُنظر فيه · in_progress: قيد التنفيذ · done: نُفّذ · declined: لن يُنفَّذ (مع السبب)
  status        text not null default 'new' check (status in ('new', 'in_progress', 'done', 'declined')),
  reply         text,
  replied_at    timestamptz,
  -- مرجع التعديل الذي نفّذه (commit) — ليُعرف أين طُبّق
  commit_ref    text
);

create index if not exists change_requests_status_idx on public.change_requests (status, created_at desc);
create index if not exists change_requests_creator_idx on public.change_requests (created_by);

alter table public.change_requests enable row level security;

-- القراءة: المدير يرى الكل، والموظف طلباته هو
drop policy if exists change_requests_read on public.change_requests;
create policy change_requests_read on public.change_requests
  for select to authenticated
  using ((select public.is_director_caller()) or created_by = (select public.my_member_id()));

-- الإدراج: باسمه هو، وجديداً بلا ردّ
drop policy if exists change_requests_insert on public.change_requests;
create policy change_requests_insert on public.change_requests
  for insert to authenticated
  with check (created_by = (select public.my_member_id()) and status = 'new' and reply is null);

-- التعديل والحذف: المدير وحده (الحالة والرد)
drop policy if exists change_requests_director on public.change_requests;
create policy change_requests_director on public.change_requests
  for update to authenticated
  using ((select public.is_director_caller()))
  with check ((select public.is_director_caller()));

drop policy if exists change_requests_delete on public.change_requests;
create policy change_requests_delete on public.change_requests
  for delete to authenticated
  using ((select public.is_director_caller()));

drop policy if exists collab_block on public.change_requests;
create policy collab_block on public.change_requests
  as restrictive for all to authenticated
  using ((not (select public.is_collaborator_caller())))
  with check ((not (select public.is_collaborator_caller())));

drop policy if exists reviewer_block on public.change_requests;
create policy reviewer_block on public.change_requests
  as restrictive for all to authenticated
  using ((not (select public.is_reviewer_caller())))
  with check ((not (select public.is_reviewer_caller())));

-- الإشعارات: اقتراح جديد من موظف ← المدير؛ وردّ أو تغيّر حالة ← صاحب الطلب
create or replace function public.change_request_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dir uuid; v_by text; v_title text;
begin
  if tg_op = 'INSERT' then
    select id into v_dir from team_members
     where is_director is true and coalesce(is_active, true) and not coalesce(is_reviewer, false)
     order by created_at limit 1;
    if v_dir is not null and v_dir is distinct from new.created_by then
      select coalesce(short_name, name) into v_by from team_members where id = new.created_by;
      insert into notifications (type, title, message, recipient_id)
      values ('change_request', 'اقتراح تعديل من ' || coalesce(v_by, 'زميل'),
              left(new.body, 140), v_dir);
    end if;
    return new;
  end if;

  -- تحديث: أشعِر صاحب الطلب حين يتغيّر ما يعنيه (الحالة أو الرد) — إلا إن كان هو المعدِّل
  if new.created_by is not null
     and new.created_by is distinct from public.my_member_id()
     and (new.status is distinct from old.status or new.reply is distinct from old.reply) then
    v_title := case new.status
      when 'done'        then 'نُفّذ اقتراحك'
      when 'in_progress' then 'اقتراحك قيد التنفيذ'
      when 'declined'    then 'ردٌّ على اقتراحك'
      else                    'ردٌّ على اقتراحك' end;
    insert into notifications (type, title, message, recipient_id)
    values ('change_request', v_title, left(coalesce(new.reply, new.body), 140), new.created_by);
  end if;
  return new;
exception when others then
  return new;  -- الإشعار ثانوي
end $$;

revoke all on function public.change_request_notify() from public, anon, authenticated;

drop trigger if exists change_request_notify_trg on public.change_requests;
create trigger change_request_notify_trg
  after insert or update on public.change_requests
  for each row execute function public.change_request_notify();

-- وجهة إشعار الدفع: صفحة الاقتراحات. ⚠️ النسخة الحية فيها مسارا hr_request/hr_result
-- (أُضيفا بعد 20260911) — محفوظان هنا كما هما.
create or replace function public.notification_push_dispatch()
returns trigger language plpgsql security definer
set search_path to 'public', 'extensions' as $function$
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
    when new.type = 'mention' and new.case_id is not null
      then '/discussions?case=' || new.case_id
    when new.type = 'mention' then '/discussions'
    when new.case_id is not null then '/cases/' || new.case_id
    when new.type like 'appointment%' then '/appointments'
    when new.type = 'hr_request' then '/hr/approvals'
    when new.type = 'hr_result' then '/me'
    when new.type = 'change_request' then '/change-requests'
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
