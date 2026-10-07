-- دمج عميلين مكرّرين «شركة أركن الخليج للمقاولات» (طلب المدير 2026-10-07: «عندي اثنين اركن الخليج، وكل وحده
-- لها قضايا مرتبطة فيها، ودي ادمجهم»). يبقى المسجّل يدوياً (منشأة، بسجلّها ومدينتها، ٢٣ قضية)، ويُنقل إليه كل ما
-- على المستورد (فرد بلا بيانات، ٧ قضايا) في كل جدول يشير لعميل، ثم يُحذف المكرّر (ويُبلَّغ الـHub بترقره).
do $$
declare
  keep uuid := 'ab3fedb0-5456-4e4f-8142-def112aa2831';
  dup  uuid := 'affa9682-e953-4e2f-8476-6eca64a3a0a8';
  r record;
begin
  if not exists (select 1 from contacts where id = keep) or not exists (select 1 from contacts where id = dup) then
    raise notice 'merge: أحد الطرفين غير موجود — لا شيء';
    return;
  end if;
  for r in
    select c.table_name, c.column_name from information_schema.columns c
      join information_schema.tables t on t.table_schema = c.table_schema and t.table_name = c.table_name
     where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.data_type = 'uuid'
       and c.column_name in ('contact_id', 'client_id', 'seller_id', 'buyer_id')
       and c.table_name not in ('contacts_callers_archive')
  loop
    execute format('update public.%I set %I = $1 where %I = $2', r.table_name, r.column_name, r.column_name)
      using keep, dup;
  end loop;
  -- ما في المكرّر ولا يوجد في الباقي يُستكمل (لا يُكتب فوق قيمة قائمة)
  update contacts k set
    phone = coalesce(k.phone, d.phone), phone2 = coalesce(k.phone2, d.phone2), email = coalesce(k.email, d.email),
    city = coalesce(k.city, d.city), id_number = coalesce(k.id_number, d.id_number),
    notes = coalesce(k.notes, d.notes), nationality = coalesce(k.nationality, d.nationality)
  from contacts d where k.id = keep and d.id = dup;
  delete from contacts where id = dup;
end $$;
