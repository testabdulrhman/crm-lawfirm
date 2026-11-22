-- بلاغ المدير 2026-11-22: «ليه الموظفين والمتقدمين تطلع للكل؟» — طلبات التوظيف (السير والجوالات والمعدلات
-- وتحليل الذكاء) كانت مقروءة لكل موظف (authenticated_all = true). قراره: المدير وراكان (is_office_viewer_caller:
-- is_director أو can_view_all) وحدهما. نموذج التقديم العام (anon insert) ودوال الخادم (service_role) لا تتأثر.
-- البحث الشامل وتوقيع الروابط (visible_stored_urls) وأداة المساعد تعمل بصلاحية الموظف، فتُحجب معها تلقائياً.

drop policy if exists applications_viewers_only on public.staff_applications;
create policy applications_viewers_only on public.staff_applications as restrictive for all to authenticated
  using ((select public.is_office_viewer_caller())) with check ((select public.is_office_viewer_caller()));

drop policy if exists analysis_viewers_only on public.staff_application_analysis;
create policy analysis_viewers_only on public.staff_application_analysis as restrictive for all to authenticated
  using ((select public.is_office_viewer_caller())) with check ((select public.is_office_viewer_caller()));
