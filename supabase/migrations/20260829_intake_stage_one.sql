-- المرحلة الأولى من وثيقة المستخدم: «الاستقطاب والتحليل الأولي (Intake)»
-- طُبِّقت على الإنتاج 2026-08-29. بنودها الأربعة كما وردت في الوثيقة:
--   ١. قناة دخول موحّدة بسجل استفسارات برقم مرجعي فوري (LEAD-YYYY-NNN)
--   ٢. الجلسة التمهيدية — بندٌ داخل هذه المرحلة لا مرحلة مستقلة
--   ٣. فحص تعارض المصالح بثلاث دوائر (بوابة إلزامية)
--   ٤. العناية الواجبة KYC/AML
--
-- ⚠️ الأحكام النظامية (الاحتفاظ عشر سنوات، تصنيف الأنشطة، المستفيد
--    الحقيقي) منقولة عن الوثيقة ولم تُراجع على الأنظمة السعودية.
--
-- ملاحظة تصميمية: conflict_coverage() تُحفظ مع كل فحص عمداً. أسماء الخصوم
-- مسجّلة في ٢٥ صفاً فقط مقابل ٢٣٣ ملفاً، فنتيجة «لا تطابق» ليست قاطعة —
-- وإخفاء ذلك يصنع ثقة زائفة أسوأ من غياب الفحص. لذلك يبحث النظام أيضاً في
-- **عناوين الملفات**، وهي تحمل الخصم غالباً («فلان ضد فلان») فتعوّض النقص.

/* ١. الرقم المرجعي الفوري */
alter table public.incoming_requests
  add column if not exists ref_no text,
  add column if not exists opponent_name text;

comment on column public.incoming_requests.opponent_name is
  'الطرف المقابل — بدونه لا يمكن إجراء فحص تعارض المصالح أصلاً';

create unique index if not exists incoming_requests_ref_no_uniq
  on public.incoming_requests (ref_no) where ref_no is not null;

create table if not exists public.lead_counters (
  year_yy int primary key,
  last_no int not null default 0
);

create or replace function public.next_lead_reference()
returns text language plpgsql security definer set search_path to 'public'
as $$
declare v_yy int := extract(year from (now() at time zone 'Asia/Riyadh'))::int; v_no int;
begin
  insert into lead_counters (year_yy, last_no) values (v_yy, 1)
  on conflict (year_yy) do update set last_no = lead_counters.last_no + 1
  returning last_no into v_no;
  return 'LEAD-' || v_yy::text || '-' || lpad(v_no::text, 3, '0');
end;
$$;
revoke execute on function public.next_lead_reference() from anon, public;
grant execute on function public.next_lead_reference() to authenticated;

create or replace function public.set_lead_reference()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.ref_no is null then new.ref_no := next_lead_reference(); end if;
  return new;
end;
$$;

drop trigger if exists set_lead_reference_trg on public.incoming_requests;
create trigger set_lead_reference_trg before insert on public.incoming_requests
  for each row execute function public.set_lead_reference();

with numbered as (
  select id, row_number() over (order by received_at nulls last, created_at) as rn
  from incoming_requests where ref_no is null
)
update incoming_requests r set ref_no = 'LEAD-2026-' || lpad(n.rn::text, 3, '0')
from numbered n where r.id = n.id;

insert into lead_counters (year_yy, last_no)
values (2026, (select count(*) from incoming_requests where ref_no like 'LEAD-2026-%'))
on conflict (year_yy) do update
  set last_no = greatest(lead_counters.last_no, excluded.last_no);

/* ٢. الجلسة التمهيدية داخل الاستقطاب — لا مرحلة مستقلة */
alter table public.appointments
  add column if not exists request_id uuid references public.incoming_requests(id) on delete set null;

create index if not exists appointments_request_id_idx
  on public.appointments (request_id) where request_id is not null;

/* ٣. فحص تعارض المصالح — البوابة الإلزامية */
create table if not exists public.conflict_checks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.incoming_requests(id) on delete cascade,
  case_id uuid references public.cases(id) on delete cascade,
  searched_name text not null,
  outcome text not null check (outcome in ('accept','reject','conditional')),
  matches jsonb not null default '[]'::jsonb,
  coverage jsonb not null default '{}'::jsonb,
  screen_wall text,
  notes text,
  checked_by uuid references public.team_members(id),
  checked_by_name text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.conflict_checks is
  'فحص تعارض المصالح — وثيقة دفاعية: من فحص، ومتى، وما ظهر، وما قرّر';
