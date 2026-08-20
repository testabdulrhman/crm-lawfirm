-- إزالة تبويب «الملاحظات» — الملاحظة رسالة نقاش بدائية (قرار المستخدم 2026-08-21)
--
-- جدول notes (قضية+كاتب+نص+تاريخ) هو حرفياً رسالة case_comments منزوعة
-- القدرات، وبقاؤهما يعيد سؤال «أكتبها وين؟» الذي حاربناه. الاستخدام: ١٤
-- ملاحظة منذ الإنشاء.

begin;

-- تعطيل صائد الذكاء أثناء الهجرة: ملاحظات قديمة ليست رسائل جديدة تُعالَج
alter table public.case_comments disable trigger case_comment_ai_trg;

insert into public.case_comments (id, case_id, author_id, body, kind, created_at)
select n.id, n.case_id, n.author_id, n.content, 'user', n.created_at
from public.notes n
where n.content is not null and btrim(n.content) <> ''
  and n.case_id is not null
  and exists (select 1 from public.cases c where c.id = n.case_id)
on conflict (id) do nothing;

alter table public.case_comments enable trigger case_comment_ai_trg;

-- تجميد نسخة اطمئنان — كعادتنا، لا حذف
alter table public.notes rename to notes_legacy;
comment on table public.notes_legacy is
  '⚠️ مجمّد منذ 2026-08-21 — الملاحظات هاجرت إلى case_comments (نقاش القضية). يُحذف بعد فترة اطمئنان.';
revoke insert, update, delete on public.notes_legacy from authenticated, anon;

commit;
