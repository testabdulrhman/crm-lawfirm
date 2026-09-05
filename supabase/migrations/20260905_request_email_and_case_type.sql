-- عمودان على الوارد: بريد صاحب الطلب، ونوع القضية
--
-- كانا يُحشران في نصّ الوصف حين وصل الطلب من نموذج الموقع، فلا يُفلتَران ولا
-- ينتقلان إلى الملف. الآن حقلان مستقلان.
--
-- ⚠️ case_type بمفردات المكتب نفسها (CASE_TYPES: جزائي · عامة · تجاري ·
--    أحوال شخصية · عمالي · إداري · إفلاس) لا بقائمة موازية، لأنه ينتقل إلى
--    cases.type عند فتح الملف (RequestDetail.reallyConvert).
--    وخدمتا «النزاعات العقارية» و«التحكيم» في نموذج الموقع بلا مقابل في هذه
--    القائمة، فتبقى الخانة فارغة ويُحفظ اختيار العميل الحرفي في الوصف —
--    تسمية خاطئة أسوأ من خانة فارغة.

alter table public.incoming_requests
  add column if not exists client_email text,
  add column if not exists case_type    text;

comment on column public.incoming_requests.client_email is
  'بريد صاحب الطلب — يأتي من نموذج التواصل في الموقع، ويُدخله الموظف يدوياً لغيره';
comment on column public.incoming_requests.case_type is
  'نوع القضية بمفردات المكتب (lookup_values.case_type) — ينتقل إلى cases.type عند فتح الملف';
