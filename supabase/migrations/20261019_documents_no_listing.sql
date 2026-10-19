-- المرحلة الأولى لإغلاق مخزن المستندات (فحص 2026-10-19): كان أي موظف يسرد مخزن documents كله (مسارات مرفقات
-- الرواتب والملفات المحجوبة) فيبني روابطها العامة. الواجهة والتطبيق لا يسردان ولا يقرآن عبر الواجهة البرمجية
-- (الروابط محفوظة في السجلات، والدوال تقرأ بمفتاح الخادم). يبقى للموظف ما رفعه هو (owner) — احتياطاً لقراءة
-- خادم التخزين الصفَّ بعد إدراجه — ولا يرى ما رفعه غيره.
-- المرحلة الثانية (مخزن خاص وروابط موقّتة) تنتظر تحويل الواجهة والتطبيق.
drop policy if exists staff_read_files on storage.objects;
create policy staff_read_files on storage.objects for select to authenticated
  using (bucket_id = 'avatars' or (bucket_id = 'documents' and owner = auth.uid()));
