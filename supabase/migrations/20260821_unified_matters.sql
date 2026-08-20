-- توحيد القاعدة: جدول القضايا يصير جدول «الملفات» (المرحلة ٢ — قرار المستخدم
-- 2026-08-21: «ليه لاحقاً؟ أنا أصلاً ما راح أعمل SaaS لنفس هذا المشروع»)
--
-- الطريقة: لا جدول جديد ولا نقل للقضايا — عمود kind على cases بقيمة افتراضية
-- 'case'، فيبقى كل ما يتدلّى منه (١٥+ جدولاً وترقرز) كما هو حرفياً. الصفوف
-- المهاجرة عشرة فقط (٧ استشارات + ٣ توثيقات) بنفس معرّفاتها.
--
-- الحيلة المركزية: الجداول القديمة تُجمَّد باسم *_legacy، وتحل محلها **views
-- بنفس الاسم ونفس الأعمدة** تقرأ وتكتب من cases عبر INSTEAD OF triggers —
-- فتعمل كل الواجهات القائمة (الويب بصفحاته ونماذجه) دون تغيير سطر واحد،
-- بينما التخزين موحّد فعلاً: النقاش والذكاء والتفاعلات والمحفوظات وسجل
-- النشاط تخدم الاستشارة والتوثيق فوراً لأنها كلها موصولة بـcases.id.
--
-- الثمرة الفورية: افتح نقاشاً على استشارة — يعمل. منشن الذكاء فيها — يعمل.

begin;

/* ============ ١. cases يتسع للأنواع ============ */

alter table public.cases
  add column if not exists kind text not null default 'case',
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

alter table public.cases drop constraint if exists cases_kind_check;
alter table public.cases
  add constraint cases_kind_check check (kind in ('case','legal_service','property'));

create index if not exists cases_kind_idx on public.cases (kind);

comment on column public.cases.kind is
  'نوع الملف: case قضية · legal_service استشارة/لائحة · property توثيق عقاري — «الملفات» الموحّدة';
comment on column public.cases.details is
  'الحقول الخاصة بالنوع (استشارة/توثيق) — القضايا تستخدم أعمدتها الأصلية';

/* ============ ٢. سجل النشاط يعرف الأنواع ============ */

-- entity يتبع النوع: فتح استشارة لا يُسجَّل «فتح قضية»
create or replace function public.feed_cases() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform log_activity('create', new.kind, new.id, new.title,
      case when new.kind = 'case' then new.id else null end);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform log_activity('status', new.kind, new.id, new.title,
      case when new.kind = 'case' then new.id else null end,
      null, null, old.status, new.status);
  end if;
  return new;
exception when others then return new;
end; $$;

/* ============ ٣. الهجرة — عشرة صفوف بنفس معرّفاتها ============ */

-- تعطيل تسجيل النشاط أثناء النسخ: الهجرة ليست «فتح ملفات» جديدة
alter table public.cases disable trigger feed_cases_trg;

insert into public.cases
  (id, kind, title, contact_id, assignee_id, status, open_date, engagement_id,
   created_at, deleted_at, deleted_by, details)
select
  s.id, 'legal_service',
  coalesce(nullif(s.title,''), 'استشارة / لائحة'),
  s.client_id, s.assignee_id, s.status,
  coalesce(s.received_at, s.created_at::date),
  s.engagement_id, s.created_at, s.deleted_at, s.deleted_by,
  jsonb_strip_nulls(jsonb_build_object(
    'type', s.type, 'client_name', s.client_name, 'service_date', s.service_date,
    'notes', s.notes, 'regulation_type', s.regulation_type,
    'contract_type', s.contract_type, 'service_kind', s.service_kind,
    'party_first', s.party_first, 'party_second', s.party_second,
    'file_url', s.file_url, 'file_name', s.file_name, 'created_by', s.created_by,
    'assignee_name', s.assignee_name, 'received_date', s.received_date,
    'delivered_date', s.delivered_date, 'delivered_at', s.delivered_at
  ))
from public.legal_services s
on conflict (id) do nothing;

insert into public.cases
  (id, kind, title, contact_id, assignee_id, status, open_date,
   created_at, deleted_at, deleted_by, details)
