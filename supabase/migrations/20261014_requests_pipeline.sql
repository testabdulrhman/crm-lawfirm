-- الطلبات الواردة «مسار عميل» (قرار المدير 2026-10-14: «خلها قائمة تحقق، نفّذ»). كانت الصفحة نقلاً حرفياً لوثيقة
-- دورة العمل (سبع خطوات وبوابات و«ستة فتح الملف») — ٣٧ طلباً لم يتحوّل منها ملف واحد، و١٠ قيد المراجعة بمتوسط ٦٨ يوماً.
-- الآن: مرحلة ظاهرة (جديد ← تواصلنا ← عرض سعر ← تعاقدنا ← فُتح الملف) تتقدّم بأفعالها، وتذكير بالطلب الراكد،
-- وملخص ذكي لملفات العميل، والفحوص كلها باقية قائمةَ تحقق لا توقف شيئاً.

alter table public.incoming_requests add column if not exists stage text not null default 'new'
  check (stage in ('new', 'contacted', 'quoted', 'contracted', 'opened'));
alter table public.incoming_requests add column if not exists stage_changed_at timestamptz;
alter table public.incoming_requests add column if not exists last_activity_at timestamptz not null default now();
alter table public.incoming_requests add column if not exists docs_summary jsonb;       -- ملخص ما اطّلعنا عليه (request-summary)
alter table public.incoming_requests add column if not exists docs_summary_at timestamptz;
alter table public.incoming_requests add column if not exists stale_notified_at timestamptz;
alter table public.request_documents add column if not exists file_type text;
alter table public.request_documents add column if not exists file_size bigint;

-- المرحلة من الوقائع المسجّلة (ترحيل)
update public.incoming_requests set
  stage = case
    when converted_to_id is not null then 'opened'
    when contract_signed_at is not null then 'contracted'
    when quote_sent_at is not null then 'quoted'
    when assigned_to_id is not null or status = 'accepted' then 'contacted'
    else 'new' end,
  stage_changed_at = coalesce(stage_changed_at, updated_at, created_at),
  last_activity_at = coalesce(updated_at, created_at);

-- المرحلة تتقدّم بأفعالها (لا تتراجع تلقائياً)، وكل تعديل نشاطٌ يُصفّر عدّاد الركود
create or replace function public.request_stage_auto()
 returns trigger language plpgsql as $$
declare ord constant text[] := array['new', 'contacted', 'quoted', 'contracted', 'opened'];
  v_target text;
begin
  v_target := case
    when new.converted_to_id is not null and old.converted_to_id is null then 'opened'
    when new.contract_signed_at is not null and old.contract_signed_at is null then 'contracted'
    when new.quote_sent_at is not null and old.quote_sent_at is null then 'quoted'
    when new.assigned_to_id is not null and old.assigned_to_id is null then 'contacted'
    else null end;
  if v_target is not null and array_position(ord, v_target) > array_position(ord, new.stage) then
    new.stage := v_target;
  end if;
  if new.stage is distinct from old.stage then new.stage_changed_at := now(); end if;
  -- النشاط تعديلٌ حقيقي — لا ختم التذكير ولا ختوم التوقيت نفسها (وإلا صفّر التذكيرُ عدّاده)
  if (to_jsonb(new) - 'stale_notified_at' - 'last_activity_at' - 'updated_at' - 'docs_summary' - 'docs_summary_at')
     is distinct from (to_jsonb(old) - 'stale_notified_at' - 'last_activity_at' - 'updated_at' - 'docs_summary' - 'docs_summary_at') then
    new.last_activity_at := now();
  end if;
  return new;
end $$;
drop trigger if exists request_stage_auto_trg on public.incoming_requests;
create trigger request_stage_auto_trg before update on public.incoming_requests
  for each row execute function public.request_stage_auto();

-- رفع ملف للطلب نشاطٌ أيضاً
create or replace function public.request_doc_activity()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update incoming_requests set last_activity_at = now() where id = new.request_id;
  return new;
end $$;
revoke all on function public.request_doc_activity() from public, anon, authenticated;
drop trigger if exists request_doc_activity_trg on public.request_documents;
create trigger request_doc_activity_trg after insert on public.request_documents
  for each row execute function public.request_doc_activity();

-- التذكير بالراكد: طلب مفتوح بلا نشاط ٣ أيام ← مسؤوله (أو المدير وراكان إن لم يُحَل)، مرة كل ٣ أيام
create or replace function public.remind_stale_requests()
 returns int language plpgsql security definer set search_path to 'public' as $$
declare r record; n int := 0; v_days int;
begin
  for r in select * from incoming_requests
            where status not in ('rejected') and stage <> 'opened'
              and last_activity_at < now() - interval '3 days'
              and (stale_notified_at is null or stale_notified_at < now() - interval '3 days') loop
    v_days := extract(day from now() - r.last_activity_at)::int;
    insert into notifications (type, title, message, recipient_id)
    select 'incoming_request',
           '⏰ طلب وارد بلا تحرّك ' || v_days || ' أيام',
           coalesce(r.client_name, 'عميل') || coalesce(' · ' || r.ref_no, '') || ' — الخطوة التالية بانتظارك',
           x
      from (select r.assigned_to_id x where r.assigned_to_id is not null
            union all
            select tm.id from team_members tm
             where r.assigned_to_id is null and tm.is_active and (tm.is_director or tm.can_view_all)) s
     where exists (select 1 from team_members where id = s.x and is_active);
    update incoming_requests set stale_notified_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.remind_stale_requests() from public, anon, authenticated;

-- إشعار الطلب يفتح صفحة الطلبات في الآيفون أيضاً (كان يقع على «/»)
create or replace function public.notification_push_dispatch()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  fn_url text; akey text; secret text; v_route text;
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
    when new.case_id is not null then '/cases/' || new.case_id
    when new.type like 'appointment%' then '/appointments'
    when new.type = 'hr_request' then '/hr/approvals'
    when new.type = 'hr_result' then '/me'
    when new.type = 'change_request' then '/change-requests'
    when new.type = 'office_doc_expiry' then '/office-documents'
    when new.type = 'incoming_request' then '/requests'
    else '/'
  end;

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
                 'notification_ids', jsonb_build_array(new.id))
  );
  return new;
exception when others then
  return new;
end; $function$;

-- يومياً الساعة ٩ صباحاً بتوقيت الرياض
select cron.unschedule('remind-stale-requests') where exists (select 1 from cron.job where jobname = 'remind-stale-requests');
select cron.schedule('remind-stale-requests', '0 6 * * *', 'select public.remind_stale_requests()');
