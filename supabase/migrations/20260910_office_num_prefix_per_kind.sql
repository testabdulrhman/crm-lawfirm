-- رقم المكتب برمز لكل نوع مشروع (طلب المستخدم 2026-09-10):
-- «القضايا لها رمز، وقضايا الإفلاس رمز، وكذلك الاستشارات».
--
-- كانت generate_office_num تعطي CASE{YY}NNN للجميع بلا نظر إلى kind. الآن الرمز
-- يُقرأ من lookup_values (type = office_num_prefix, label = kind) فيُعدَّل بلا
-- نشر، والتسلسل مستقل لكل رمز وسنة. الأرقام القائمة لا تُمَسّ — قد تكون على
-- مستندات وعروض أسعار بأيدي العملاء (الاستشارات السبع والتوثيقات الثلاث
-- تبقى بأرقام CASE القديمة).
-- ⚠️ قفل استشاري على (الرمز+السنة): الدالة القديمة كانت عرضة لتكرار الرقم
--    عند إدخالين متزامنين.
--
-- الرموز الأولية: case=CASE · bankruptcy=BNK · legal_service=CNS · property=PRP
-- (تُغيَّر بتعديل value في lookup_values).

insert into public.lookup_values (type, label, value, sort_order)
values
  ('office_num_prefix', 'case',          'CASE', 1),
  ('office_num_prefix', 'bankruptcy',    'BNK',  2),
  ('office_num_prefix', 'legal_service', 'CNS',  3),
  ('office_num_prefix', 'property',      'PRP',  4)
on conflict (type, label) do nothing;

create or replace function public.generate_office_num()
returns trigger language plpgsql set search_path = public as $$
declare
  yr      text := to_char(now(), 'YY');
  prefix  text;
  max_seq int;
begin
  if new.office_num is not null and new.office_num <> '' then
    return new;
  end if;

  select value into prefix from lookup_values
   where type = 'office_num_prefix' and label = coalesce(new.kind, 'case');
  prefix := coalesce(nullif(upper(trim(prefix)), ''), 'CASE');

  perform pg_advisory_xact_lock(hashtext('office_num:' || prefix || yr));

  select coalesce(max(nullif(regexp_replace(office_num, '^' || prefix || yr, ''), '')::int), 0)
    into max_seq
    from cases
   where office_num ~ ('^' || prefix || yr || '[0-9]+$');

  new.office_num := prefix || yr || lpad((max_seq + 1)::text, 3, '0');
  return new;
end $$;

-- جُرّب داخل معاملة ثم تُرجع: قضية=CASE26099 · إفلاس=BNK26001 ثم BNK26002 ·
-- استشارة=CNS26001 · توثيق=PRP26001.