select
  p.id, 'property',
  'توثيق عقاري — ' || coalesce(p.seller_name,'؟') || ' ← ' || coalesce(p.buyer_name,'؟'),
  p.seller_id, null, p.status,
  coalesce(p.transfer_date, p.created_at::date),
  p.created_at, p.deleted_at, p.deleted_by,
  jsonb_strip_nulls(jsonb_build_object(
    'transfer_type', p.transfer_type, 'seller_name', p.seller_name,
    'seller_id_num', p.seller_id_num, 'seller_phone', p.seller_phone,
    'buyer_id', p.buyer_id, 'buyer_name', p.buyer_name,
    'buyer_id_num', p.buyer_id_num, 'buyer_phone', p.buyer_phone,
    'property_type', p.property_type, 'deed_number', p.deed_number,
    'area', p.area, 'location', p.location, 'property_notes', p.property_notes,
    'amount', p.amount, 'amount_text', p.amount_text, 'notes', p.notes,
    'created_by', p.created_by
  ))
from public.property_transfers p
on conflict (id) do nothing;

alter table public.cases enable trigger feed_cases_trg;

/* ============ ٤. تجميد الجداول القديمة ============ */

drop trigger if exists feed_ls_trg on public.legal_services;
drop trigger if exists feed_property_trg on public.property_transfers;

alter table public.legal_services    rename to legal_services_legacy;
alter table public.property_transfers rename to property_transfers_legacy;

comment on table public.legal_services_legacy is
  '⚠️ مجمّد منذ 2026-08-21 — البيانات هاجرت إلى cases (kind=legal_service) والقراءة/الكتابة عبر view باسم legal_services. يُحذف بعد فترة اطمئنان.';
comment on table public.property_transfers_legacy is
  '⚠️ مجمّد منذ 2026-08-21 — البيانات هاجرت إلى cases (kind=property) والقراءة/الكتابة عبر view باسم property_transfers. يُحذف بعد فترة اطمئنان.';

revoke insert, update, delete on public.legal_services_legacy    from authenticated, anon;
revoke insert, update, delete on public.property_transfers_legacy from authenticated, anon;

/* ============ ٥. إعادة توجيه مستندات النوعين إلى cases ============ */

alter table public.legal_service_documents
  drop constraint if exists legal_service_documents_service_id_fkey;
alter table public.legal_service_documents
  add constraint legal_service_documents_service_id_fkey
  foreign key (service_id) references public.cases(id) on delete cascade;

alter table public.property_documents
  drop constraint if exists property_documents_transfer_id_fkey;
alter table public.property_documents
  add constraint property_documents_transfer_id_fkey
  foreign key (transfer_id) references public.cases(id) on delete cascade;

/* ============ ٦. view الاستشارات — نفس الاسم والأعمدة ============ */

create view public.legal_services
with (security_invoker = true) as
select
  c.id,
  c.details->>'type'                        as type,
  c.contact_id                              as client_id,
  c.details->>'client_name'                 as client_name,
  c.title,
  (c.details->>'service_date')::date        as service_date,
  c.status,
  c.details->>'notes'                       as notes,
  c.details->>'regulation_type'             as regulation_type,
  c.details->>'contract_type'               as contract_type,
  c.details->>'service_kind'                as service_kind,
  c.details->>'party_first'                 as party_first,
  c.details->>'party_second'                as party_second,
  c.details->>'file_url'                    as file_url,
  c.details->>'file_name'                   as file_name,
  c.details->>'created_by'                  as created_by,
  c.created_at,
  c.updated_at,
  c.assignee_id,
  c.details->>'assignee_name'               as assignee_name,
  (c.details->>'received_date')::date       as received_date,
  (c.details->>'delivered_date')::date      as delivered_date,
  c.open_date                               as received_at,
  (c.details->>'delivered_at')::date        as delivered_at,
  c.deleted_at,
  c.deleted_by,
  c.engagement_id
from public.cases c
where c.kind = 'legal_service';

