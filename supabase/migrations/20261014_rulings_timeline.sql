-- تبويب الأحكام خطاً زمنياً (قرار المدير 2026-10-14، النموذج المعتمد «نفّذ النموذج كما هو مع الشارة»):
--   outcome_short   شارة النتيجة («نقض جزئي وتشديد»، «إدانة جزئية»…) — يكتبها الذكاء من المنطوق
--                   (ai-assistant task=ruling_outcomes) وتُفرَّغ إذا تغيّر المنطوق فتُعاد كتابتها
--   objection_until آخر يوم للاعتراض = تاريخ الحكم + مدة الاعتراض (task_derivation_config/objection_days، ٣٠)
--                   — لا مهلة لحكم المحكمة العليا
-- وأرقام الأحكام بالأرقام اللاتينية: ١٣ من ٣٠ حُفظت هندية من قراءة الصكوك.

alter table public.rulings
  add column if not exists outcome_short text,
  add column if not exists objection_until date;

create or replace function public.rulings_prepare()
 returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.ruling_number is not null then
    new.ruling_number := translate(new.ruling_number, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  end if;
  new.objection_until := case
    when new.ruling_date is null or coalesce(new.court_name, '') ~ 'العليا' then null
    else new.ruling_date + derivation_cfg('objection_days', 30)
  end;
  if tg_op = 'UPDATE' and new.result is distinct from old.result
     and new.outcome_short is not distinct from old.outcome_short then
    new.outcome_short := null;
  end if;
  return new;
end $$;
revoke all on function public.rulings_prepare() from public, anon, authenticated;
drop trigger if exists rulings_prepare_trg on public.rulings;
create trigger rulings_prepare_trg before insert or update on public.rulings
  for each row execute function public.rulings_prepare();

-- القائم: يمرّ بالمحفّز نفسه (كل محفّزات الأحكام الأخرى بعد الإدراج فقط)
update public.rulings set ruling_number = ruling_number;
