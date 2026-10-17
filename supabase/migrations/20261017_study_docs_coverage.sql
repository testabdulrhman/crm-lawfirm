-- دراسة القضية تقرأ مستندات الملف كلها (طلب المدير 2026-10-17 «نعم» على الترقية): كانت تقرأ أحدث ٣ ملفات PDF
-- وحدها (٤٦ من ٧٢ ملفاً فيها أكثر)، وتتخطى Word والصور — وصحيفة الدعوى أول ما يُستبعد لأنها الأقدم.
-- docs_coverage: {total, read: [{name, kind}], skipped: [{name, reason}]} — يُعرض أعلى الدراسة «قُرئت ١٢ من ١٤».
alter table public.case_studies add column if not exists docs_coverage jsonb;
