-- «جهات الاتصال» صارت «العملاء»، والمتصلون إلى الـHub (قرار المدير 2026-10-07: «بما إن عندنا منصة هب، فمفروض
-- يتغيّر اسم جهات الاتصال إلى العملاء، وجميع الارقام اللي انحفظت في جهات الاتصال كمتصل تروح هناك»؛ واختار
-- «أنقل وأحتفظ بنسخة»).
-- كان hub_ingest ينشئ جهة «متصل» لكل رقم واتساب ولكل مكالمة: ٦٢٠ صفاً أغلبها بلا اسم، وكلها في contacts الـHub.
--  ١) المتصل المرتبط بعمل (ملف، طرف، طلب وارد، موعد، عقد، KYC، بريد، أو الجداول القديمة) يصير «عميلاً» ويبقى.
--  ٢) غيره يُنسخ إلى contacts_callers_archive (للمدير وحده) ثم يُحذف — وحذفه يُبلَّغ للـHub بترقر hub_contacts_sync.
--     ومراجعه في sms_log وwa_threads تُفرَّغ (الرقم باقٍ فيها)، واسمه الحقيقي — إن كان له اسم — يبقى على محادثة الواتساب.
--  ٣) hub_ingest لا ينشئ متصلاً بعد اليوم (انظر نهاية الملف).

create table if not exists public.contacts_callers_archive (like public.contacts including defaults);
alter table public.contacts_callers_archive add column if not exists archived_at timestamptz not null default now();
alter table public.contacts_callers_archive enable row level security;
revoke all on public.contacts_callers_archive from anon, authenticated;
grant select on public.contacts_callers_archive to authenticated;
drop policy if exists callers_archive_director on public.contacts_callers_archive;
create policy callers_archive_director on public.contacts_callers_archive for select to authenticated
  using ((select is_director_caller()));

drop table if exists _callers;
create temp table _callers as
select c.id,
  exists (select 1 from cases x where x.contact_id = c.id)
  or exists (select 1 from case_parties x where x.contact_id = c.id)
  or exists (select 1 from incoming_requests x where x.client_id = c.id)
  or exists (select 1 from appointments x where x.client_id = c.id)
  or exists (select 1 from engagements x where x.client_id = c.id)
  or exists (select 1 from kyc_checks x where x.contact_id = c.id)
  or exists (select 1 from email_messages x where x.contact_id = c.id)
  or exists (select 1 from legal_services_legacy x where x.client_id = c.id)
  or exists (select 1 from property_transfers_legacy x where x.seller_id = c.id or x.buyer_id = c.id) as linked
from public.contacts c where c.type = 'caller' or c.category = 'caller';

-- ١) المرتبط بعمل ⇒ عميل
update public.contacts c set type = 'client', category = 'client'
  from _callers k where k.id = c.id and k.linked;

-- ٢) الباقي: اسمه الحقيقي على محادثته، ثم تفريغ المراجع، ثم النسخ والحذف
update public.wa_threads w set display_name = c.name
  from public.contacts c join _callers k on k.id = c.id and not k.linked
 where w.contact_id = c.id and w.display_name is null
   and c.name is not null and c.name !~ '^(متصل|عميل واتساب)' and c.name !~ '^[0-9+ ]+$';
update public.wa_threads w set contact_id = null from _callers k where k.id = w.contact_id and not k.linked;
update public.sms_log s set contact_id = null from _callers k where k.id = s.contact_id and not k.linked;

insert into public.contacts_callers_archive
select c.*, now() from public.contacts c join _callers k on k.id = c.id and not k.linked;
delete from public.contacts c using _callers k where k.id = c.id and not k.linked;

