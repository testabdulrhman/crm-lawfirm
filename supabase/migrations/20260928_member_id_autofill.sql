-- رقم الهوية وتاريخ الميلاد من مرفق «الهوية الوطنية» تلقائياً (طلب المدير 2026-09-28).
--
-- الرفع من الويب أو الآيفون يُدرج صفاً في member_documents، فيستدعي الترقر دالة
-- member-doc-extract التي تقرأ البطاقة وتملأ الفارغ وحده وتُبلغ المدير بأي تعارض.
-- الرابط والسرّ في app_secrets (مغلق أمام anon/authenticated) لا في المستودع:
--   MEMBER_DOC_FN_URL · MEMBER_DOC_SECRET

-- (١) حارس حقول الموظف: رقم الهوية للمدير وحده — ويُضاف الخادم (service_role) الذي لا يُنادى
--     إلا من دوال الخادم؛ فالدالة تكتب ما قرأته من البطاقة بعد تحققها.
create or replace function public.tm_guard_privilege_fields()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if public.is_director_caller() or coalesce(auth.role(), '') = 'service_role' then return new; end if;
  if new.is_director  is distinct from old.is_director
     or new.is_reviewer is distinct from old.is_reviewer
     or new.is_active   is distinct from old.is_active
     or new.auth_id     is distinct from old.auth_id
     or new.member_type is distinct from old.member_type then
    raise exception 'تغيير الصلاحيات أو حالة الحساب للمدير وحده';
  end if;
  if new.join_date is distinct from old.join_date
     or new.name      is distinct from old.name
     or new.role      is distinct from old.role
     or new.email     is distinct from old.email
     or new.id_number is distinct from old.id_number then
    raise exception 'الاسم والمسمّى والبريد ورقم الهوية وتاريخ التعيين يعدّلها المدير';
  end if;
  return new;
end $function$;

revoke execute on function public.tm_guard_privilege_fields() from public, anon, authenticated;

-- (٢) الترقر: هوية رُفعت ⇒ اقرأها
create or replace function public.member_doc_autofill_dispatch()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  fn_url text;
  secret text;
begin
  if new.doc_type is distinct from 'national_id' then return new; end if;
  select value into fn_url from public.app_secrets where key = 'MEMBER_DOC_FN_URL';
  select value into secret from public.app_secrets where key = 'MEMBER_DOC_SECRET';
  if fn_url is null or secret is null then return new; end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-doc-secret', secret),
    body    := jsonb_build_object('document_id', new.id),
    timeout_milliseconds := 60000
  );
  return new;
exception when others then
  return new; -- القراءة ثانوية — لا تمنع حفظ المرفق
end $function$;

revoke all on function public.member_doc_autofill_dispatch() from public, anon, authenticated;

drop trigger if exists member_doc_autofill_trg on public.member_documents;
create trigger member_doc_autofill_trg
  after insert on public.member_documents
  for each row execute function public.member_doc_autofill_dispatch();
