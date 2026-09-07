-- إصلاح عاجل: «تعذّر تحديث المذكرة — record "old" has no field "deleted_at"»
--
-- السبب: في المرحلة ٢ من مصفوفة الصلاحيات (ترحيل 20260904_perm_stage2_matrix)
-- رُبط `guard_soft_delete` بأربعة عشر جدولاً، ومنها **memos وهو بلا عمود
-- `deleted_at`** — حذف المذكرة حقيقي لا ناعم. فكان الترقر يشير إلى حقل غير
-- موجود، وهذا في plpgsql **خطأ تنفيذ يكسر الكتابة كلها** لا شرط يُقيَّم.
-- النتيجة: كل تعديل مذكرة يفشل من 2026-09-04 إلى 2026-09-07.
--
-- حذف المذكرات محفوظ أصلاً بسياسة `perm_delete_director` (DELETE للمدير)،
-- فالترقر هناك زائد ومكسور معاً.
drop trigger if exists guard_soft_delete_trg on public.memos;

-- وتحصين الدالة كي لا تتكرر العلّة إن رُبطت مستقبلاً بجدول بلا حذف ناعم.
create or replace function public.guard_soft_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := to_jsonb(old);
  n jsonb := to_jsonb(new);
begin
  if not (o ? 'deleted_at') then return new; end if;
  if public.is_director_caller() then return new; end if;
  if (o ->> 'deleted_at') is null and (n ->> 'deleted_at') is not null then
    raise exception 'الحذف للمدير فقط';
  end if;
  return new;
end $$;
