-- العقود بدفعاتها (قرار المدير 2026-10-14 «نفّذ» على التصميم المبني من تحليل ١١٢ عقداً للمكتب):
-- ٩٠٪ من العقود مقسّطة (عند التوقيع / بتاريخ / عند حدث كالحكم الابتدائي)، و٢٣٪ بنسبة أو مختلطة، و٥٢٪ تنصّ على
-- استحقاق الأتعاب كاملة عند الصلح أو العزل، و«الموكّل نيابة عن غيره» شائع في الجزائي. فتُضاف حقولها، وجدول دفعات
-- تتابَع به المستحقات، والطلب الوارد إذا وُقّع عقده أنشأ العقد بدفعته المقدّمة (لا تسجيل في مكانين).
-- المال للمدير (perm_money_director) — والدفعات مثله.

alter table public.engagements
  add column if not exists fee_model text check (fee_model in ('fixed', 'percentage', 'mixed', 'periodic', 'other')),
  add column if not exists fee_percentage numeric(5,2),
  add column if not exists percentage_base text,                       -- مما يُحصَّل / من المحكوم به / …
  add column if not exists vat_mode text not null default 'unspecified'
    check (vat_mode in ('included', 'excluded', 'exempt', 'unspecified')),
  add column if not exists client_side text,                           -- مدعٍ / مدعى عليه / طالب تنفيذ / …
  add column if not exists beneficiary_name text,                      -- الموكّل نيابة عن غيره (قريب المتهم…)
  add column if not exists beneficiary_relation text,
  add column if not exists opponent_name text,
  add column if not exists stages_covered text[] not null default '{}', -- ابتدائي/استئناف/عليا/تنفيذ/صلح
  add column if not exists ends_on text,                               -- «ينتهي العقد بـ» صدور الحكم/الصك…
  add column if not exists first_party text check (first_party in ('company', 'lawyer', 'trustee')),
  add column if not exists client_rep_name text,
  add column if not exists client_rep_capacity text,
  add column if not exists dispute_venue text,
  add column if not exists expenses_on_client boolean,
  add column if not exists poa_required boolean,
  add column if not exists fees_due_on_settlement boolean,
  add column if not exists advance_refundable boolean,
  add column if not exists signed_file_url text,                       -- النسخة الموقّعة منفصلة عن المسودة
  add column if not exists request_id uuid references public.incoming_requests(id) on delete set null;
create index if not exists engagements_request on public.engagements(request_id) where request_id is not null;

-- الترقيم من الخادم (كان «أكبر رقم + 1» في المتصفح — gotcha-client-numbering-vs-rls) — والمُدخل يدوياً يُحترم
create or replace function public.engagement_number_trg()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare yy text := to_char(now() at time zone 'Asia/Riyadh', 'YY'); n int;
begin
  if coalesce(btrim(new.engagement_number), '') = '' then
    perform pg_advisory_xact_lock(hashtext('engagement_number'));
    select coalesce(max((regexp_match(engagement_number, '^CTR-' || yy || '-(\d+)$'))[1]::int), 0) + 1 into n
      from engagements where engagement_number ~ ('^CTR-' || yy || '-\d+$');
    new.engagement_number := 'CTR-' || yy || '-' || lpad(n::text, 3, '0');
  end if;
  return new;
end $$;
revoke all on function public.engagement_number_trg() from public, anon, authenticated;
drop trigger if exists engagement_number_trg on public.engagements;
create trigger engagement_number_trg before insert on public.engagements
  for each row execute function public.engagement_number_trg();

