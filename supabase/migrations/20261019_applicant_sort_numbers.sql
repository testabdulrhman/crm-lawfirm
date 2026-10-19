-- فرز السير بما قرأه الذكاء (طلب المدير 2026-10-19): المعدل يُحفظ بمقاييس شتى (من ٥ / من ٤ / ٪) فلا يُفرز نصاً —
-- gpa_pct نسبة موحّدة ٠–١٠٠، وexperience_num سنوات الخبرة رقماً.
alter table public.staff_application_analysis
  add column if not exists gpa_pct numeric,
  add column if not exists experience_num numeric;
