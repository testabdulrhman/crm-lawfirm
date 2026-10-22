-- الموعد بلا مسؤول يُسند للمدير (طلب المدير 2026-10-22: «حطها كلها لعبدالرحمن المشيقح»).
-- حجوزات الموقع تصل بلا موظف، فكانت تظهر على شاشة المكتب «لم يُسند». يُملأ الحقل عند الإدراج فقط
-- وإن كان فارغاً؛ من يُسند الموعد لغيره لاحقاً أو عند الإنشاء لا يتأثر. ولا رسائل ولا إشعارات.
-- (أُسندت المواعيد الـ36 القائمة يدوياً في اليوم نفسه.)
create or replace function public.appointments_default_assignee()
 returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.assignee_id is null then
    select id into new.assignee_id
      from team_members
     where is_director and coalesce(is_active, true)
     order by created_at
     limit 1;
  end if;
  return new;
end $$;
revoke all on function public.appointments_default_assignee() from public, anon, authenticated;

drop trigger if exists appointments_default_assignee_trg on public.appointments;
create trigger appointments_default_assignee_trg before insert on public.appointments
  for each row execute function public.appointments_default_assignee();
