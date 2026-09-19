-- سرعة النظام كله (طلب المدير 2026-09-19): تعميم ما طُبّق على رسائل النقاش (20260919_fast_case_comments_rls)
-- على كل سياسة تستدعي فحصاً لكل صف. ثلاثة تحويلات آلية ثابتة على نص السياسة الحالي:
--   ١) دوال «من المنادي» (مدير/مراجع/متعاون) ← (select fn()) فتُقيَّم مرة لكل سؤال لا لكل صف.
--   ٢) can_access_case(col) ← col فارغ أو مدير أو col ضمن مصفوفة ملفاتي (تُحسب مرة).
--   ٣) can_access_thread(col) ← col فارغ أو مدير أو col ليس ضمن القنوات المحجوبة عني (تُحسب مرة).
-- التحقق قبل التطبيق (معاملة ملغاة، ست هويات: مدير وأربعة موظفين وحساب المراجعة):
--   125 سياسة / 55 جدولاً — الصفوف المرئية في كل جدول متطابقة حرفياً (md5)، ولوحة التحكم تُخرج
--   الناتج نفسه. الزمن: المدير 135ms→11ms، الموظف ~245ms→~50ms، المراجعة 729ms→127ms.
-- لا يُمس case_comments (سبق). وفي error_logs يبقى can_access_case((url)::uuid) كما هو (تعبير مركّب نادر الاستدعاء).
-- ⚠️ غير قابل لإعادة التشغيل: إعادته تلفّ (select fn()) مرة ثانية — لا ضرر لكن بلا فائدة.
do $migrate$
declare rec record; u text; w text; sqlx text;
begin
  for rec in
    select c.relname::text as t, pol.polname::text as n,
           pg_get_expr(pol.polqual, pol.polrelid) as uq, pg_get_expr(pol.polwithcheck, pol.polrelid) as wq
    from pg_policy pol join pg_class c on c.oid = pol.polrelid
    where c.relnamespace = 'public'::regnamespace and c.relname <> 'case_comments'
      and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''))
          ~ '(can_access_case|can_access_thread|is_collaborator_caller|is_reviewer_caller|is_director_caller|current_is_director)\('
  loop
    u := rec.uq; w := rec.wq;
    u := regexp_replace(u, '(is_collaborator_caller|is_reviewer_caller|is_director_caller|current_is_director)\(\)', '(select public.\1())', 'g');
    w := regexp_replace(w, '(is_collaborator_caller|is_reviewer_caller|is_director_caller|current_is_director)\(\)', '(select public.\1())', 'g');
    u := regexp_replace(u, 'can_access_case\(([a-z_]+)\)', '(\1 IS NULL OR (select public.is_director_caller()) OR \1 = ANY ((select public.my_accessible_case_ids())::uuid[]))', 'g');
    w := regexp_replace(w, 'can_access_case\(([a-z_]+)\)', '(\1 IS NULL OR (select public.is_director_caller()) OR \1 = ANY ((select public.my_accessible_case_ids())::uuid[]))', 'g');
    u := regexp_replace(u, 'can_access_thread\(([a-z_]+)\)', '(\1 IS NULL OR (select public.current_is_director()) OR NOT (\1 = ANY ((select public.my_blocked_channel_ids())::uuid[])))', 'g');
    w := regexp_replace(w, 'can_access_thread\(([a-z_]+)\)', '(\1 IS NULL OR (select public.current_is_director()) OR NOT (\1 = ANY ((select public.my_blocked_channel_ids())::uuid[])))', 'g');
    sqlx := format('alter policy %I on public.%I', rec.n, rec.t);
    if u is not null then sqlx := sqlx || format(' using (%s)', u); end if;
    if w is not null then sqlx := sqlx || format(' with check (%s)', w); end if;
    execute sqlx;
  end loop;
end $migrate$;
