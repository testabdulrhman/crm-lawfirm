-- ملخصان في دراسة القضية (اقتراح المدير 2026-10-10): «لو سألني القاضي: اترك المذكرة وعلّمني وش ردّك» و«لو طلب
-- العميل ملخصاً عن الأمر وش أجاوبه». يولّدهما case-study مع الدراسة، أو وحدهما لدراسة قائمة (mode: summaries).
alter table public.case_studies add column if not exists oral_brief text;      -- لو سألك القاضي — يُقال في دقيقة
alter table public.case_studies add column if not exists client_summary text;  -- للعميل بلغة بسيطة، بلا استراتيجيتنا
