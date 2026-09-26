-- مستندات المكتب (طلب المدير 2026-09-26): الجدول موجود منذ النظام السابق (١٠ مستندات) بلا أي
-- صفحة تعرضه — فانتهت شهادتان دون أن ينتبه أحد. الآن: صفحة، ورفع يقرؤه الذكاء ويعبّئ بياناته
-- (دالة office-doc-extract)، وتنبيه قبل الانتهاء بسلّم ٦٠/٣٠/٧/يوم الانتهاء.

alter table public.office_documents
  add column if not exists file_name text,
  add column if not exists ai_extracted boolean not null default false,
  add column if not exists alert_stage int,          -- آخر عتبة نُبّه عندها (60/30/7/0)
  add column if not exists created_by uuid references public.team_members(id) on delete set null,
  add column if not exists updated_at timestamptz;

-- ===== الصلاحيات: المكتب يرى ويرفع ويعدّل، والحذف للمدير =====
revoke all on public.office_documents from anon;
revoke all on public.office_documents from authenticated;
grant select, insert, update, delete on public.office_documents to authenticated;

drop policy if exists authenticated_all on public.office_documents;
drop policy if exists office_docs_read on public.office_documents;
create policy office_docs_read on public.office_documents
  for select to authenticated using (true);
drop policy if exists office_docs_write on public.office_documents;
create policy office_docs_write on public.office_documents
  for insert to authenticated with check (true);
drop policy if exists office_docs_update on public.office_documents;
create policy office_docs_update on public.office_documents
  for update to authenticated using (true) with check (true);
drop policy if exists office_docs_delete on public.office_documents;
create policy office_docs_delete on public.office_documents
  for delete to authenticated using ((select public.is_director_caller()));
-- collab_block (restrictive) يبقى كما هو؛ وحساب مراجعة أبل لا يراها
drop policy if exists office_docs_no_reviewer on public.office_documents;
create policy office_docs_no_reviewer on public.office_documents
  as restrictive for all to authenticated
  using (not (select public.is_reviewer_caller()))
  with check (not (select public.is_reviewer_caller()));

-- تجديد التاريخ يعيد سلّم التنبيه من أوله
create or replace function public.office_docs_touch()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.expiry_date is distinct from old.expiry_date then
    new.alert_stage := null;
  end if;
  return new;
end $$;
drop trigger if exists office_docs_touch_trg on public.office_documents;
create trigger office_docs_touch_trg before update on public.office_documents
  for each row execute function public.office_docs_touch();

-- ===== سلّم التنبيه اليومي =====
create or replace function public.notify_office_doc_expiry()
returns int language plpgsql security definer set search_path = public as $$
declare
  d record; v_days int; v_stage int; n int := 0; v_title text; v_msg text;
begin
  for d in
    select id, name, expiry_date, alert_stage, issuing_authority
      from public.office_documents
     where expiry_date is not null and coalesce(status, 'active') = 'active'
  loop
    v_days := d.expiry_date - (now() at time zone 'Asia/Riyadh')::date;
    v_stage := case
      when v_days <= 0 then 0
      when v_days <= 7 then 7
      when v_days <= 30 then 30
      when v_days <= 60 then 60
      else null end;
    continue when v_stage is null;
    continue when d.alert_stage is not null and d.alert_stage <= v_stage;

    v_title := case when v_days < 0 then '⚠️ انتهى مستند للمكتب'
                    when v_days = 0 then '⚠️ ينتهي اليوم مستند للمكتب'
                    else '📄 مستند للمكتب يقترب انتهاؤه' end;
    v_msg := d.name || case
      when v_days < 0 then ' انتهى منذ ' || (-v_days) || ' يوماً — جدّده وارفع النسخة الجديدة.'
      when v_days = 0 then ' ينتهي اليوم.'
      else ' ينتهي بعد ' || v_days || ' يوماً (' || to_char(d.expiry_date, 'DD/MM/YYYY') || ').' end;

    insert into public.notifications (recipient_id, type, title, message, is_read, channels)
    select tm.id, 'office_doc_expiry', v_title, v_msg, false, array['app']
      from public.team_members tm
     where tm.is_director and coalesce(tm.is_active, true) and not coalesce(tm.is_reviewer, false);

    update public.office_documents set alert_stage = v_stage where id = d.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.notify_office_doc_expiry() from public, anon, authenticated;

select cron.unschedule('office-docs-expiry') where exists (select 1 from cron.job where jobname = 'office-docs-expiry');
select cron.schedule('office-docs-expiry', '45 6 * * *', $$select public.notify_office_doc_expiry()$$);

-- ===== وجهة إشعار الدفع: صفحة مستندات المكتب (نسخة الحية + سطر واحد) =====
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
    when new.type = 'mention' and new.case_id is not null
      then '/discussions?case=' || new.case_id
    when new.type = 'mention' then '/discussions'
    when new.case_id is not null then '/cases/' || new.case_id
    when new.type like 'appointment%' then '/appointments'
    when new.type = 'hr_request' then '/hr/approvals'
    when new.type = 'hr_result' then '/me'
    when new.type = 'change_request' then '/change-requests'
    when new.type = 'office_doc_expiry' then '/office-documents'
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
