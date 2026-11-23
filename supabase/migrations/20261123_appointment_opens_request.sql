-- طلب المدير 2026-11-23: «عندي مواعيد العملاء وطلبات العملاء، كذا كأنه حوسه» — قراره «صندوق واحد للعميل الجديد».
-- في ٩٠ يوماً: ٣٣ موعداً و٤٠ طلباً والمربوط ٥ فقط؛ ٢٣ حجزاً إلكترونياً بلا طلب، فالعميل الواحد نصفه هنا ونصفه هناك.
-- الآن: كل موعد جديد لعميل محتمل يُربط بطلبه المفتوح (بآخر ٩ أرقام من الجوال)، وإن لم يكن له طلب يُفتح له طلب.
-- فالمتابعة كلها في «الطلبات الواردة»، و«مواعيد العملاء» جدولٌ لمتى ومع من.
-- لا يُفتح طلب لـ: موعد ملغى، ولا موعد من رسائل ناجز (ليس عميلاً محتملاً)، ولا عميل طرفٍ في ملف قائم (موكّلنا أصلاً).

create or replace function public.appointment_request_for(a public.appointments, p_open boolean)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_key text := public.wa_phone_key(a.client_phone);
  v_req uuid;
  v_service text;
begin
  if coalesce(a.status, '') = 'cancelled' or coalesce(a.created_by, '') = 'من رسائل ناجز الواردة' then
    return null;
  end if;

  -- (١) طلب مفتوح لنفس الرقم أو نفس العميل: يُربط به
  if length(coalesce(v_key, '')) = 9 then
    select i.id into v_req from incoming_requests i
     where public.wa_phone_key(i.client_phone) = v_key
       and coalesce(i.status, '') <> 'rejected' and coalesce(i.stage, '') <> 'opened'
     order by i.created_at desc limit 1;
  end if;
  if v_req is null and a.client_id is not null then
    select i.id into v_req from incoming_requests i
     where i.client_id = a.client_id
       and coalesce(i.status, '') <> 'rejected' and coalesce(i.stage, '') <> 'opened'
     order by i.created_at desc limit 1;
  end if;
  if v_req is not null or not p_open then
    return v_req;
  end if;

  -- (٢) موكّل قائم أو بلا اسم: لا يُفتح له طلب عميل جديد
  if coalesce(trim(a.client_name), '') = '' then
    return null;
  end if;
  if a.client_id is not null and exists (
       select 1 from case_parties p join cases c on c.id = p.case_id
        where p.contact_id = a.client_id and c.kind in ('case', 'legal_service', 'property', 'bankruptcy')) then
    return null;
  end if;

  -- (٣) عميل جديد: يُفتح له طلب
  v_service := case a.service_type
    when 'law' then 'أعمال المحاماة' when 'bankruptcy' then 'أعمال إفلاس'
    when 'notarization' then 'التوثيق والتسجيل العيني' else null end;
  insert into incoming_requests (client_name, client_phone, client_id, client_email, request_type, case_type,
                                 description, source, created_by, received_at)
  values (trim(a.client_name), a.client_phone, a.client_id, a.client_email, 'consultation', v_service,
          concat_ws(E'\n', 'حجز موعد استشارة' || coalesce(' — ' || v_service, ''), nullif(trim(a.notes), '')),
          case when a.created_by = 'حجز إلكتروني' or a.source = 'website' then 'حجز إلكتروني' else 'هاتف' end,
          coalesce(a.created_by, 'موعد'), current_date)
  returning id into v_req;
  return v_req;
end $$;
revoke all on function public.appointment_request_for(public.appointments, boolean) from public, anon, authenticated;

create or replace function public.appointment_link_request()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  if new.request_id is null then
    new.request_id := public.appointment_request_for(new, true);
  end if;
  return new;
exception when others then
  -- الموعد أهم من الطلب: لا يُرفض حجز عميل بسبب تعذّر فتح طلبه
  return new;
end $$;
revoke all on function public.appointment_link_request() from public, anon, authenticated;

drop trigger if exists appointment_link_request_trg on public.appointments;
create trigger appointment_link_request_trg before insert on public.appointments
  for each row execute function public.appointment_link_request();

-- المواعيد القائمة (آخر ٣٠ يوماً وما بعدها): تُربط بطلبها المفتوح، ويُفتح طلب للقادمة وحدها
-- كي لا يمتلئ الصندوق بعملاء مرّ موعدهم (يبقون في سجل المواعيد وزرّ «إنشاء طلب من هذا الموعد»).
update public.appointments a
   set request_id = public.appointment_request_for(a, a.appointment_date >= current_date)
 where a.request_id is null and coalesce(a.status, '') <> 'cancelled'
   and a.appointment_date >= current_date - 30;
