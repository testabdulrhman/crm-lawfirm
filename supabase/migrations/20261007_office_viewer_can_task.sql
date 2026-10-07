-- راكان (المساعد الإداري — can_view_all) يُنشئ المهام على أي ملف ويتابعها (بلاغه 2026-10-07: «إذا جيت اعمل
-- مهمة يرفض» — «تعذّر حفظ المهمة … [42501]» ثلاث مرات في ملفات ليست مسندة له).
-- مثل النقاشات (20261007_office_viewer_can_discuss): من يطّلع على المهام ينشئها ويحدّثها (الحالة، التعديل، الإغلاق).
-- والحذف يبقى للمدير (perm_delete_director). جداول المهام الفرعية مفتوحة أصلاً (authenticated_all).

drop policy if exists perm_case_scope_ins on public.tasks;
create policy perm_case_scope_ins on public.tasks as restrictive for insert to public
  with check ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])));

drop policy if exists perm_case_scope_upd on public.tasks;
create policy perm_case_scope_upd on public.tasks as restrictive for update to public
  using ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])))
  with check ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])));
