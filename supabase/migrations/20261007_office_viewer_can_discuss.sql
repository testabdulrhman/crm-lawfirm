-- راكان (المساعد الإداري — can_view_all) يرى كل النقاشات منذ 20261006_office_viewer، لكنه لا يكتب فيها:
-- «new row violates row-level security policy perm_case_scope_ins for table case_comments» (بلاغه 2026-10-07).
-- القراءة كانت is_office_viewer_caller والكتابة is_director_caller. فمن يطّلع على النقاش يشارك فيه:
--   case_comments: الإضافة والتعديل (وسياسة case_comments_update_own تُبقي التعديل لصاحب الرسالة وحده)
--   case_reads:    تعليم القراءة (وإلا تبقى شارات غير المقروء عالقة)
--   documents:     إضافة مرفق في النقاش — بلا تعديل ولا حذف لمستندات غيره (يبقيان للمدير ومن له الملف)
-- القنوات الخاصة والمحادثات المباشرة تبقى بحواجزها (channel_comments_insert_gate / dm_comments_gate).

drop policy if exists perm_case_scope_ins on public.case_comments;
create policy perm_case_scope_ins on public.case_comments as restrictive for insert to public
  with check ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])));

drop policy if exists perm_case_scope_upd on public.case_comments;
create policy perm_case_scope_upd on public.case_comments as restrictive for update to public
  using ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])))
  with check ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])));

drop policy if exists perm_case_scope_ins on public.case_reads;
create policy perm_case_scope_ins on public.case_reads as restrictive for insert to public
  with check ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])));

drop policy if exists perm_case_scope_upd on public.case_reads;
create policy perm_case_scope_upd on public.case_reads as restrictive for update to public
  using ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])))
  with check ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])));

drop policy if exists perm_case_scope_ins on public.documents;
create policy perm_case_scope_ins on public.documents as restrictive for insert to public
  with check ((case_id is null) or (select is_office_viewer_caller()) or (case_id = any ((select my_accessible_case_ids())::uuid[])));