create or replace function public.legal_services_vw_write() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_details jsonb;
begin
  if tg_op = 'DELETE' then
    delete from cases where id = old.id and kind = 'legal_service';
    return old;
  end if;

  v_details := jsonb_strip_nulls(jsonb_build_object(
    'type', new.type, 'client_name', new.client_name, 'service_date', new.service_date,
    'notes', new.notes, 'regulation_type', new.regulation_type,
    'contract_type', new.contract_type, 'service_kind', new.service_kind,
    'party_first', new.party_first, 'party_second', new.party_second,
    'file_url', new.file_url, 'file_name', new.file_name, 'created_by', new.created_by,
    'assignee_name', new.assignee_name, 'received_date', new.received_date,
    'delivered_date', new.delivered_date, 'delivered_at', new.delivered_at
  ));

  if tg_op = 'INSERT' then
    new.id := coalesce(new.id, gen_random_uuid());
    insert into cases (id, kind, title, contact_id, assignee_id, status,
                       open_date, engagement_id, deleted_at, deleted_by, details)
    values (new.id, 'legal_service',
            coalesce(nullif(new.title,''), 'استشارة / لائحة'),
            new.client_id, new.assignee_id, new.status,
            coalesce(new.received_at, current_date),
            new.engagement_id, new.deleted_at, new.deleted_by, v_details);
    return new;
  end if;

  -- UPDATE: استبدال التفاصيل كاملةً — النموذج يرسل كل الحقول، والمفاتيح
  -- الفارغة تُمحى بـ strip_nulls فيعمل «مسح الحقل» بطبيعته
  update cases set
    title       = coalesce(nullif(new.title,''), title),
    contact_id  = new.client_id,
    assignee_id = new.assignee_id,
    status      = new.status,
    open_date   = coalesce(new.received_at, open_date),
    engagement_id = new.engagement_id,
    deleted_at  = new.deleted_at,
    deleted_by  = new.deleted_by,
    details     = v_details
  where id = old.id and kind = 'legal_service';
  return new;
end; $$;

create trigger legal_services_vw_trg
  instead of insert or update or delete on public.legal_services
  for each row execute function public.legal_services_vw_write();

grant select, insert, update, delete on public.legal_services to authenticated;
revoke all on public.legal_services from anon;

/* ============ ٧. view التوثيق العقاري ============ */

create view public.property_transfers
with (security_invoker = true) as
select
  c.id,
  c.details->>'transfer_type'          as transfer_type,
  c.contact_id                         as seller_id,
  c.details->>'seller_name'            as seller_name,
  c.details->>'seller_id_num'          as seller_id_num,
  c.details->>'seller_phone'           as seller_phone,
  (c.details->>'buyer_id')::uuid       as buyer_id,
  c.details->>'buyer_name'             as buyer_name,
  c.details->>'buyer_id_num'           as buyer_id_num,
  c.details->>'buyer_phone'            as buyer_phone,
  c.details->>'property_type'          as property_type,
  c.details->>'deed_number'            as deed_number,
  (c.details->>'area')::numeric        as area,
  c.details->>'location'               as location,
  c.details->>'property_notes'         as property_notes,
  (c.details->>'amount')::numeric      as amount,
  c.details->>'amount_text'            as amount_text,
  c.open_date                          as transfer_date,
  c.status,
  c.details->>'notes'                  as notes,
  c.details->>'created_by'             as created_by,
  c.created_at,
  c.updated_at,
  c.deleted_at,
  c.deleted_by
from public.cases c
where c.kind = 'property';

create or replace function public.property_transfers_vw_write() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_details jsonb; v_title text;
begin
  if tg_op = 'DELETE' then
    delete from cases where id = old.id and kind = 'property';
    return old;
  end if;

  v_details := jsonb_strip_nulls(jsonb_build_object(
    'transfer_type', new.transfer_type, 'seller_name', new.seller_name,
    'seller_id_num', new.seller_id_num, 'seller_phone', new.seller_phone,
    'buyer_id', new.buyer_id, 'buyer_name', new.buyer_name,
    'buyer_id_num', new.buyer_id_num, 'buyer_phone', new.buyer_phone,
    'property_type', new.property_type, 'deed_number', new.deed_number,
    'area', new.area, 'location', new.location,
    'property_notes', new.property_notes, 'amount', new.amount,
    'amount_text', new.amount_text, 'notes', new.notes,
    'created_by', new.created_by
  ));
  v_title := 'توثيق عقاري — ' || coalesce(new.seller_name,'؟') || ' ← ' || coalesce(new.buyer_name,'؟');

  if tg_op = 'INSERT' then
    new.id := coalesce(new.id, gen_random_uuid());
    insert into cases (id, kind, title, contact_id, status, open_date,
                       deleted_at, deleted_by, details)
    values (new.id, 'property', v_title, new.seller_id, new.status,
            coalesce(new.transfer_date, current_date),
            new.deleted_at, new.deleted_by, v_details);
    return new;
  end if;

  update cases set
    title      = v_title,
    contact_id = new.seller_id,
    status     = new.status,
    open_date  = coalesce(new.transfer_date, open_date),
    deleted_at = new.deleted_at,
    deleted_by = new.deleted_by,
    details    = v_details
  where id = old.id and kind = 'property';
  return new;
