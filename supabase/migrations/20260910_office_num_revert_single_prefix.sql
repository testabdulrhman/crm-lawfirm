-- تراجع عن 20260910_office_num_prefix_per_kind (سوء فهم: «رمز» كان يقصد
-- إيموجي لا بادئة ترقيم — «خل الأرقام مثل ما كانت»). رمز واحد CASE للجميع.
-- يبقى القفل الاستشاري فقط: لا يغيّر الأرقام، يمنع تكرارها عند إدخالين متزامنين.
delete from public.lookup_values where type = 'office_num_prefix';

create or replace function public.generate_office_num()
returns trigger language plpgsql set search_path = public as $$
declare
  yr      text := to_char(now(), 'YY');
  max_seq int;
begin
  if new.office_num is not null and new.office_num <> '' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('office_num:CASE' || yr));
  select coalesce(max(nullif(regexp_replace(office_num, '^CASE' || yr, ''), '')::int), 0)
    into max_seq
    from cases
   where office_num ~ ('^CASE' || yr || '[0-9]+$');
  new.office_num := 'CASE' || yr || lpad((max_seq + 1)::text, 3, '0');
  return new;
end $$;
