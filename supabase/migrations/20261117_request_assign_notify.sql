-- إشعار الإسناد: «أُحيل إليك طلب» — كان الإسناد يتم بصمت فلا يعلم الزميل أن الطلب
-- (ومحادثة واتساب عميله، إن وُجدت) صار عنده. نوع incoming_request القائم: يفتح /requests
-- في الويب والآيفون، ويخضع لتفضيلات الإشعارات وبوابة الدفع كما هي.
-- لا يُشعَر من أسند لنفسه، ولا الموظف غير النشط.

create or replace function public.notify_request_assigned()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_by uuid := my_member_id(); v_by_name text; v_has_wa boolean;
begin
  if new.assigned_to_id is null
     or (tg_op = 'UPDATE' and new.assigned_to_id is not distinct from old.assigned_to_id)
     or new.assigned_to_id = v_by
     or not exists (select 1 from team_members where id = new.assigned_to_id and is_active) then
    return new;
  end if;
  select name into v_by_name from team_members where id = v_by;
  select exists (select 1 from wa_threads t
                  where length(wa_phone_key(new.client_phone)) = 9
                    and wa_phone_key(t.phone_e164) = wa_phone_key(new.client_phone)) into v_has_wa;
  insert into notifications (type, title, message, recipient_id)
  values ('incoming_request',
          '📥 أُحيل إليك طلب' || coalesce(' من ' || v_by_name, ''),
          coalesce(new.client_name, 'عميل') || coalesce(' · ' || new.ref_no, '')
            || case when v_has_wa then ' — ومحادثته على الواتساب صارت عندك' else '' end,
          new.assigned_to_id);
  return new;
end $$;
revoke all on function public.notify_request_assigned() from public, anon, authenticated;

drop trigger if exists notify_request_assigned_trg on public.incoming_requests;
create trigger notify_request_assigned_trg
  after insert or update of assigned_to_id on public.incoming_requests
  for each row execute function public.notify_request_assigned();
