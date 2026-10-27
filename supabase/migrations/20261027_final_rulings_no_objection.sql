-- الحكم القطعي بنصّه لا مهلة اعتراض له ولا مهمة (طلب المدير 2026-10-27: «نعم» على اقتراح منع مهمة الاعتراض
-- للحكم «المكتسب للقطعية» — مثل حكم 4830213467 في CASE26056: مطالبة دون خمسين ألفاً فلا تقبل الاستئناف).
-- يُعرف من نص المنطوق أو الملخّص؛ والعليا كانت تُستثنى أصلاً من مهلة الاعتراض في rulings_prepare.

create or replace function public.ruling_is_final(p_result text, p_summary text)
 returns boolean language sql immutable
as $$
  select coalesce(p_result, '') || ' ' || coalesce(p_summary, '') ~
    '(مكتسب[اًا]*|اكتسب|واكتسب)\s+(لل|ال)قطعي[ةه]|حكم[اًا]*\s+قطعي|غير\s+قابل[ةه]?\s+لل(استئناف|اعتراض|طعن)|لا\s+يقبل\s+(الاستئناف|الاعتراض|الطعن)'
$$;

-- ١) لا «مهلة اعتراض» معروضة للحكم القطعي
create or replace function public.rulings_prepare()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.ruling_number is not null then
    new.ruling_number := translate(new.ruling_number, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  end if;
  new.objection_until := case
    when new.ruling_date is null or coalesce(new.court_name, '') ~ 'العليا'
      or public.ruling_is_final(new.result, new.summary) then null
    else new.ruling_date + derivation_cfg('objection_days', 30)
  end;
  if tg_op = 'UPDATE' and new.result is distinct from old.result
     and new.outcome_short is not distinct from old.outcome_short then
    new.outcome_short := null;
  end if;
  return new;
end $function$;

-- ٢) لا مهمة اعتراض للحكم القطعي — ويُحكى ذلك في قصة الملف
create or replace function public.derive_ruling_tasks()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_deadline date; v_due date; v_days int;
begin
  if new.case_id is not null then
    perform log_matter_event(new.case_id, 'ruling',
      'سُجّل حكم' || coalesce(' رقم ' || nullif(new.ruling_number,''), '') ||
        coalesce(' — نُطق ' || to_char(new.ruling_date,'DD/MM/YYYY'), ' — بلا تاريخ نطق مسجّل'),
      jsonb_build_object('ruling_id', new.id), false, 'ruling:' || new.id || ':reg');
  end if;

  if new.is_dropped is true then return new; end if;
  if new.ruling_date is null then return new; end if;

  if public.ruling_is_final(new.result, new.summary) then
    if new.case_id is not null then
      perform log_matter_event(new.case_id, 'deadline',
        'الحكم قطعي بنصّه — لا مهلة اعتراض ولا مهمة له',
        jsonb_build_object('ruling_id', new.id), false, 'ruling:' || new.id || ':final');
    end if;
    return new;
  end if;

  v_days := derivation_cfg('objection_days', 30);
  v_deadline := new.ruling_date + v_days;
  if v_deadline < public.riyadh_today() then return new; end if;

  perform log_matter_event(new.case_id, 'deadline',
    'حسبتُ مهلة الاعتراض: ' || v_days || ' يوماً — آخر يوم ' || to_char(v_deadline,'DD/MM/YYYY') ||
      '. وسأنبّه قبلها بـ 14 و7 و3 ويوم',
    jsonb_build_object('ruling_id', new.id, 'deadline', v_deadline),
    true, 'ruling:' || new.id || ':deadline');

  v_due := greatest(public.riyadh_today(), v_deadline - derivation_cfg('objection_margin_days', 5));
  perform spawn_derived_task(
    'ruling:' || new.id || ':objection', new.case_id,
    'دراسة الحكم وإعداد الاعتراض إن لزم' ||
      coalesce(' — حكم رقم ' || nullif(new.ruling_number, ''), ''),
    v_due,
    'مشتقة تلقائياً من تسجيل الحكم. ⚠️ مهلة الاعتراض تنتهي ' || v_deadline::text ||
      ' — فواتها سقوط حق لا تأخير.');
  return new;
end;
$function$;

-- ٣) حكم صار قطعياً بعد تعديل نصه ⇒ تُقفل مهمة اعتراضه المفتوحة
create or replace function public.close_objection_if_final()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare n int;
begin
  if public.ruling_is_final(new.result, new.summary) and not public.ruling_is_final(old.result, old.summary) then
    update tasks
       set status = 'done', done_at = now(),
           notes = coalesce(notes || E'\n\n', '') || '⚙️ أُقفلت آلياً: الحكم قطعي بنصّه فلا اعتراض عليه.'
     where derived_key = 'ruling:' || new.id || ':objection' and status <> 'done' and deleted_at is null;
    get diagnostics n = row_count;
    if n > 0 and new.case_id is not null then
      perform log_matter_event(new.case_id, 'task',
        'أقفلتُ مهمة الاعتراض — الحكم قطعي بنصّه',
        jsonb_build_object('ruling_id', new.id), false, 'ruling:' || new.id || ':final-close');
    end if;
  end if;
  return new;
end $function$;

drop trigger if exists close_objection_if_final_trg on public.rulings;
create trigger close_objection_if_final_trg after update of result, summary on public.rulings
  for each row execute function public.close_objection_if_final();
