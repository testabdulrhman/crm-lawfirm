-- نطاق موظف بعينه لأدوات الذكاء (فحص 2026-10-19): أدوات المساعد وذكاء النقاش كانت تعمل بمفتاح الخادم بلا نطاق،
-- فيطلب الموظف — أو المتعاون الخارجي في نقاش ملفه — تفاصيل ملف لا يراه أو نصوص محادثات خاصة فتُعطى له.
-- ذكاء النقاش لا يحمل جلسة الكاتب (يُنادى من مشغّل) فنحسب نطاقه هنا بنفس دوال RLS، بانتحال هويته داخل النداء.
-- للخادم وحده.
create or replace function public.member_case_scope(p_member uuid)
 returns jsonb language plpgsql volatile security definer set search_path to 'public'
as $$
declare v_auth uuid;
begin
  select auth_id into v_auth from team_members where id = p_member and coalesce(is_active, true);
  if v_auth is null then return jsonb_build_object('ok', false); end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_auth::text, true);
  return jsonb_build_object(
    'ok', true,
    'member_id', p_member,
    'director', public.is_director_caller(),
    'viewer', public.is_office_viewer_caller(),
    'collaborator', public.is_collaborator_caller(),
    'reviewer', public.is_reviewer_caller(),
    'case_ids', to_jsonb(public.my_accessible_case_ids()),
    'blocked_dm', to_jsonb(public.my_blocked_dm_ids()),
    'blocked_channels', case when public.is_director_caller() then '[]'::jsonb
                             else to_jsonb(public.my_blocked_channel_ids()) end
  );
end $$;
revoke all on function public.member_case_scope(uuid) from public, anon, authenticated;
grant execute on function public.member_case_scope(uuid) to service_role;
