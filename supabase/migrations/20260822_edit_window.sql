-- مهلة التعديل والحذف (طلب المستخدم 2026-08-22: «ودي الشخص بعد ساعة
-- ما يقدر يعدل أو يحذف»)
--
-- الفرض في القاعدة لا في الواجهة — trigger برسالة خطأ عربية واضحة بدل
-- تشديد RLS الذي يفشل صامتاً (تحديث ٠ صف بلا خطأ في PostgREST).
-- service role (دوال الذكاء/الصيانة) معفى: auth.uid() لديه فارغ.

begin;

create or replace function public.enforce_edit_window() returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and (new.body is distinct from old.body
          or (new.deleted_at is not null and old.deleted_at is null))
     and old.created_at < now() - interval '1 hour' then
    raise exception 'انقضت مهلة التعديل والحذف — ساعة واحدة من إرسال الرسالة';
  end if;
  return new;
end; $$;

drop trigger if exists case_comment_edit_window_trg on public.case_comments;
create trigger case_comment_edit_window_trg
  before update on public.case_comments
  for each row execute function public.enforce_edit_window();

commit;
