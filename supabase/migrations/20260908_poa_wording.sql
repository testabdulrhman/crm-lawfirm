-- «ما فيه وكالة تُجدَّد — تُصدر وكالة جديدة» (تصحيح المستخدم 2026-09-08).
--
-- كان النظام يطلب من الموظف «تجديد الوكالة» — وهو إجراء لا وجود له نظاماً.
-- الصحيح: تنتهي الوكالة، وتُستخرج **وكالة جديدة** بدلاً منها.
--
-- صُحّح: عنوان المهمة المشتقّة ونصّها، وسبع مهام مفتوحة بأثر رجعي، ووسم
-- المهلة في الويب (`DEADLINE_SOURCE_LABEL.poa`)، والتعليقات الحاملة للمفهوم.
--
-- ⚠️ **اسم العرض `poas_needing_renewal` لم يُغيَّر عمداً**: تطبيق iOS المنشور
--    (1.0.8 فما فوق) يستعلم به بالاسم، وتغييره يكسر التطبيقات في أيدي
--    الموظفين حتى تُعتمد نسخة جديدة. الاسم داخليّ لا يراه مستخدم.

create or replace function public.derive_poa_renewal_tasks()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, poa_number, client_name, case_id, expiry_date
    from powers_of_attorney
    where deleted_at is null
      and status = 'active'
      and expiry_date between current_date
          and current_date + derivation_cfg('poa_renew_days_before', 30)
      and (case_id is null or not public.matter_is_closed(case_id))
  loop
    perform spawn_derived_task(
      'poa:' || r.id || ':renew',
      r.case_id,
      'استخراج وكالة جديدة — ' || coalesce(r.client_name, 'موكّل') ||
        coalesce(' (بدل ' || nullif(r.poa_number, '') || ')', ''),
      greatest(current_date, r.expiry_date - 7),
      'مشتقة تلقائياً: الوكالة تنتهي في ' || r.expiry_date::text ||
        '. الوكالة لا تُجدَّد — تُستخرج وكالة جديدة، وانقضاؤها بلا بديل ' ||
        'يعطّل التمثيل أمام المحكمة.'
    );
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.derive_poa_renewal_tasks() from anon, authenticated;

-- update tasks set title = replace(title, 'تجديد الوكالة — ', 'استخراج وكالة جديدة — ')
--  where deleted_at is null and derived_key like 'poa:%' and title like 'تجديد الوكالة%';
-- (نُفِّذ مرة عند التصحيح فأصاب ٧ مهام مفتوحة.)
