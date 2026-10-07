-- التوقيع في النقاش يسجّل الخطاب صادراً (قرار المدير 2026-10-07: «نعم، نفذها والرقم يطبع على الخطاب تحت التوقيع
-- مباشرة»). الموظف يرفع الخطاب في نقاش الملف ويطلب توقيع المدير؛ والمدير يوقّع في مكانه؛ ولحظة التوقيع يُسجَّل
-- الخطاب في الصادر برقمٍ من الخادم، مربوطاً بالملف ورسالة النقاش ومستنده، والنسخة الموقّعة هي النهائية.

-- ---------- ترقيم الصادر من الخادم ----------
-- كان الرقم يُحسب في المتصفح (أكبر رقم + 1) — نمط كرّر الأرقام عندنا من قبل (gotcha-client-numbering-vs-rls).
-- الصيغة كما هي: OUT-YY-NNN. وما أُدخل يدوياً يُحترم؛ والفارغ يُرقَّم هنا بقفلٍ يمنع التزامن.
create or replace function public.next_outgoing_number()
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  yy text := to_char(now() at time zone 'Asia/Riyadh', 'YY');
  n int;
begin
  perform pg_advisory_xact_lock(hashtext('outgoing_letter_number'));
  select coalesce(max((regexp_match(letter_number, '^OUT-' || yy || '-(\d+)$'))[1]::int), 0) + 1 into n
    from outgoing_letters where letter_number ~ ('^OUT-' || yy || '-\d+$');
  return 'OUT-' || yy || '-' || lpad(n::text, 3, '0');
end $$;
revoke all on function public.next_outgoing_number() from public, anon, authenticated;

create or replace function public.outgoing_number_trg()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  if coalesce(btrim(new.letter_number), '') = '' then
    new.letter_number := public.next_outgoing_number();
  end if;
  return new;
end $$;
revoke all on function public.outgoing_number_trg() from public, anon, authenticated;
drop trigger if exists outgoing_number_trg on public.outgoing_letters;
create trigger outgoing_number_trg before insert on public.outgoing_letters
  for each row execute function public.outgoing_number_trg();

-- ---------- الخطاب ← رسالة النقاش ومستنده ----------
alter table public.outgoing_letters add column if not exists source_comment_id uuid references public.case_comments(id) on delete set null;
alter table public.outgoing_letters add column if not exists document_id uuid references public.documents(id) on delete set null;

-- موضع التوقيع مستقلاً عن الختم ({page,x,y}) — طلب المدير: «أقدر أغير مكان التوقيع ما يكون مكانهم مرتبطين».
-- null = الترتيب القديم (التوقيع فوق الختم) للطلبات السابقة.
alter table public.outgoing_approvals add column if not exists sig_pos jsonb;

-- ---------- طلب توقيع من النقاش ----------
create table if not exists public.sign_requests (
  id           uuid primary key default gen_random_uuid(),
  comment_id   uuid not null references public.case_comments(id) on delete cascade,
  case_id      uuid references public.cases(id) on delete cascade,
  document_id  uuid references public.documents(id) on delete set null,
  requested_by uuid references public.team_members(id) on delete set null,
  requested_at timestamptz not null default now(),
  note         text,
  status       text not null default 'pending' check (status in ('pending', 'signed', 'cancelled')),
  letter_id    uuid references public.outgoing_letters(id) on delete set null,
  signed_at    timestamptz
);
create unique index if not exists sign_requests_one_pending on public.sign_requests(comment_id) where status = 'pending';
create index if not exists sign_requests_status_idx on public.sign_requests(status, requested_at desc);

alter table public.sign_requests enable row level security;
revoke all on public.sign_requests from anon;
drop policy if exists sign_requests_read on public.sign_requests;
create policy sign_requests_read on public.sign_requests for select to authenticated
  using ((select is_director_caller()) or requested_by = (select my_member_id()) or public.can_access_case(case_id));
drop policy if exists sign_requests_insert on public.sign_requests;
create policy sign_requests_insert on public.sign_requests for insert to authenticated
  with check (requested_by = (select my_member_id()) and status = 'pending' and public.can_access_case(case_id));
drop policy if exists sign_requests_update on public.sign_requests;
create policy sign_requests_update on public.sign_requests for update to authenticated
  using ((select is_director_caller()) or requested_by = (select my_member_id()))
  with check ((select is_director_caller()) or (requested_by = (select my_member_id()) and status in ('pending', 'cancelled')));

-- إشعار المدير: وقته وقت الرسالة نفسها، فيفتح الجرس النقاش عندها (نمط المنشن — feature-mention-jump)
create or replace function public.sign_request_notify()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare
  v_name text := (select coalesce(short_name, name) from team_members where id = new.requested_by);
  v_doc text := (select d.name from documents d where d.id = new.document_id);
  v_case text := (select office_num from cases where id = new.case_id);
  v_at timestamptz := (select created_at from case_comments where id = new.comment_id);
  d uuid;
begin
  for d in select id from team_members where is_director and is_active and id is distinct from new.requested_by loop
    insert into notifications (type, title, message, recipient_id, case_id, created_at)
    values ('approval_sign', '✍️ طلب توقيع' || coalesce(' · ' || v_case, ''),
            coalesce(v_name, 'موظف') || ' يطلب توقيعك على «' || coalesce(v_doc, 'خطاب') || '»'
              || coalesce(' — ' || nullif(btrim(new.note), ''), ''),
            d, new.case_id, coalesce(v_at, now()));
  end loop;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.sign_request_notify() from public, anon, authenticated;
drop trigger if exists sign_request_notify_trg on public.sign_requests;
create trigger sign_request_notify_trg after insert on public.sign_requests
  for each row execute function public.sign_request_notify();

-- وقّع المدير ⇒ يُبلَّغ الطالب برقم الصادر
create or replace function public.sign_request_done_notify()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $$
declare v_num text := (select letter_number from outgoing_letters where id = new.letter_id);
begin
  if new.status = 'signed' and old.status = 'pending' and new.requested_by is not null then
    insert into notifications (type, title, message, recipient_id, case_id)
    values ('approval_result', '✍️ وُقّع خطابك' || coalesce(' — ' || v_num, ''),
            'النسخة الموقّعة في خيط رسالتك بالنقاش، ومسجّلة في الصادر' || coalesce(' برقم ' || v_num, ''),
            new.requested_by, new.case_id);
  end if;
  return new;
exception when others then
  return new;
end $$;
revoke all on function public.sign_request_done_notify() from public, anon, authenticated;
drop trigger if exists sign_request_done_trg on public.sign_requests;
create trigger sign_request_done_trg after update of status on public.sign_requests
  for each row execute function public.sign_request_done_notify();

-- ---------- إشعار الدفع لطلب التوقيع يفتح النقاش ----------
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
