-- سجل حالة المواعيد (طلب المدير 2026-10-06: «كيف أعرف من اللي ألغاه؟» ← «نعم، سوّه»).
-- موعد «خالد…» أُلغي ولم يُعرف مُلغيه إلا استنتاجاً من سجل الاستخدام. الآن كل تغيير لحالة موعد —
-- من الويب أو الآيفون أو الخادم — يُسجَّل بمن غيّره ومتى، ويظهر في صفحة الموعد.

create table if not exists public.appointment_status_log (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  from_status text,
  to_status text,
  member_id uuid references public.team_members(id) on delete set null,
  member_name text,          -- يبقى الاسم ولو حُذف الموظف؛ و«النظام» لتغيير الخادم
  created_at timestamptz not null default now()
);
create index if not exists appointment_status_log_appt_idx on public.appointment_status_log (appointment_id, created_at desc);

alter table public.appointment_status_log enable row level security;
-- من يرى الموعد يرى سجله (الاستعلام الفرعي يمرّ بصلاحيات الموعد نفسه)
drop policy if exists appt_status_log_read on public.appointment_status_log;
create policy appt_status_log_read on public.appointment_status_log for select to authenticated
  using (exists (select 1 from public.appointments a where a.id = appointment_id));
revoke all on public.appointment_status_log from anon, authenticated;
grant select on public.appointment_status_log to authenticated;

create or replace function public.log_appointment_status()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id uuid := public.my_member_id();
  v_name text;
begin
  if new.status is not distinct from old.status then return new; end if;
  if v_id is not null then
    select coalesce(short_name, name) into v_name from team_members where id = v_id;
  end if;
  insert into appointment_status_log (appointment_id, from_status, to_status, member_id, member_name)
  values (new.id, old.status, new.status, v_id, coalesce(v_name, 'النظام'));
  return new;
exception when others then
  return new; -- السجل ثانوي — لا يمنع تغيير الحالة
end $function$;
revoke all on function public.log_appointment_status() from public, anon, authenticated;

drop trigger if exists appointment_status_log_trg on public.appointments;
create trigger appointment_status_log_trg
  after update of status on public.appointments
  for each row execute function public.log_appointment_status();
