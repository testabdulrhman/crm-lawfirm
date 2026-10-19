-- الرد على إشعار النقاش دون فتح التطبيق (طلب المدير 2026-10-19 من الآيفون): رسائل النقاش (mention) تُرسل
-- بـ category = DISCUSSION_REPLY ومعها case_id والخيط (parent_id) — فزرّ «رد» في الإشعار يكتب في المكان نفسه:
-- رسالة في خيط ⇐ في الخيط، ورسالة في المجرى ⇐ في المجرى (كالمحادثات). الرسالة تُعرف بوقتها: الإشعار يُنشأ
-- بـ created_at رسالته نفسها (feature-mention-jump).
create or replace function public.notification_push_dispatch()
 returns trigger language plpgsql security definer set search_path to 'public', 'extensions'
as $function$
declare
  fn_url text; akey text; secret text; v_route text; v_sound text;
  v_cat text; v_parent uuid; v_found boolean := false;
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
    when new.type = 'wa_client' and new.wa_phone is not null then '/clients?phone=' || new.wa_phone
    when new.type in ('mention', 'approval_sign') and new.case_id is not null
      then '/discussions?case=' || new.case_id
    when new.type = 'mention' then '/discussions'
    when new.type = 'installment_due' then '/engagements'
    when new.case_id is not null then '/cases/' || new.case_id
    when new.type like 'appointment%' then '/appointments'
    when new.type = 'hr_request' then '/hr/approvals'
    when new.type = 'hr_result' then '/me'
    when new.type = 'change_request' then '/change-requests'
    when new.type = 'office_doc_expiry' then '/office-documents'
    when new.type = 'incoming_request' then '/requests'
    else '/'
  end;

  v_sound := case when new.type in ('mention', 'wa_client') then 'chat.caf' else 'default' end;

  if new.type = 'mention' then
    select true, c.parent_id into v_found, v_parent
      from case_comments c
     where c.case_id is not distinct from new.case_id and c.created_at = new.created_at
     limit 1;
    if coalesce(v_found, false) then v_cat := 'DISCUSSION_REPLY'; end if;
  end if;

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
                 'sound',            v_sound,
                 'category',         v_cat,
                 'case_id',          new.case_id,
                 'parent_id',        v_parent,
                 'notification_ids', jsonb_build_array(new.id))
  );
  return new;
exception when others then
  return new;
end; $function$;
