-- سير إجراء الإفلاس — قرار المستخدم (2026-09-07):
--   «نظام الإفلاس لمتابعة الديون والدائنين، وأما هنا فمتابعة سير المشروع كامل».
-- فلا قائمة دائنين هنا؛ المحطات النظامية فقط.
--
-- عمود واحد على cases، ومسار الملف يعرضه بدل مسار القضية، وكل انتقال يُروى
-- في «قصة الملف».

alter table public.cases add column if not exists bankruptcy_stage text;

alter table public.cases drop constraint if exists cases_bankruptcy_stage_check;
alter table public.cases add constraint cases_bankruptcy_stage_check
  check (bankruptcy_stage is null or bankruptcy_stage in
    ('filed','opened','trustee','claims','plan','vote','ratified','closed'));

comment on column public.cases.bankruptcy_stage is
  'مرحلة إجراء الإفلاس (kind=bankruptcy فقط) — التفاصيل المالية في نظام الإفلاس المنفصل';

-- ⚠️ نوع حدث جديد في قصة الملف. القيد مغلق عمداً (السجل إثباتي)، و
--    log_matter_event **تبتلع خطأ الإدراج تحذيراً** — فنسيان هذا السطر يجعل
--    الحدث يختفي بصمت. (وقع لي فعلاً قبل أن أكتشفه بالاختبار.)
alter table public.matter_events drop constraint if exists matter_events_kind_check;
alter table public.matter_events add constraint matter_events_kind_check
  check (kind = any (array[
    'birth','session','ruling','deadline','task','sms','doc','decision',
    'contract','poa','bypass','note','close','system','stage'
  ]));

create or replace function public.bankruptcy_stage_narrate()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  labels constant jsonb := jsonb_build_object(
    'filed','تقديم الطلب', 'opened','افتتاح الإجراء', 'trustee','تعيين الأمين',
    'claims','حصر الديون', 'plan','اقتراح الخطة', 'vote','تصويت الدائنين',
    'ratified','التصديق', 'closed','انتهاء الإجراء');
  v_from text; v_to text; v_name text;
begin
  if new.kind <> 'bankruptcy' then return new; end if;
  if new.bankruptcy_stage is not distinct from old.bankruptcy_stage then return new; end if;
  v_to := labels ->> new.bankruptcy_stage;
  if v_to is null then return new; end if;
  v_from := labels ->> old.bankruptcy_stage;

  select coalesce(short_name, name) into v_name
    from team_members where auth_id = auth.uid();

  perform public.log_matter_event(
    new.id, 'stage',
    case when v_from is null
         then 'بلغ الإجراء مرحلة «' || v_to || '».'
         else 'انتقل الإجراء من «' || v_from || '» إلى «' || v_to || '».' end,
    jsonb_build_object('from', old.bankruptcy_stage, 'to', new.bankruptcy_stage),
    true,
    'bk:' || new.id || ':' || new.bankruptcy_stage,
    public.my_member_id(),
    coalesce(v_name, 'النظام'));
  return new;
end $$;

drop trigger if exists bankruptcy_stage_narrate_trg on public.cases;
create trigger bankruptcy_stage_narrate_trg
  after update of bankruptcy_stage on public.cases
  for each row execute function public.bankruptcy_stage_narrate();
