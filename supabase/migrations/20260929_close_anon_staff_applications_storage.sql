-- ثغرة سُدّت (2026-09-29، بموافقة المدير «اصلحهم»): سياستان قديمتان على مخزن documents من أيام كان
-- نموذج التوظيف يرفع من المتصفح مباشرة:
--   anon_read_staff_applications   — أي زائر بلا دخول يسرد ملفات السِّيَر الذاتية للمتقدمين.
--   anon_upload_staff_applications — أي زائر يرفع ما يشاء إلى المخزن.
-- النموذج اليوم (redwan.sa/careers) يرسل إلى دالة submit-application التي ترفع بمفتاح الخادم، فلا
-- حاجة لهما. روابط السِّيَر الحالية تبقى تعمل للموظفين (المخزن عام بالرابط، والسرد صار للموظفين وحدهم).
drop policy if exists anon_read_staff_applications on storage.objects;
drop policy if exists anon_upload_staff_applications on storage.objects;
