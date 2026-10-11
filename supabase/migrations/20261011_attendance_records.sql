-- سجل الحضور والغياب (طلب المدير 2026-10-11: «ودي أقدر أسجّل غياب الموظفين»). قراراته:
--   • يسجّل المدير وراكان (is_office_viewer_caller)، والحذف للمدير وحده (ناعم، guard_soft_delete).
--   • الموظف يرى سجله بلا إشعار.
--   • الغياب بلا عذر: يُقترح خصم ولا يدخل مسيّر الرواتب إلا باعتماد المدير (decide_absence_deduction).
-- ومعه اقتراح ذكي: من يدخل التطبيق بانتظام ولم يدخل يوم عمل، بلا إجازة أو عمل عن بعد أو سجل، يُعرض لتثبيته بضغطة.
create table if not exists public.attendance_records (
  id                uuid primary key default gen_random_uuid(),
  member_id         uuid not null references public.team_members(id) on delete cascade,
  day               date not null,
  kind              text not null check (kind in ('absent', 'excused', 'late', 'early_leave', 'field')),
  minutes           int check (minutes is null or minutes between 1 and 720),   -- للتأخير والانصراف المبكر
  note              text,
  attachment_url    text,                                                        -- عذر طبي ونحوه
  deduction_status  text not null default 'none' check (deduction_status in ('none', 'proposed', 'approved', 'rejected')),
  deduction_amount  numeric(10,2),
  payroll_entry_id  uuid references public.payroll_entries(id) on delete set null,
  recorded_by       uuid references public.team_members(id) on delete set null default public.my_member_id(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  deleted_by        text
);
create unique index if not exists attendance_one_per_kind on public.attendance_records(member_id, day, kind) where deleted_at is null;
create index if not exists attendance_day on public.attendance_records(day desc) where deleted_at is null;

alter table public.attendance_records enable row level security;
revoke all on public.attendance_records from anon;
revoke delete on public.attendance_records from authenticated;
drop policy if exists attendance_read on public.attendance_records;
create policy attendance_read on public.attendance_records for select to authenticated
  using ((select is_office_viewer_caller()) or member_id = (select my_member_id()));
drop policy if exists attendance_insert on public.attendance_records;
create policy attendance_insert on public.attendance_records for insert to authenticated
  with check ((select is_office_viewer_caller()));
drop policy if exists attendance_update on public.attendance_records;
create policy attendance_update on public.attendance_records for update to authenticated
  using ((select is_office_viewer_caller())) with check ((select is_office_viewer_caller()));

-- الحذف الناعم للمدير وحده (الحارس العام نفسه)، واعتماد الخصم لا يُكتب إلا عبر الدالة
drop trigger if exists attendance_guard_soft_delete on public.attendance_records;
create trigger attendance_guard_soft_delete before update on public.attendance_records
  for each row execute function public.guard_soft_delete();

create or replace function public.attendance_guard()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  new.updated_at := now();
  if current_setting('app.attendance_decide', true) = '1' then return new; end if;
  if new.deduction_status in ('approved', 'rejected')
     and (tg_op = 'INSERT' or old.deduction_status is distinct from new.deduction_status) then
    raise exception 'اعتماد الخصم للمدير من «خصومات مقترحة»' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.payroll_entry_id is distinct from old.payroll_entry_id then
    raise exception 'قيد الراتب يُربط عند الاعتماد فقط' using errcode = '42501';
  end if;
  if new.kind <> 'absent' and new.deduction_status = 'proposed' then new.deduction_status := 'none'; end if;
  return new;
end $$;
revoke all on function public.attendance_guard() from public, anon, authenticated;
drop trigger if exists attendance_guard_trg on public.attendance_records;
create trigger attendance_guard_trg before insert or update on public.attendance_records
  for each row execute function public.attendance_guard();

-- اعتماد الخصم أو رفضه — المدير وحده؛ الاعتماد يُنشئ قيد «خصم» في مسيّر الرواتب
create or replace function public.decide_absence_deduction(p_id uuid, p_approve boolean, p_amount numeric default null)
 returns void language plpgsql security definer set search_path to 'public' as $$
declare r attendance_records; v_entry uuid;
begin
  if not is_director_caller() then raise exception 'اعتماد الخصم للمدير فقط' using errcode = '42501'; end if;
  select * into r from attendance_records where id = p_id and deleted_at is null;
  if r.id is null then raise exception 'السجل غير موجود'; end if;
  if r.deduction_status <> 'proposed' then raise exception 'لا خصم مقترح على هذا السجل'; end if;
  perform set_config('app.attendance_decide', '1', true);
  if p_approve then
    if coalesce(p_amount, r.deduction_amount, 0) <= 0 then raise exception 'حدّد مبلغ الخصم'; end if;
    insert into payroll_entries (team_member_id, entry_type, amount, entry_date, note, created_by)
    values (r.member_id, 'deduction', coalesce(p_amount, r.deduction_amount), r.day,
            'خصم غياب بدون عذر — ' || to_char(r.day, 'YYYY/MM/DD'), my_member_id())
    returning id into v_entry;
    update attendance_records set deduction_status = 'approved', deduction_amount = coalesce(p_amount, r.deduction_amount),
                                  payroll_entry_id = v_entry where id = r.id;
  else
    update attendance_records set deduction_status = 'rejected' where id = r.id;
  end if;
end $$;
revoke all on function public.decide_absence_deduction(uuid, boolean, numeric) from public, anon;
grant execute on function public.decide_absence_deduction(uuid, boolean, numeric) to authenticated;

-- الاقتراح الذكي: أيام العمل (الأحد–الخميس) في آخر p_days يوماً — واليوم لا يُقترح قبل الظهر
create or replace function public.absence_suggestions(p_days int default 5)
 returns table (member_id uuid, member_name text, day date)
 language sql stable security definer set search_path to 'public' as $$
  with now_r as (select (now() at time zone 'Asia/Riyadh') t),
  days as (
    select d::date as day from now_r, generate_series((t::date - (p_days - 1)), t::date, interval '1 day') d
    where extract(isodow from d) not in (5, 6)                         -- الجمعة والسبت
      and (d::date < t::date or extract(hour from t) >= 12)
  ),
  regulars as (                                                         -- من يدخل بانتظام: ٣ أيام فأكثر من آخر ١٤
    select m.id, coalesce(m.short_name, m.name) as nm, m.name, m.short_name
    from team_members m
    where m.is_active and coalesce(m.member_type, 'employee') = 'employee' and not coalesce(m.is_reviewer, false)
      and (select count(distinct (u.login_at at time zone 'Asia/Riyadh')::date) from usage_sessions u
            where u.user_name in (m.name, m.short_name) and u.login_at > now() - interval '14 days') >= 3
  )
  select r.id, r.nm, d.day
  from regulars r cross join days d
  where is_office_viewer_caller()
    and not exists (select 1 from usage_sessions u where u.user_name in (r.name, r.short_name)
                     and (u.login_at at time zone 'Asia/Riyadh')::date = d.day)
    and not exists (select 1 from hr_requests h where h.member_id = r.id and h.status = 'approved'
                     and h.kind in ('leave', 'remote') and d.day between h.start_date and coalesce(h.end_date, h.start_date))
    and not exists (select 1 from attendance_records a where a.member_id = r.id and a.day = d.day and a.deleted_at is null)
  order by d.day desc, r.nm
$$;
revoke all on function public.absence_suggestions(int) from public, anon;
grant execute on function public.absence_suggestions(int) to authenticated;