comment on column public.conflict_checks.coverage is
  'كم سجلاً فُحص في كل دائرة وقت الفحص — يمنع ثقة زائفة حين تكون البيانات ناقصة';
comment on column public.conflict_checks.screen_wall is
  'جدار العزل المعلوماتي — يُملأ عند القبول المشروط';

alter table public.conflict_checks enable row level security;
drop policy if exists authenticated_all on public.conflict_checks;
create policy authenticated_all on public.conflict_checks
  for all to authenticated using (true) with check (true);
drop policy if exists reviewer_conflict_checks on public.conflict_checks;
create policy reviewer_conflict_checks on public.conflict_checks
  as restrictive for all to authenticated
  using (not is_reviewer_caller()) with check (not is_reviewer_caller());

/* ٤. العناية الواجبة KYC/AML */
create table if not exists public.kyc_checks (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.incoming_requests(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  client_type text not null default 'individual'
    check (client_type in ('individual','company')),
  id_type text,
  id_number text,
  id_verified boolean not null default false,
  id_doc_url text,
  capacity text check (capacity in ('principal','agent')),
  cr_number text,
  authorization_doc_url text,
  ubo_name text,
  ubo_id_number text,
  risk_level text not null default 'low' check (risk_level in ('low','medium','high')),
  edd_required boolean not null default false,
  edd_notes text,
  red_flags text[] not null default '{}',
  notes text,
  checked_by uuid references public.team_members(id),
  checked_by_name text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.kyc_checks is
  'العناية الواجبة (KYC/AML) — الوثيقة تلزم بالاحتفاظ بسجلاتها عشر سنوات';

alter table public.kyc_checks enable row level security;
drop policy if exists authenticated_all on public.kyc_checks;
create policy authenticated_all on public.kyc_checks
  for all to authenticated using (true) with check (true);
drop policy if exists reviewer_kyc_checks on public.kyc_checks;
create policy reviewer_kyc_checks on public.kyc_checks
  as restrictive for all to authenticated
  using (not is_reviewer_caller()) with check (not is_reviewer_caller());

/* ٥. البحث بالدوائر الثلاث — invoker فيخضع لـRLS */
create or replace function public.conflict_search(p_name text)
returns table (circle text, source text, ref_id uuid, label text, detail text)
language sql stable security invoker set search_path to 'public'
as $$
  with q as (select ar_norm(btrim(coalesce(p_name, ''))) as n)
  select 'direct', 'contacts', c.id, c.name, coalesce(c.phone, c.id_number, '')
  from contacts c, q
  where q.n <> '' and ar_norm(c.name) like '%' || q.n || '%'

  union all
  select 'historical', 'cases', k.id, k.title, coalesce(k.office_num, '')
  from cases k, q
  where q.n <> '' and ar_norm(coalesce(k.title, '')) like '%' || q.n || '%'
    and k.deleted_at is null and k.kind is distinct from 'channel'

  union all
  select 'historical', 'case_parties', p.case_id, p.name, coalesce(p.party_side, '')
  from case_parties p, q
  where q.n <> '' and ar_norm(coalesce(p.name, '')) like '%' || q.n || '%'

  union all
  select 'structural', 'team_members', t.id, t.name, coalesce(t.role, '')
  from team_members t, q
  where q.n <> '' and ar_norm(coalesce(t.name, '')) like '%' || q.n || '%'
  limit 60;
$$;

revoke execute on function public.conflict_search(text) from anon, public;
grant execute on function public.conflict_search(text) to authenticated;

create or replace function public.conflict_coverage()
returns jsonb language sql stable security invoker set search_path to 'public'
as $$
  select jsonb_build_object(
    'contacts',     (select count(*) from contacts),
    'cases',        (select count(*) from cases where deleted_at is null and kind is distinct from 'channel'),
    'case_parties', (select count(*) from case_parties),
    'team_members', (select count(*) from team_members)
  );
$$;

revoke execute on function public.conflict_coverage() from anon, public;
grant execute on function public.conflict_coverage() to authenticated;
