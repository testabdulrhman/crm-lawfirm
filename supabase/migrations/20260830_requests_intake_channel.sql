-- الخطوة ١ من إعادة ترتيب تبويب الطلبات على الوثيقة (2026-08-30):
-- «توحيد قناة الدخول» — عمود source على incoming_requests
-- (هاتف · حضور · الموقع · رسالة · إحالة، الافتراضي هاتف).
-- طُبّق على الإنتاج باسم requests_intake_channel.
alter table public.incoming_requests
  add column if not exists source text default 'هاتف';
comment on column public.incoming_requests.source is
  'قناة الوصول — توحيد القناة (بند ١ من المرحلة الأولى)';
