-- «اليوم» بتوقيت الرياض في القاعدة (فحص ChatGPT، طلب المدير 2026-10-22: «صلحها»).
-- القاعدة تعمل بـUTC، فـcurrent_date بين منتصف الليل والثالثة فجراً بالرياض هو **أمس**: ملخّص الرئيسية
-- (الويب والآيفون) يُظهر جلسات أمس ومواعيده ويحسب أيام الوكالات بيوم زائد، والمهام المشتقة من الجلسات والأحكام
-- تُؤرَّخ بالأمس، وعرض «الوكالات المحتاجة للتجديد» يُبقي وكالة انتهت اليوم.
-- المجدولات (cron) لا تُمسّ: تعمل في ساعات يتطابق فيها تاريخ UTC وتاريخ الرياض.

create or replace function public.riyadh_today()
 returns date language sql stable
as $$ select (now() at time zone 'Asia/Riyadh')::date $$;

-- الدوال: current_date ← riyadh_today() في تعريفها الحالي نفسه (تُحفظ الصلاحيات والمالك وsecurity definer)
do $$
declare r record; def text;
begin
  for r in
    select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('dashboard_overview', 'derive_session_tasks', 'derive_ruling_tasks', 'installments_on_ruling',
                         'legal_services_vw_write', 'property_transfers_vw_write', 'log_case_birth', 'leave_balance')
  loop
    def := regexp_replace(pg_get_functiondef(r.oid), '\mcurrent_date\M', 'public.riyadh_today()', 'gi');
    execute def;
  end loop;

  -- سنة رقم الملف (CASE26…) بالرياض — كانت ليلة رأس السنة الميلادية حتى الثالثة فجراً تأخذ السنة الماضية
  def := replace(pg_get_functiondef('public.generate_office_num'::regproc),
                 'to_char(now(), ''YY'')', 'to_char(now() at time zone ''Asia/Riyadh'', ''YY'')');
  execute def;

  -- العرض: الوكالة المنتهية اليوم بالرياض لا تُعدّ «تحتاج تجديداً» بعد
  execute 'create or replace view public.poas_needing_renewal with (security_invoker = true) as '
    || regexp_replace(pg_get_viewdef('public.poas_needing_renewal'::regclass), '\mcurrent_date\M', 'public.riyadh_today()', 'gi');
end $$;
