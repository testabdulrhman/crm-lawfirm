-- اعتماد خصم الغياب مرتين في اللحظة نفسها (جهازان/إعادة محاولة) كان يُنشئ قيدَي راتب (فحص 2026-10-19):
-- القراءة بلا قفل فيرى الاثنان «مقترح». الآن FOR UPDATE: الثاني ينتظر الأول ثم يجد الحالة تغيّرت فيُرفض.
create or replace function public.decide_absence_deduction(p_id uuid, p_approve boolean, p_amount numeric default null::numeric)
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare r attendance_records; v_entry uuid;
begin
  if not is_director_caller() then raise exception 'اعتماد الخصم للمدير فقط' using errcode = '42501'; end if;
  select * into r from attendance_records where id = p_id and deleted_at is null for update;
  if r.id is null then raise exception 'السجل غير موجود'; end if;
  if r.deduction_status <> 'proposed' then raise exception 'لا خصم مقترح على هذا السجل (رُبما اعتُمد للتو)'; end if;
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
end $function$;
