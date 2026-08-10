-- ============================================================================
-- إغلاق ثلاث ثغرات كشفتها المراجعة الشاملة — طُبّقت على الإنتاج 2026-08-10
--
-- ⚠️ الدرس الجامع: في Supabase لا يكفي `revoke ... from public`.
--    المنصّة تمنح EXECUTE/SELECT صراحةً لدورَي anon و authenticated،
--    فيبقيان قادرَين رغم الإلغاء. يجب تسمية الدورين.
-- ============================================================================

-- (1) الأرقام المرجعية: كان أي زائر يستهلكها عبر /rest/v1/rpc بلا حجز
revoke execute on function public.next_booking_reference() from anon, authenticated, public;
grant  execute on function public.next_booking_reference() to service_role;

-- (2) تسريب: دوال التذكيرات SECURITY DEFINER كانت مفتوحة للزوار، فتُرجع
--     عناوين القضايا ومواعيد الجلسات وأسماء الموظفين وجوالاتهم.
revoke execute on function public.sessions_day_reminders()      from anon, authenticated, public;
revoke execute on function public.sessions_30min_reminders()    from anon, authenticated, public;
revoke execute on function public.sessions_tomorrow_reminders() from anon, authenticated, public;
grant  execute on function public.sessions_day_reminders()      to service_role;
grant  execute on function public.sessions_30min_reminders()    to service_role;
grant  execute on function public.sessions_tomorrow_reminders() to service_role;

revoke execute on function public.current_tm_id()   from anon, public;
revoke execute on function public.current_tm_name() from anon, public;
revoke execute on function public.is_director()     from anon, public;

-- (3) تسريب: عرضان موروثان SECURITY DEFINER (يتجاوزان RLS) مكشوفان للزوار،
--     يُرجعان 211 قضية بأسماء الموكّلين وجوالاتهم وأتعابهم.
--     لا يستخدمهما التطبيق إطلاقاً (فُحص المصدر كاملاً).
revoke all on public.v_cases_summary from anon, public;
revoke all on public.v_fees_report  from anon, public;
alter view public.v_cases_summary set (security_invoker = on);
alter view public.v_fees_report  set (security_invoker = on);
grant select on public.v_cases_summary to authenticated;
grant select on public.v_fees_report  to authenticated;

-- (4) قيدان مكرّران حرفياً — التفرّد يبقى محروساً بالقيد الآخر
alter table public.cases              drop constraint if exists cases_office_num_unique;
alter table public.powers_of_attorney drop constraint if exists poa_number_unique;

-- ============================================================================
-- التراجع: أعِد المنح للأدوار المذكورة (لا يُنصح — يعيد فتح التسريب)
-- ============================================================================
