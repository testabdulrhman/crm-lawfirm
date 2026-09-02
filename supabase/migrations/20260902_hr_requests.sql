-- طلبات الموظفين: إجازة · استئذان · دوام عن بعد (طلب المستخدم 2026-09-02)
-- الموظف يقدّم ويلغي طلبه ما دام معلّقاً؛ المدير يعتمد أو يرفض بملاحظة.
-- الإشعارات من القاعدة: تقديم → المدراء؛ قرار → صاحب الطلب (فئة hr في التفضيلات).

create table if not exists public.hr_requests (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references public.team_members(id) on delete cascade,
  kind           text not null check (kind in ('leave', 'permission', 'remote')),
  leave_type     text,                       -- للإجازة: annual/sick/emergency/unpaid
  start_date     date not null,
  end_date       date not null,
  from_time      time,                       -- للاستئذان
  to_time        time,
  reason         text,
  status         text not null default 'pending'
                 check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by     uuid references public.team_members(id),
  decided_at     timestamptz,
  decision_note  text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (end_date >= start_date)
);

create index if not exists hr_requests_member_idx on public.hr_requests(member_id, created_at desc);
create index if not exists hr_requests_status_idx on public.hr_requests(status) where status = 'pending';

alter table public.hr_requests enable row level security;

-- القراءة: المدير الكل، الموظف طلباته
drop policy if exists hr_requests_select on public.hr_requests;
create policy hr_requests_select on public.hr_requests for select to authenticated
  using (public.is_director_caller()
         or member_id in (select id from public.team_members where auth_id = auth.uid()));

-- التقديم: لنفسه فقط وبحالة معلّقة
drop policy if exists hr_requests_insert on public.hr_requests;
create policy hr_requests_insert on public.hr_requests for insert to authenticated
  with check (status = 'pending'
              and member_id in (select id from public.team_members where auth_id = auth.uid()));

-- التعديل: المدير أي طلب (القرار)؛ الموظف طلبه المعلّق (إلغاء أو تصحيح)
drop policy if exists hr_requests_update on public.hr_requests;
create policy hr_requests_update on public.hr_requests for update to authenticated
  using (public.is_director_caller()
         or (status = 'pending'
             and member_id in (select id from public.team_members where auth_id = auth.uid())))
  with check (public.is_director_caller()
              or (status in ('pending', 'cancelled')
                  and member_id in (select id from public.team_members where auth_id = auth.uid())));

-- حساب المراجعة (App Store) لا يرى طلبات الموظفين الحقيقية
drop policy if exists reviewer_hr_requests on public.hr_requests;
create policy reviewer_hr_requests on public.hr_requests as restrictive for select to authenticated
  using (not public.is_reviewer_caller());

revoke all on public.hr_requests from anon, public;
grant select, insert, update on public.hr_requests to authenticated;

-- الفئة في تفضيلات الإشعارات
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
    when p_type like 'hr%'             then 'hr'
    else 'other'
  end
$$;

create or replace function public.hr_kind_label(p_kind text) returns text language sql immutable as $$
  select case p_kind when 'leave' then 'إجازة' when 'permission' then 'استئذان' when 'remote' then 'دوام عن بعد' else p_kind end
$$;

-- تقديم → إشعار المدراء
create or replace function public.hr_request_notify_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_name text; v_when text;
begin
  select coalesce(short_name, name) into v_name from team_members where id = new.member_id;
  v_when := case when new.kind = 'permission'
                 then to_char(new.start_date, 'YYYY-MM-DD') || coalesce(' ' || to_char(new.from_time, 'HH24:MI') || '–' || to_char(new.to_time, 'HH24:MI'), '')
                 when new.start_date = new.end_date then to_char(new.start_date, 'YYYY-MM-DD')
                 else to_char(new.start_date, 'YYYY-MM-DD') || ' → ' || to_char(new.end_date, 'YYYY-MM-DD') end;
  insert into notifications (type, title, message, recipient_id)
  select 'hr_request',
         'طلب ' || hr_kind_label(new.kind) || ' من ' || coalesce(v_name, 'موظف'),
         v_when || coalesce(' — ' || left(new.reason, 120), ''),
         id
    from team_members where is_director = true and coalesce(is_active, true) and id <> new.member_id;
  return new;
end $$;

drop trigger if exists hr_request_notify_insert_trg on public.hr_requests;
create trigger hr_request_notify_insert_trg after insert on public.hr_requests
  for each row execute function public.hr_request_notify_insert();

-- قرار → إشعار صاحب الطلب
create or replace function public.hr_request_notify_decision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    insert into notifications (type, title, message, recipient_id)
    values ('hr_result',
            case when new.status = 'approved' then '✅ اعتُمد طلب ' else '❌ رُفض طلب ' end || hr_kind_label(new.kind),
            to_char(new.start_date, 'YYYY-MM-DD') || case when new.end_date <> new.start_date then ' → ' || to_char(new.end_date, 'YYYY-MM-DD') else '' end
              || coalesce(' — ' || left(new.decision_note, 160), ''),
            new.member_id);
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists hr_request_notify_decision_trg on public.hr_requests;
create trigger hr_request_notify_decision_trg before update on public.hr_requests
  for each row execute function public.hr_request_notify_decision();
