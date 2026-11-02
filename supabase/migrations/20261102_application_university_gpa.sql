-- نموذج التقديم الجديد في الموقع (طلب المدير 2026-11-02: «ودي أضيف أيضاً من ضمن الخيارات اللي يقدمهن
-- الجامعة + المعدل من 5» ثم صورة نموذج «ابي زي كذا»): الجامعة، التخصص، سنة التخرج، المعدل من ٥،
-- و«تخيّل أن سيرتك لم تصلنا… ماذا تودّ أن تقول لنا؟» (about_me). تاريخ الميلاد عموده قائم (date_of_birth).
-- تُدرَج من submit-application بمفتاح الخادم؛ وما يقرؤه الذكاء من السيرة يبقى في staff_application_analysis.
alter table public.staff_applications
  add column if not exists university text,
  add column if not exists gpa numeric(3,2) check (gpa is null or (gpa >= 0 and gpa <= 5));

alter table public.staff_applications
  add column if not exists major text,
  add column if not exists graduation_year int check (graduation_year is null or graduation_year between 1960 and 2040),
  add column if not exists about_me text;
