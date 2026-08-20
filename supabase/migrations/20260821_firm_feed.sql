-- «آخر النشاط» — Firm Feed (طلب المستخدم 2026-08-21: «في كليو اعجبتني firm feed»)
--
-- جدول activity_log كان موجوداً وشبه ميت: يُكتب من موضعين فقط (حذف مهمة من
-- الويب) ولا صفحة تعرضه. الآن التسجيل **خادمي بالكامل** عبر triggers —
-- فيلتقط كل مصادر الكتابة: الويب، تطبيق SwiftUI، الذكاء، والجدولة العكسية،
-- ولا يتكرر في كل عميل (امتداد قرار «المنطق في القاعدة»).
--
-- ⚠️ التسجيل ثانوي دائماً: كل دوال الـtrigger تبتلع أخطاءها — سجلٌّ فاشل
--    يجب ألا يمنع حفظ قضية أو مهمة أبداً.

begin;

/* ============ ١. entity_id للربط + فهرس القراءة ============ */

alter table public.activity_log
  add column if not exists entity_id uuid;

create index if not exists activity_log_feed_idx
  on public.activity_log (created_at desc);

/* ============ ٢. المسجّل الموحّد ============ */

create or replace function public.log_activity(
  p_type       text,
  p_entity     text,
  p_entity_id  uuid,
  p_title      text,
  p_case_id    uuid default null,
  p_actor      uuid default null,
  p_actor_name text default null,
  p_from       text default null,
  p_to         text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor uuid;
  v_name  text;
  v_num   text;
begin
  -- الفاعل: الممرَّر، وإلا صاحب الجلسة، وإلا «النظام» (كتابات service_role)
  v_actor := coalesce(p_actor, (select id from team_members where auth_id = auth.uid() limit 1));
  v_name  := coalesce(
    p_actor_name,
    (select coalesce(short_name, name) from team_members where id = v_actor),
    'النظام'
  );
  if p_case_id is not null then
    select office_num into v_num from cases where id = p_case_id;
  end if;

  insert into activity_log
    (type, entity, entity_id, title, user_id, user_name, case_id, case_num, diff_from, diff_to)
  values
    (p_type, p_entity, p_entity_id, left(coalesce(p_title, ''), 200),
     v_actor, v_name, p_case_id, v_num, p_from, p_to);
exception when others then
  null; -- التسجيل لا يكسر العملية الأصلية أبداً
end;
$$;

revoke execute on function public.log_activity(text,text,uuid,text,uuid,uuid,text,text,text) from anon, public;

/* ============ ٣. المشغّلات ============ */

-- القضايا: فتح + تغيير حالة
create or replace function public.feed_cases() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('create','case',new.id,new.title,new.id);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform log_activity('status','case',new.id,new.title,new.id,null,null,old.status,new.status);
  end if;
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_cases_trg on public.cases;
create trigger feed_cases_trg after insert or update of status on public.cases
  for each row execute function public.feed_cases();

-- الجلسات: جدولة + إغلاق
create or replace function public.feed_sessions() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('create','session',new.id,
      coalesce(new.title,'جلسة') || coalesce(' — ' || new.session_date::text,''), new.case_id);
  elsif tg_op = 'UPDATE' and new.closed_at is not null and old.closed_at is null then
    perform log_activity('close','session',new.id,
      coalesce(new.title,'جلسة') || coalesce(' — ' || new.session_date::text,''), new.case_id);
  end if;
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_sessions_trg on public.sessions;
create trigger feed_sessions_trg after insert or update of closed_at on public.sessions
  for each row execute function public.feed_sessions();

-- الأحكام
create or replace function public.feed_rulings() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform log_activity('create','ruling',new.id,
    coalesce(new.title, 'حكم') || coalesce(' رقم ' || nullif(new.ruling_number,''), ''), new.case_id);
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_rulings_trg on public.rulings;
create trigger feed_rulings_trg after insert on public.rulings
  for each row execute function public.feed_rulings();

-- المستندات: الرافع قد يكون بالاسم فقط (رفع دفعات)
create or replace function public.feed_documents() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform log_activity('upload','document',new.id,new.name,new.case_id,null,new.uploaded_by_name);
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_documents_trg on public.documents;
create trigger feed_documents_trg after insert on public.documents
  for each row execute function public.feed_documents();

-- المهام: إنشاء (الفاعل: صاحب الجلسة وإلا created_by — يلتقط مهام الذكاء
-- والجدولة العكسية باسم مسبّبها) + إنجاز + حذف
create or replace function public.feed_tasks() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('create','task',new.id,new.title,new.case_id,new.created_by);
  elsif tg_op = 'UPDATE' then
    if new.status = 'done' and old.status is distinct from 'done' then
      perform log_activity('done','task',new.id,new.title,new.case_id,new.assignee_id);
    elsif new.deleted_at is not null and old.deleted_at is null then
      perform log_activity('delete','task',new.id,new.title,new.case_id,null,new.deleted_by);
    end if;
  end if;
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_tasks_trg on public.tasks;
create trigger feed_tasks_trg after insert or update of status, deleted_at on public.tasks
  for each row execute function public.feed_tasks();

-- الوكالات والاستشارات والتوثيق والمواعيد والعقود والصادر: الإنشاء
create or replace function public.feed_poa() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform log_activity('create','poa',new.id,
    'وكالة ' || coalesce(nullif(new.poa_number,''),'') || coalesce(' — ' || new.client_name,''), new.case_id);
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_poa_trg on public.powers_of_attorney;
create trigger feed_poa_trg after insert on public.powers_of_attorney
  for each row execute function public.feed_poa();

create or replace function public.feed_legal_services() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform log_activity('create','legal_service',new.id,
    coalesce(new.title,'استشارة / لائحة') || coalesce(' — ' || new.client_name,''));
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_ls_trg on public.legal_services;
create trigger feed_ls_trg after insert on public.legal_services
  for each row execute function public.feed_legal_services();

create or replace function public.feed_property() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform log_activity('create','property',new.id,
    'توثيق عقاري' || coalesce(' — ' || new.seller_name,'') || coalesce(' ← ' || new.buyer_name,''));
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_property_trg on public.property_transfers;
create trigger feed_property_trg after insert on public.property_transfers
  for each row execute function public.feed_property();

create or replace function public.feed_appointments() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform log_activity('create','appointment',new.id,
    coalesce(new.client_name,'موعد') || coalesce(' — ' || new.appointment_date::text,''));
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_appointments_trg on public.appointments;
create trigger feed_appointments_trg after insert on public.appointments
  for each row execute function public.feed_appointments();

create or replace function public.feed_engagements() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform log_activity('create','engagement',new.id, coalesce(new.title,'عقد'));
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_engagements_trg on public.engagements;
create trigger feed_engagements_trg after insert on public.engagements
  for each row execute function public.feed_engagements();

create or replace function public.feed_letters() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform log_activity('create','letter',new.id, coalesce(new.subject, 'خطاب صادر'), new.case_id);
  return new;
exception when others then return new;
end; $$;
drop trigger if exists feed_letters_trg on public.outgoing_letters;
create trigger feed_letters_trg after insert on public.outgoing_letters
  for each row execute function public.feed_letters();

/* ============ ٤. دالة القراءة ============ */

create or replace function public.firm_feed(p_limit int default 60, p_before timestamptz default null)
returns setof public.activity_log
language sql
stable
set search_path to 'public'
as $$
  select * from activity_log
  where p_before is null or created_at < p_before
  order by created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 200);
