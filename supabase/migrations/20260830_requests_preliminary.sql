-- الخطوة ٢ب: حقول «الجلسة التمهيدية» الخمسة (2026-08-30) — بند ٢ من
-- المرحلة الأولى: «جمع البيانات لا إبداء الرأي». طُبّق على الإنتاج باسم
-- requests_preliminary_fields.
alter table public.incoming_requests
  add column if not exists capacity text
    check (capacity in ('principal','agent')),
  add column if not exists court_name text,
  add column if not exists claim_number text,
  add column if not exists critical_date date,
  add column if not exists critical_date_kind text
    check (critical_date_kind in ('notice','objection','prescription')),
  add column if not exists prior_lawyer text;
create index if not exists incoming_requests_critical_idx
  on public.incoming_requests (critical_date) where critical_date is not null;
