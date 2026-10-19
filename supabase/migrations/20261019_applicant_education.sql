-- تعليم المتقدّم حقولاً مستقلة (طلب المدير 2026-10-19 بعد «كم متقدم من جامعة القصيم؟» فلم يعرف المساعد):
-- كانت الجامعة نصاً داخل الملخص وحده (٤٥ من ٨٠ يذكرها). تُستخرج من السيرة مع التحليل، وتُملأ للقائم مرة.
alter table public.staff_application_analysis
  add column if not exists university text,
  add column if not exists major text,
  add column if not exists degree text,
  add column if not exists graduation_year text;