-- ---------- الدفعات ----------
create table if not exists public.engagement_installments (
  id               uuid primary key default gen_random_uuid(),
  engagement_id    uuid not null references public.engagements(id) on delete cascade,
  seq              int not null default 1,
  label            text not null,
  trigger          text not null default 'date' check (trigger in ('on_signing', 'date', 'event')),
  due_date         date,                                   -- للتاريخ المحدد
  event_kind       text check (event_kind in ('first_ruling', 'final_ruling', 'case_end', 'procedure_opening', 'plan_approval', 'other')),
  event_label      text,                                   -- نص الحدث كما في العقد
  event_reached_at date,                                   -- متى تحقق الحدث (يدوياً أو تلقائياً)
  amount           numeric(14,2),
  percent          numeric(5,2),                           -- نسبة من الأتعاب بدل المبلغ
  paid_at          date,
  paid_amount      numeric(14,2),
  payment_method   text,
  note             text,
  notified_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists engagement_installments_eng on public.engagement_installments(engagement_id, seq);
alter table public.engagement_installments enable row level security;
revoke all on public.engagement_installments from anon;
drop policy if exists inst_all on public.engagement_installments;
create policy inst_all on public.engagement_installments for all to authenticated using (true) with check (true);
drop policy if exists inst_money_director on public.engagement_installments;
create policy inst_money_director on public.engagement_installments as restrictive for all to authenticated
  using ((select is_director_caller())) with check ((select is_director_caller()));

-- ---------- الطلب الوارد ← العقد ← الملف ----------
-- توقيع العقد في الطلب (أياً كان من سجّله) يُنشئ العقد ودفعته المقدّمة؛ واستلام المقدّم يسدّدها؛ وفتح الملف يربطه
create or replace function public.engagement_from_request()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare e uuid; v_type text;
begin
  select id into e from engagements where request_id = new.id and deleted_at is null limit 1;

  if e is null and new.contract_signed_at is not null and old.contract_signed_at is null then
    v_type := case new.case_type when 'إفلاس' then 'bankruptcy' else 'case' end;
    insert into engagements (title, type, client_id, signed_date, fees_total, scope, status, request_id,
                             fee_model, opponent_name, created_by)
    values ('عقد ' || coalesce(new.client_name, ''), v_type, new.client_id, new.contract_signed_at,
            new.quote_amount, new.quote_scope, 'signed', new.id,
            case when new.quote_amount is not null then 'fixed' end, new.opponent_name, my_member_id())
    returning id into e;
    if new.advance_amount is not null then
      insert into engagement_installments (engagement_id, seq, label, trigger, amount, paid_at, paid_amount)
      values (e, 1, 'الدفعة المقدّمة — عند توقيع العقد', 'on_signing', new.advance_amount,
              new.advance_received_at, case when new.advance_received_at is not null then new.advance_amount end);
    end if;
  end if;

  if e is not null and new.advance_received_at is not null and old.advance_received_at is null then
    update engagement_installments set paid_at = new.advance_received_at, paid_amount = coalesce(paid_amount, amount)
     where engagement_id = e and trigger = 'on_signing' and paid_at is null;
  end if;

  if e is not null and new.converted_to_id is not null and old.converted_to_id is null then
    update cases set engagement_id = e where id = new.converted_to_id and engagement_id is null;
    update engagements set client_id = coalesce(client_id, new.client_id) where id = e;
  end if;
  return new;
exception when others then
  return new;   -- ثانوي: لا يمنع تحديث الطلب
end $$;
revoke all on function public.engagement_from_request() from public, anon, authenticated;
drop trigger if exists engagement_from_request_trg on public.incoming_requests;
create trigger engagement_from_request_trg after update on public.incoming_requests
  for each row execute function public.engagement_from_request();

-- ---------- الحدث يحقق الدفعة ----------
-- حكم يُسجَّل في ملف مرتبط بعقد ⇒ دفعة «عند صدور الحكم الابتدائي» تستحق، ويُبلَّغ المدير
create or replace function public.installments_on_ruling()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  if coalesce(new.is_dropped, false) then return new; end if;
  for r in
    update engagement_installments i set event_reached_at = coalesce(new.ruling_date, current_date)
      from cases c
     where c.id = new.case_id and c.engagement_id = i.engagement_id
       and i.trigger = 'event' and i.event_kind = 'first_ruling' and i.event_reached_at is null and i.paid_at is null
    returning i.id, i.label, i.amount, c.id as case_id, c.office_num
  loop
    insert into notifications (type, title, message, recipient_id, case_id)
    select 'installment_due', '💰 استحقت دفعة — ' || coalesce(r.office_num, ''),
           r.label || coalesce(' · ' || r.amount::text || ' ريال', '') || ' — صدر الحكم',
           tm.id, r.case_id
      from team_members tm where tm.is_director and tm.is_active;
  end loop;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.installments_on_ruling() from public, anon, authenticated;
drop trigger if exists installments_on_ruling_trg on public.rulings;
create trigger installments_on_ruling_trg after insert on public.rulings
  for each row execute function public.installments_on_ruling();

-- التذكير اليومي للمدير: دفعة بتاريخ حلّ موعدها أو تأخرت، مرة لكل دفعة كل ٧ أيام
create or replace function public.remind_installments()
 returns int language plpgsql security definer set search_path to 'public' as $$
declare r record; n int := 0;
begin
  for r in
    select i.*, e.engagement_number, e.title
      from engagement_installments i join engagements e on e.id = i.engagement_id
     where e.deleted_at is null and e.status not in ('cancelled', 'expired') and i.paid_at is null
       and ((i.trigger = 'date' and i.due_date <= current_date)
            or (i.trigger = 'event' and i.event_reached_at is not null and i.event_reached_at <= current_date - 3))
       and (i.notified_at is null or i.notified_at < now() - interval '7 days')
  loop
    insert into notifications (type, title, message, recipient_id)
    select 'installment_due',
           '💰 دفعة مستحقة — ' || coalesce(r.engagement_number, 'عقد'),
           coalesce(r.title, '') || ' · ' || r.label || coalesce(' · ' || r.amount::text || ' ريال', ''),
           tm.id
      from team_members tm where tm.is_director and tm.is_active;
    update engagement_installments set notified_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.remind_installments() from public, anon, authenticated;
select cron.unschedule('remind-installments') where exists (select 1 from cron.job where jobname = 'remind-installments');
select cron.schedule('remind-installments', '5 6 * * *', 'select public.remind_installments()');

-- إشعار الدفعة يفتح صفحة العقود (حين لا يكون مربوطاً بملف)
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