-- ٣) hub_ingest بلا إنشاء متصلين
CREATE OR REPLACE FUNCTION public.hub_ingest(p_secret text, p_ref text, p_kind text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_prev    jsonb;
  v_res     jsonb;
  v_contact uuid;
  v_ext     text := p_payload->>'external_id';
  v_local   text := p_payload->>'phone_local';
  v_e164    text := p_payload->>'phone_e164';
  v_desc    text;
  v_req     uuid;
  v_conv    text := p_payload->>'hub_conversation_id';
  v_new     boolean := false;
  v_idem    text := p_payload->>'idempotency_key';
  v_status  text := p_payload->>'status';
  v_touched int := 0;
begin
  perform public._hub_auth(p_secret);
  if p_ref is null or length(p_ref) > 200 then raise exception 'hub: bad ref'; end if;

  select result into v_prev from public.hub_inbound_log where ref = p_ref;
  if found then return jsonb_build_object('duplicate', true, 'result', v_prev); end if;

  if v_ext ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_contact from public.contacts where id = v_ext::uuid;
  end if;

  if p_kind = 'delivery_status' then
    -- أثر في sms_log إن كانت الرسالة مقيَّدة هناك بمفتاح الإرسال
    update public.sms_log
       set status = case when v_status = 'delivered' then 'sent' else 'failed' end
     where dedup_key = v_idem;
    get diagnostics v_touched = row_count;
    v_res := jsonb_build_object('idempotency_key', v_idem, 'status', v_status,
                                'detail', p_payload->>'detail', 'sms_log_updated', v_touched);

  elsif p_kind in ('wa_client_message', 'wa_lead_message', 'wa_unrouted') then
    insert into public.sms_log (recipient_name, phone, message, status, sent_by, contact_id, is_important, dedup_key)
    values (coalesce(nullif(p_payload->>'name', ''), 'واتساب وارد'),
            v_e164,
            case when p_kind = 'wa_client_message' then '[عميل قائم] ' else '' end || public._hub_msg_text(p_payload),
            'incoming', 'whatsapp', v_contact, p_kind = 'wa_client_message', p_ref)
    returning jsonb_build_object('sms_log_id', id) into v_res;

  elsif p_kind in ('wa_new_lead', 'wa_partial_lead') then
    if v_contact is null and v_local is not null then
      select id into v_contact from public.contacts
       where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(v_local, '\D', '', 'g'), 9)
       limit 1;
    end if;
    -- لا تُنشأ جهة اتصال «متصل» بعد اليوم (قرار المدير 2026-10-07): الرقم وبياناته في الـHub، والطلب
    -- يحمل الاسم والجوال؛ وتُنشأ جهة الاتصال «عميلاً» عند تحويل الطلب لملف.

    v_desc := concat_ws(E'\n',
      'طلب وارد عبر الواتساب — تأهيل آلي' || case when p_kind = 'wa_partial_lead' then ' (غير مكتمل: توقف العميل قبل إنهاء الأسئلة)' else '' end,
      'نوع الطلب: '          || nullif(p_payload->>'request_label', ''),
      'الأطراف: '            || nullif(p_payload->>'parties', ''),
      'جلسات/مواعيد قريبة: ' || nullif(p_payload->>'deadlines', ''),
      'المدينة: '            || nullif(p_payload->>'city', ''),
      'الرسالة الأولى: '     || nullif(p_payload->>'first_message', ''),
      (select string_agg('📎 مرفق: ' || m, E'\n') from jsonb_array_elements_text(coalesce(p_payload->'media', '[]'::jsonb)) m),
      'مرجع المحادثة: ' || v_conv);

    select id into v_req from public.incoming_requests
     where created_by = 'redwan-hub' and status = 'under_review' and v_conv is not null
       and description like '%مرجع المحادثة: ' || v_conv || '%'
     order by created_at desc limit 1;

    if v_req is not null then
      update public.incoming_requests
         set client_name = coalesce(nullif(p_payload->>'name', ''), client_name),
             request_type = coalesce(nullif(p_payload->>'request_type', ''), request_type),
             case_type = coalesce(nullif(p_payload->>'request_label', ''), case_type),
             opponent_name = coalesce(nullif(nullif(p_payload->>'parties', ''), 'لا يوجد'), opponent_name),
             description = v_desc, client_id = coalesce(client_id, v_contact), updated_at = now()
       where id = v_req;
    else
      insert into public.incoming_requests
        (client_name, client_phone, client_id, request_type, case_type, source, description, opponent_name, status, created_by)
      values (coalesce(nullif(p_payload->>'name', ''), 'عميل واتساب'), v_local, v_contact,
              coalesce(nullif(p_payload->>'request_type', ''), 'case'), nullif(p_payload->>'request_label', ''),
              'واتساب', v_desc, nullif(nullif(p_payload->>'parties', ''), 'لا يوجد'), 'under_review', 'redwan-hub')
      returning id into v_req;
    end if;
    v_res := jsonb_build_object('incoming_request_id', v_req, 'contact_id', v_contact, 'new_contact', v_new);

  elsif p_kind = 'call' then
    if v_contact is null and v_local is not null then
      select id into v_contact from public.contacts
       where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) = right(regexp_replace(v_local, '\D', '', 'g'), 9)
          or right(regexp_replace(coalesce(phone2, ''), '\D', '', 'g'), 9) = right(regexp_replace(v_local, '\D', '', 'g'), 9)
       limit 1;
      -- المتصل غير المسجّل يبقى في الـHub وحده (2026-10-07) — لا جهة اتصال له هنا
    end if;

    insert into public.hatif_calls as h (
      id, hatif_channel_id, hatif_workspace_id, status, status_label, direction, direction_label,
      caller_number, callee_number, contact_number, pickup_time, hangup_time, call_length, handler_name,
      recording_url, transcription_text, summary, sentiment, sentiment_label, client_id, client_name)
    values (
      (p_payload->>'hatif_call_id')::uuid, (p_payload->>'hatif_channel_id')::uuid, (p_payload->>'hatif_workspace_id')::uuid,
      coalesce((p_payload->>'status_code')::int, 0), p_payload->>'status_label',
      coalesce((p_payload->>'direction_code')::int, 0), p_payload->>'direction_label',
      p_payload->>'caller_number', p_payload->>'callee_number', p_payload->>'contact_number',
      (p_payload->>'pickup_time')::timestamptz, (p_payload->>'hangup_time')::timestamptz, p_payload->>'call_length',
      p_payload->>'agent_name', p_payload->>'recording_url', p_payload->>'transcription_text', p_payload->>'summary',
      (p_payload->>'sentiment')::int, p_payload->>'sentiment_label',
      v_contact, coalesce(p_payload->>'name', (select name from public.contacts where id = v_contact)))
    on conflict (id) do update set
      status = excluded.status, status_label = excluded.status_label,
      pickup_time = coalesce(excluded.pickup_time, h.pickup_time), hangup_time = coalesce(excluded.hangup_time, h.hangup_time),
      call_length = coalesce(excluded.call_length, h.call_length), handler_name = coalesce(excluded.handler_name, h.handler_name),
      recording_url = coalesce(excluded.recording_url, h.recording_url),
      transcription_text = coalesce(excluded.transcription_text, h.transcription_text),
      summary = coalesce(excluded.summary, h.summary), sentiment = coalesce(excluded.sentiment, h.sentiment),
      sentiment_label = coalesce(excluded.sentiment_label, h.sentiment_label),
      client_id = coalesce(h.client_id, excluded.client_id), client_name = coalesce(h.client_name, excluded.client_name);
    v_res := jsonb_build_object('hatif_call_id', p_payload->>'hatif_call_id', 'contact_id', v_contact, 'new_contact', v_new);

  else
    raise exception 'hub: unknown kind %', p_kind;
  end if;

  insert into public.hub_inbound_log (ref, kind, result) values (p_ref, p_kind, v_res);
  return v_res;
end $function$
;
