-- مشاركو الموعد: أكثر من شخص على الموعد الواحد
-- (طلب المدير 2026-09-22: «ابي المسؤول في مواعيد العملاء نفس طريقة المشاريع
--  أقدر أضيف أكثر من شخص»)
--
-- نفس نمط case_members: assignee_id يبقى **المسؤول**، وهذا الجدول من معه.
-- الكتابة مفتوحة للموظفين كالمواعيد نفسها (appointments مفتوح للموظفين)،
-- ولا تُفتح للمتعاون الخارجي ولا لحساب المراجعة.

create table if not exists public.appointment_members (
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  member_id      uuid not null references public.team_members(id) on delete cascade,
  role           text,
  added_by       uuid references public.team_members(id),
  created_at     timestamptz not null default now(),
  primary key (appointment_id, member_id)
);

create index if not exists appointment_members_member_idx
  on public.appointment_members (member_id);

alter table public.appointment_members enable row level security;

drop policy if exists appointment_members_all on public.appointment_members;
create policy appointment_members_all on public.appointment_members
  for all to authenticated using (true) with check (true);

drop policy if exists collab_block on public.appointment_members;
create policy collab_block on public.appointment_members
  as restrictive for all to authenticated
  using ((not (select public.is_collaborator_caller())))
  with check ((not (select public.is_collaborator_caller())));

drop policy if exists reviewer_block on public.appointment_members;
create policy reviewer_block on public.appointment_members
  as restrictive for all to authenticated
  using ((not (select public.is_reviewer_caller())))
  with check ((not (select public.is_reviewer_caller())));

-- إشعار المُضاف — يعمل من الويب ومن iOS سواء. نوع appointment_* يفتح المواعيد.
create or replace function public.appointment_member_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_client text; v_date date; v_by text;
begin
  if new.member_id = public.my_member_id() then return new; end if;
  select a.client_name, a.appointment_date into v_client, v_date
    from appointments a where a.id = new.appointment_id;
  select coalesce(short_name, name) into v_by
    from team_members where id = new.added_by;

  insert into notifications (type, title, message, recipient_id)
  values ('appointment_assigned',
          'أُضفت إلى موعد',
          coalesce(v_by || ' أضافك — ', '')
            || coalesce(left(v_client, 80), 'عميل')
            || coalesce(' · ' || to_char(v_date, 'YYYY-MM-DD'), ''),
          new.member_id);
  return new;
exception when others then
  return new;   -- الإشعار لا يُفشل الإضافة
end $$;

drop trigger if exists appointment_member_notify_trg on public.appointment_members;
create trigger appointment_member_notify_trg
  after insert on public.appointment_members
  for each row execute function public.appointment_member_notify();
