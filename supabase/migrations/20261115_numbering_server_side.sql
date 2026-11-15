-- المراجعة الشاملة 2026-11-15، الدفعة الثالثة: الترقيم من الخادم لا من المتصفح.

-- (١) رقم عرض السعر: كان يُقرأ عند فتح النافذة ويُكتب بعد الإصدار، فنافذتان تعطيان عميلين الرقم نفسه.
create or replace function public.issue_quote_number(p_year int)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_next int;
begin
  if public.my_member_id() is null then
    raise exception 'لموظف نشط فقط';
  end if;
  perform pg_advisory_xact_lock(hashtext('quote_counter:' || p_year));
  select id, coalesce(nullif(value, '')::int, 0) + 1 into v_id, v_next
    from lookup_values where type = 'quote_counter' and label = p_year::text
    order by created_at limit 1;
  if v_id is null then
    v_next := 1;
    insert into lookup_values (type, label, value) values ('quote_counter', p_year::text, '1');
  else
    update lookup_values set value = v_next::text where id = v_id;
  end if;
  return v_next;
end $$;

revoke all on function public.issue_quote_number(int) from public, anon;
grant execute on function public.issue_quote_number(int) to authenticated;

-- (٢) رقم العقد: engagement_number_trg يرقّم بقفل حين يصل الرقم فارغاً — والنموذجان صارا يتركانه له.
--     وقيد يمنع رقمين متطابقين نهائياً.
create unique index if not exists engagements_number_uniq on public.engagements (engagement_number)
  where engagement_number is not null and deleted_at is null;
