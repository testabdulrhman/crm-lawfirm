-- النوع الرابع للمشاريع: **إجراء إفلاس** (تخصّص المكتب).
--
-- لا جدول جديد ولا صفحة جديدة: يعيش في `cases` بـ`kind='bankruptcy'` فيرث
-- الجلسات والأحكام والمذكرات والمستندات والمهام والنقاش وقصة الملف والدراسة
-- وفريق الملف والوكالات. الفرق مفردات فقط: «نوع الإجراء» يعرض أنواع نظام
-- الإفلاس السعودي (BANKRUPTCY_PROCEDURES في src/lib/caseLabels.ts) بدل
-- تصنيفات القضايا، ويشارك القضايا حالاتها (جارية/معلّقة/منتهية) فيتّسق مع
-- اللوحة والتقارير وإسكات تنبيه الوكالة على ملف منتهٍ.
alter table public.cases drop constraint if exists cases_kind_check;
alter table public.cases add constraint cases_kind_check
  check (kind = any (array['case','legal_service','property','bankruptcy','channel']));
