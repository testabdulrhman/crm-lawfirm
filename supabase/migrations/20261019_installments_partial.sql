-- السداد الجزئي كان يُغلق الدفعة (فحص 2026-10-19): وجود paid_at وحده = «سُدّدت» مهما كان المقبوض، فتسكت
-- التذكيرات ويختفي الباقي من المتأخرات. الآن الدفعة مفتوحة حتى يبلغ المقبوض قيمتها (المبلغ أو نسبتها من الأتعاب).
create or replace function public.installment_open(i engagement_installments, fees numeric)
 returns boolean language sql immutable
as $$
  -- paid_at بلا مبلغ (سجل قديم) يُعدّ سداداً كاملاً
  select i.paid_at is null
      or (i.paid_amount is not null
          and i.paid_amount + 0.5 < coalesce(i.amount, round(i.percent / 100.0 * fees), 0))
$$;

create or replace function public.remind_installments()
 returns integer language plpgsql security definer set search_path to 'public'
as $function$
declare r record; n int := 0; v_due numeric;
begin
  for r in
    select i.*, e.engagement_number, e.title, e.fees_total
      from engagement_installments i join engagements e on e.id = i.engagement_id
     where e.deleted_at is null and e.status not in ('cancelled', 'expired')
       and public.installment_open(i, e.fees_total)
       and ((i.trigger = 'date' and i.due_date <= current_date)
            or (i.trigger = 'event' and i.event_reached_at is not null and i.event_reached_at <= current_date - 3))
       and (i.notified_at is null or i.notified_at < now() - interval '7 days')
  loop
    v_due := coalesce(r.amount, round(r.percent / 100.0 * r.fees_total)) - coalesce(r.paid_amount, 0);
    insert into notifications (type, title, message, recipient_id)
    select 'installment_due',
           '💰 دفعة مستحقة — ' || coalesce(r.engagement_number, 'عقد'),
           coalesce(r.title, '') || ' · ' || r.label
             || coalesce(' · ' || case when r.paid_amount > 0 then 'المتبقي ' else '' end || round(v_due)::text || ' ريال', ''),
           tm.id
      from team_members tm where tm.is_director and tm.is_active;
    update engagement_installments set notified_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $function$;

create or replace function public.installments_on_ruling()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare r record;
begin
  if coalesce(new.is_dropped, false) then return new; end if;
  for r in
    update engagement_installments i set event_reached_at = coalesce(new.ruling_date, current_date)
      from cases c, engagements e
     where c.id = new.case_id and c.engagement_id = i.engagement_id and e.id = i.engagement_id
       and i.trigger = 'event' and i.event_kind = 'first_ruling' and i.event_reached_at is null
       and public.installment_open(i, e.fees_total)
    returning i.id, i.label, i.amount, c.id as case_id, c.office_num
  loop
    insert into notifications (type, title, message, recipient_id, case_id)
    select 'installment_due', '💰 استحقت دفعة — ' || coalesce(r.office_num, ''),
           r.label || coalesce(' · ' || r.amount::text || ' ريال', '') || ' — صدر الحكم',
           tm.id, r.case_id
      from team_members tm where tm.is_director and tm.is_active;
  end loop;
  return new;
exception when others then
  return new;
end $function$;
