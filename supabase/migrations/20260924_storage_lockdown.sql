-- إغلاق المخزن أمام المجهول (2026-09-24، بموافقة المدير «نعم، ابدأ»).
--
-- أربع سياسات allow_all (flreew_0..3) لدور public — أي anon أيضاً — بشرط true:
-- رفع وقراءة وتعديل وحذف لكل ملف في كل مخزن. ثبت عملياً اليوم: رفعٌ إلى
-- documents/discussion_general وحذفه بمفتاح anon العام (الموجود في صفحة الويب) نجحا
-- بلا تسجيل دخول — أي أن أي زائر يستطيع حذف مستندات الموكّلين أو استبدالها، وسرد
-- أسماء ١٥٠٠+ ملف، وقراءة وسائط واتساب في wa-media الخاص.
--
-- ما يحتاجه التطبيق فعلاً (فُحص الويب والآيفون): الرفع وحده (upsert=false، مسارات جديدة)
-- والروابط العامة. لا حذف ولا تعديل ولا سرد من أي عميل؛ الدوال تعمل بـservice_role.
--
-- ⚠️ الرفع يحتاج سياسة SELECT أيضاً: الخادم يُدرج بـRETURNING، والصف المُرجَع يجب أن
--    يمرّ بسياسات القراءة.
-- ⚠️ المخزنان documents وavatars «عامّان»: الرابط العام يُقرأ بلا سياسة أصلاً، فالقراءة
--    بالرابط لا تنكسر. جعل documents خاصاً (روابط موقّعة) مرحلة لاحقة.

drop policy if exists "allow_all flreew_0" on storage.objects;
drop policy if exists "allow_all flreew_1" on storage.objects;
drop policy if exists "allow_all flreew_2" on storage.objects;
drop policy if exists "allow_all flreew_3" on storage.objects;

-- الرفع: الموظفون المسجّلون، إلى المخزنين اللذين يرفع إليهما التطبيق
drop policy if exists staff_upload_files on storage.objects;
create policy staff_upload_files on storage.objects
  for insert to authenticated
  with check (bucket_id in ('documents', 'avatars'));

-- القراءة عبر الواجهة البرمجية (السرد + RETURNING للرفع): الموظفون، والمتعاون الخارجي
-- ما رفعه هو وحده — فلا يسرد مستندات ملفات ليست له
drop policy if exists staff_read_files on storage.objects;
create policy staff_read_files on storage.objects
  for select to authenticated
  using (bucket_id in ('documents', 'avatars')
         and ((not (select public.is_collaborator_caller())) or owner = auth.uid()));

-- لا سياسة حذف ولا تعديل للمستندات: لا يحتاجهما أي عميل، والدوال بـservice_role.
-- وتبقى كما هي: قراءة avatars العامة، وتعديل avatars للمسجّلين، ومجلد staff_applications
-- لنموذج التوظيف العام (رفع وقراءة لـanon في ذلك المجلد وحده).
