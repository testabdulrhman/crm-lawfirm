-- الخطوة ٣: «لا يُعد الملف مفتوحاً إلا باستكمال الستة» (2026-08-30).
-- طُبّق على الإنتاج باسم requests_onboarding_gate.
alter table public.incoming_requests
  add column if not exists contract_signed_at date,
  add column if not exists poa_ref text,
  add column if not exists advance_amount numeric,
  add column if not exists advance_received_at date,
  add column if not exists conversion_bypass_reason text;
