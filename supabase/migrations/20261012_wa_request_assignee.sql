-- الطلبات الواردة ↔ الواتساب (طلب المدير 2026-10-12: «إذا أحلت الطلب الوارد لموظف يشوف المحادثات المرتبطة بهذا الرقم»).
-- • المحال إليه طلبٌ مفتوح (قيد المراجعة/مقبول) يرى محادثة رقم العميل ويرد منها، وتصله رسائلها الجديدة إشعاراً.
-- • تحويل الطلب إلى ملف يربط المحادثة بالملف تلقائياً — فتبقى مع مسؤول الملف وفريقه بعد انتهاء الطلب.
-- كان ٠ من ٤٧ محادثة مربوطاً بملف؛ و٢٤ من ٣٧ طلباً أرقامها تطابق محادثات.

-- مفتاح المطابقة: آخر ٩ أرقام (05xxxxxxxx و9665xxxxxxxx و+966…)
create or replace function public.wa_phone_key(p text)
 returns text language sql immutable as $$ select right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9) $$;

create or replace function public.wa_request_assignee_sees(p_phone text)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select length(wa_phone_key(p_phone)) = 9 and exists (
    select 1 from incoming_requests i
     where i.assigned_to_id = my_member_id()
       and i.status in ('under_review', 'accepted')
       and wa_phone_key(i.client_phone) = wa_phone_key(p_phone))
$$;
revoke all on function public.wa_request_assignee_sees(text) from public, anon;
grant execute on function public.wa_request_assignee_sees(text) to authenticated;

-- الرؤية (والإرسال عبر wa-inbox الذي يسأل can_see_wa_thread بجلسة الموظف)
create or replace function public.can_see_wa_thread(p_phone text)
 returns boolean language sql stable security definer set search_path to 'public' as $$
  select public.is_office_viewer_caller()
      or exists (select 1 from wa_threads t
                  where t.phone_e164 = p_phone and t.case_id is not null
                    and public.can_access_case(t.case_id))
      or public.wa_request_assignee_sees(p_phone);
$$;

drop policy if exists wa_threads_read on public.wa_threads;
create policy wa_threads_read on public.wa_threads for select to authenticated
  using (is_office_viewer_caller()
         or (case_id is not null and can_access_case(case_id))
         or wa_request_assignee_sees(phone_e164));

-- الطلب المفتوح لكل محادثة — شارة «طلب وارد» في القائمة وبطاقة في صفحة الطلب
create or replace function public.wa_request_links()
 returns table (phone_e164 text, request_id uuid, ref_no text, client_name text, assigned_to_name text)
 language sql stable security definer set search_path to 'public' as $$
  select distinct on (t.phone_e164) t.phone_e164, i.id, i.ref_no, i.client_name, i.assigned_to_name
    from wa_threads t
    join incoming_requests i on wa_phone_key(i.client_phone) = wa_phone_key(t.phone_e164)
   where i.status in ('under_review', 'accepted') and length(wa_phone_key(i.client_phone)) = 9
     and (is_office_viewer_caller() or i.assigned_to_id = my_member_id())
   order by t.phone_e164, i.created_at desc
$$;
revoke all on function public.wa_request_links() from public, anon;
grant execute on function public.wa_request_links() to authenticated;

-- إشعار الوارد: يُضاف المحال إليه طلبٌ مفتوح بالرقم نفسه
create or replace function public.wa_thread_on_incoming()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  t wa_threads%rowtype;
  g record;
  v_preview text := left(coalesce(nullif(trim(new.body), ''), case when new.media_label is not null then '📎 ' || new.media_label else '📎 مرفق' end), 140);
  v_name text;
  v_case text;
  v_req text;
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
                     (select i.client_name from incoming_requests i
                       where wa_phone_key(i.client_phone) = wa_phone_key(new.phone_e164)
                       order by i.created_at desc limit 1),
                     '0' || right(new.phone_e164, 9));
  v_case := (select office_num from cases where id = t.case_id);
  v_req := (select coalesce(i.ref_no, 'طلب وارد') from incoming_requests i
             where i.status in ('under_review', 'accepted')
               and wa_phone_key(i.client_phone) = wa_phone_key(new.phone_e164)
             order by i.created_at desc limit 1);

  -- من يُخطَر: مسؤول الملف وفريقه، والمحال إليه طلبٌ مفتوح بالرقم؛ وغير المصنّف للمدير وراكان.
  -- ولا يتكرر لمن عنده إشعار غير مقروء من المحادثة نفسها في آخر ٣٠ دقيقة.
  for r in
    select distinct x from (
      select c.assignee_id x from cases c where c.id = t.case_id
      union all select cm.member_id from case_members cm where cm.case_id = t.case_id
      union all select i.assigned_to_id from incoming_requests i
                 where i.status in ('under_review', 'accepted')
                   and length(wa_phone_key(i.client_phone)) = 9
                   and wa_phone_key(i.client_phone) = wa_phone_key(new.phone_e164)
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
              '💬 ' || v_name || coalesce(' · ' || v_case, ' · ' || v_req, ' · غير مصنّف'),
              v_preview, r, t.case_id, new.phone_e164);
    end if;
  end loop;
  return new;
exception when others then
  return new; -- ثانوي: لا يمنع تسجيل الوارد
end $function$;

-- تحويل الطلب إلى ملف ⇒ المحادثة تُربط بالملف (إن لم تكن مربوطة)
create or replace function public.wa_link_on_request_conversion()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.converted_to_id is not null and new.converted_to_id is distinct from old.converted_to_id
     and exists (select 1 from cases where id = new.converted_to_id)
     and length(wa_phone_key(new.client_phone)) = 9 then
    update wa_threads
       set case_id = new.converted_to_id,
           contact_id = coalesce(contact_id, new.client_id),
           linked_at = now()
     where case_id is null and wa_phone_key(phone_e164) = wa_phone_key(new.client_phone);
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.wa_link_on_request_conversion() from public, anon, authenticated;
drop trigger if exists wa_link_on_request_conversion_trg on public.incoming_requests;
create trigger wa_link_on_request_conversion_trg after update of converted_to_id on public.incoming_requests
  for each row execute function public.wa_link_on_request_conversion();
