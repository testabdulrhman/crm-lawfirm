-- تفضيلات الإشعارات لكل موظف (طلب المستخدم 2026-09-02: «الموظفين يقدرون
-- يختارون وش الإشعارات اللي تجيهم في التطبيق»).
--
-- لكل فئة ثلاث حالات: all (داخل التطبيق + تنبيه على الجوال) · inapp (داخل
-- التطبيق فقط، بلا تنبيه) · off (صامت — لا يُنشأ الإشعار أصلاً).
-- التطبيق في القاعدة لا في الواجهات: البوابة قبل الإدراج تُسقط «off»،
-- ومرسل الدفع يتخطى «inapp» — فتنطبق على الويب والجوال وكل مصادر الإشعارات.

create table if not exists public.notification_prefs (
  member_id  uuid not null references public.team_members(id) on delete cascade,
  category   text not null,
  mode       text not null default 'all' check (mode in ('all', 'inapp', 'off')),
  updated_at timestamptz not null default now(),
  primary key (member_id, category)
);

alter table public.notification_prefs enable row level security;

drop policy if exists notification_prefs_own on public.notification_prefs;
create policy notification_prefs_own on public.notification_prefs
  for all to authenticated
  using (member_id in (select id from public.team_members where auth_id = auth.uid()))
  with check (member_id in (select id from public.team_members where auth_id = auth.uid()));

-- درس المشروع: سمِّ anon وauthenticated صراحةً
revoke all on public.notification_prefs from anon, public;
grant select, insert, update, delete on public.notification_prefs to authenticated;

-- نوع الإشعار → فئة يختارها الموظف
create or replace function public.notification_category(p_type text)
returns text language sql immutable as $$
  select case
    when p_type = 'mention'            then 'mention'
    when p_type like 'task%'           then 'tasks'
    when p_type like 'approval%'       then 'approvals'
    when p_type like 'session%'        then 'sessions'
    when p_type = 'deadline'           then 'deadlines'
    when p_type like 'appointment%'    then 'appointments'
    when p_type = 'birthday'           then 'birthdays'
    when p_type = 'incoming_message'   then 'inbox'
    else 'other'
  end
$$;

create or replace function public.notification_pref_mode(p_member uuid, p_type text)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select mode from public.notification_prefs
      where member_id = p_member and category = public.notification_category(p_type)),
    'all')
$$;
revoke all on function public.notification_pref_mode(uuid, text) from anon, public;
grant execute on function public.notification_pref_mode(uuid, text) to authenticated;

-- بوابة الإدراج: «صامت» = لا صف إطلاقاً
create or replace function public.notification_pref_gate()
returns trigger language plpgsql as $$
begin
  if new.recipient_id is not null
     and public.notification_pref_mode(new.recipient_id, new.type) = 'off' then
    return null;
  end if;
  return new;
end $$;

drop trigger if exists notification_pref_gate_trg on public.notifications;
create trigger notification_pref_gate_trg
  before insert on public.notifications
  for each row execute function public.notification_pref_gate();

-- مرسل الدفع: «داخل التطبيق فقط» = صف بلا تنبيه
create or replace function public.notification_push_dispatch()
returns trigger
language plpgsql security definer
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
    when new.type = 'mention' and new.case_id is not null
      then '/discussions?case=' || new.case_id
    when new.type = 'mention' then '/discussions'
    when new.case_id is not null then '/cases/' || new.case_id
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
