-- عيد الميلاد بهدوء (طلب المدير 2026-09-26، قبل يوم ميلاده):
-- • لا منشور نظام في قناة «عام — المكتب» («هذي لا تسويها، شلها»).
-- • لا إشعار للفريق — يحلّ محله بنر في واجهة التطبيق والموقع («خله كأنه بنر يطلع في واجهة
--   التطبيق أو الموقع»): BirthdayCard في لوحة الويب، وبطاقة في رئيسية الآيفون.
-- • يبقى إشعار صاحب اليوم وحده.
create or replace function public.celebrate_birthdays()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_today date := (now() at time zone 'Asia/Riyadh')::date;
  m record;
begin
  for m in
    select id, auth_id, phone
    from team_members
    where is_active
      and date_of_birth is not null
      and to_char(date_of_birth, 'MM-DD') = to_char(v_today, 'MM-DD')
  loop
    -- احتفال واحد في السنة مهما أعيد تشغيل المهمة
    begin
      insert into birthday_celebrations (member_id, year)
      values (m.id, extract(year from v_today)::int);
    exception when unique_violation then
      continue;
    end;

    -- تهنئة صاحب اليوم وحده (حساب المراجعة بلا جوال فيسقط بالشرط)
    if m.auth_id is not null and m.phone is not null then
      insert into notifications (type, title, message, recipient_id)
      values ('birthday', '🎂 كل عام وأنتم بخير!', 'فريق المكتب يهنئكم بعيد ميلادكم — يوم سعيد!', m.id);
    end if;
  end loop;
end;
$function$;

revoke all on function public.celebrate_birthdays() from public, anon, authenticated;