end; $$;

create trigger property_transfers_vw_trg
  instead of insert or update or delete on public.property_transfers
  for each row execute function public.property_transfers_vw_write();

grant select, insert, update, delete on public.property_transfers to authenticated;
revoke all on public.property_transfers from anon;

/* ============ ٨. عدّادات اللوحة: القضايا قضايا فقط ============ */

create or replace function public.dashboard_overview(p_scope text default 'all'::text)
returns json
language sql
stable
set search_path to 'public'
as $$
  with me as (
    select id as tm_id from team_members where auth_id = auth.uid() limit 1
  )
  select json_build_object(
    'scope', p_scope,
    'stats', json_build_object(
      'cases_total', (select count(*) from cases where kind = 'case'),
      'cases_active', (select count(*) from cases where kind = 'case' and status='jarri'),
      'contacts', (select count(*) from contacts),
      'staff_active', (select count(*) from team_members where is_active=true),
      'open_tasks', (select count(*) from tasks tk
        where tk.status='todo'
        and (p_scope='all' or tk.assignee_id = (select tm_id from me))),
      'overdue_tasks', (select count(*) from tasks tk
        where tk.status='todo' and tk.due_date < CURRENT_DATE
        and (p_scope='all' or tk.assignee_id = (select tm_id from me))),
      'upcoming_sessions', (select count(*) from sessions se
        where se.session_date >= CURRENT_DATE
        and (p_scope='all' or se.case_id in (select id from cases where assignee_id = (select tm_id from me)))),
      'upcoming_appointments', (select count(*) from appointments where appointment_date >= CURRENT_DATE and status='confirmed'),
      'pending_applications', (select count(*) from staff_applications where status='pending' and deleted_at is null),
      'pending_requests', (select count(*) from incoming_requests where status='under_review'),
      'expiring_poas', (select count(*) from powers_of_attorney where deleted_at is null and status='active' and expiry_date between CURRENT_DATE and CURRENT_DATE + 30)
    ),
    'upcoming_sessions', (select coalesce(json_agg(s), '[]'::json) from (
      select se.id, se.case_id, se.title, se.session_date, se.session_time, se.court,
             c.title as case_title, c.office_num
      from sessions se left join cases c on c.id = se.case_id
      where se.session_date >= CURRENT_DATE
        and (p_scope='all' or c.assignee_id = (select tm_id from me))
      order by se.session_date, se.session_time limit 8
    ) s),
    'tasks', (select coalesce(json_agg(t), '[]'::json) from (
      select tk.id, tk.case_id, tk.title, tk.due_date, tk.priority, tk.is_urgent,
             (tk.due_date < CURRENT_DATE) as overdue,
             c.title as case_title
      from tasks tk left join cases c on c.id = tk.case_id
      where tk.status='todo'
        and (p_scope='all' or tk.assignee_id = (select tm_id from me))
      order by tk.is_urgent desc, (tk.due_date < CURRENT_DATE) desc,
               tk.due_date asc nulls last limit 8
    ) t),
    'appointments', (select coalesce(json_agg(a), '[]'::json) from (
      select ap.id, ap.client_name, ap.appointment_date, ap.appointment_time, ap.status
      from appointments ap where ap.appointment_date >= CURRENT_DATE
      order by ap.appointment_date, ap.appointment_time limit 5
    ) a),
    'applications', (select coalesce(json_agg(ap), '[]'::json) from (
      select id, full_name, qualifications, created_at, (cv_url is not null) as has_cv
      from staff_applications where status='pending' and deleted_at is null
      order by created_at desc limit 5
    ) ap),
    'requests', (select coalesce(json_agg(r), '[]'::json) from (
      select id, client_name, request_type, description, created_at
      from incoming_requests where status='under_review'
      order by created_at desc limit 5
    ) r),
    'expiring_poas', (select coalesce(json_agg(p), '[]'::json) from (
      select id, poa_number, client_name, expiry_date, (expiry_date - CURRENT_DATE) as days_left
      from powers_of_attorney
      where deleted_at is null and status='active'
        and expiry_date between CURRENT_DATE and CURRENT_DATE + 30
      order by expiry_date asc limit 5
    ) p)
  );
$$;

commit;