$$;

revoke execute on function public.firm_feed(int, timestamptz) from anon, public;
grant  execute on function public.firm_feed(int, timestamptz) to authenticated;

alter table public.activity_log enable row level security;
drop policy if exists activity_select on public.activity_log;
create policy activity_select on public.activity_log
  for select to authenticated using (true);
-- الإدراج من العملاء يبقى مسموحاً مؤقتاً: نسخة الويب المنشورة الحالية ما
-- زالت تكتب حذف المهام يدوياً حتى تصلها النسخة الجديدة
drop policy if exists activity_insert on public.activity_log;
create policy activity_insert on public.activity_log
  for insert to authenticated with check (true);
revoke all on public.activity_log from anon;

/* ============ ٥. Backfill آخر ٣٠ يوماً — سجلٌّ فارغ لا يقنع أحداً ============ */

insert into activity_log (type, entity, entity_id, title, user_name, case_id, case_num, created_at)
select 'upload','document', d.id, d.name, coalesce(d.uploaded_by_name,'النظام'),
       d.case_id, c.office_num, d.created_at
from documents d left join cases c on c.id = d.case_id
where d.created_at > now() - interval '30 days' and d.deleted_at is null
  and not exists (select 1 from activity_log a where a.entity='document' and a.entity_id=d.id);

insert into activity_log (type, entity, entity_id, title, user_name, case_id, case_num, created_at)
select 'create','session', s.id,
       coalesce(s.title,'جلسة') || coalesce(' — ' || s.session_date::text,''),
       'النظام', s.case_id, c.office_num, s.created_at
from sessions s left join cases c on c.id = s.case_id
where s.created_at > now() - interval '30 days'
  and not exists (select 1 from activity_log a where a.entity='session' and a.entity_id=s.id);

insert into activity_log (type, entity, entity_id, title, user_name, case_id, case_num, created_at)
select 'create','ruling', r.id,
       coalesce(r.title,'حكم') || coalesce(' رقم ' || nullif(r.ruling_number,''),''),
       coalesce(r.uploaded_by_name,'النظام'), r.case_id, c.office_num, r.created_at
from rulings r left join cases c on c.id = r.case_id
where r.created_at > now() - interval '30 days'
  and not exists (select 1 from activity_log a where a.entity='ruling' and a.entity_id=r.id);

insert into activity_log (type, entity, entity_id, title, user_id, user_name, case_id, case_num, created_at)
select 'create','task', t.id, t.title, t.created_by,
       coalesce((select coalesce(short_name,name) from team_members tm where tm.id=t.created_by),'النظام'),
       t.case_id, c.office_num, t.created_at
from tasks t left join cases c on c.id = t.case_id
where t.created_at > now() - interval '30 days' and t.deleted_at is null
  and not exists (select 1 from activity_log a where a.entity='task' and a.entity_id=t.id);

commit;
