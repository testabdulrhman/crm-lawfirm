-- تدقيق أمني تالٍ لمصفوفة الصلاحيات: **الدوال** لا الجداول
--
-- المرحلتان ١ و٢ أغلقتا الجداول بسياسات RLS، لكن دالة `SECURITY DEFINER`
-- تعمل بصلاحية مالكها فتتجاوز السياسات كلها. ففحصت كل دالة definer يملك
-- anon أو authenticated نداءها عبر ‎/rest/v1/rpc/‎:
--
-- • anon: **صفر** دالة تُرجع بيانات. الإحدى عشرة التي حذّر منها مدقّق Supabase
--   (‏feed_*) كلها ترجع `trigger` — نداؤها يردّ بخطأ «trigger functions can
--   only be called as triggers». إنذار كاذب، جُرّب بانتحال anon.
-- • authenticated: ٢٢ دالة حقيقية. أكثرها يفحص صلاحيته بنفسه —
--   restore_item وtrash_items وapprove_request_evaluation ترفض غير المدير.
--   وبقيتها تُرجع حقائق عن المنادي نفسه (my_member_id، is_director_caller…).
--
-- بقيت ثغرتان تعالَجان هنا:

begin;

/* ===== ١) log_activity: كان يقبل هوية فاعل مزوّرة ===== */
-- أي موظف كان يستطيع نداءها مباشرة بـp_actor وp_actor_name لزميله، فيكتب في
-- سجلّ النشاط حدثاً منسوباً لغيره. والسجلّ عندنا **إثباتي** (قصة الملف)، فلا
-- يجوز أن يُكتب فيه ما لم يقع. العلاج: من ليس مديراً تُفرض هويته هو، وتُهمل
-- المعطيات المرسلة. ولا نرفع خطأ — نصحّح بصمت كي لا ينكسر أي نداء مشروع.
-- (نداءات النظام والمهام المجدولة بلا JWT فتمرّ كما كانت.)

create or replace function public.log_activity(
  p_type text, p_entity text, p_entity_id uuid, p_title text,
  p_case_id uuid default null, p_actor uuid default null,
  p_actor_name text default null, p_from text default null, p_to text default null)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_actor uuid;
  v_name  text;
  v_num   text;
  v_me    uuid;
begin
  v_me := (select id from team_members where auth_id = auth.uid() limit 1);

  if v_me is not null and not public.is_director_caller() then
    v_actor := v_me;                                  -- تُتجاهل p_actor المرسلة
    v_name  := (select coalesce(short_name, name) from team_members where id = v_me);
  else
    v_actor := coalesce(p_actor, v_me);
    v_name  := coalesce(p_actor_name,
                        (select coalesce(short_name, name) from team_members where id = v_actor),
                        'النظام');
  end if;

  if p_case_id is not null then
    select office_num into v_num from cases where id = p_case_id;
  end if;

  insert into activity_log
    (type, entity, entity_id, title, user_id, user_name, case_id, case_num, diff_from, diff_to)
  values
    (p_type, p_entity, p_entity_id, left(coalesce(p_title, ''), 200),
     v_actor, v_name, p_case_id, v_num, p_from, p_to);
exception when others then
  null;   -- التسجيل لا يُفشل العملية الأصلية أبداً
end;
$function$;

/* ===== ٢) دوال الصيانة: مكشوفة للنداء بلا داعٍ ===== */
-- تناديها المهام المجدولة بصفة postgres، ولا يوجد لها أي نداء في الويب ولا
-- iOS ولا دوال الحافة (تُحقّق بالبحث). فلا سبب لبقائها في متناول أي موظف.
-- ⚠️ next_booking_reference **تبقى** — ينادِيها الويب في useAppointments.ts.

revoke execute on function public.notify_deadline_ladder()        from anon, authenticated;
revoke execute on function public.derive_poa_renewal_tasks()      from anon, authenticated;
revoke execute on function public.close_stale_session_tasks()     from anon, authenticated;
revoke execute on function public.next_lead_reference()           from anon, authenticated;
revoke execute on function public.spawn_derived_task(text, uuid, text, date, text)
                                                                  from anon, authenticated;
revoke execute on function public.request_deadline_second_eye(uuid, uuid)
                                                                  from anon, authenticated;

/* ===== ٣) search_path ثابت للدوال الثمانية التي نبّه إليها المدقّق ===== */
-- دالة بلا search_path مثبّت يمكن خداعها بمسار بحث ملوّث.
alter function public.update_contacts_updated_at()            set search_path = public;
alter function public.notification_pref_gate()                set search_path = public;
alter function public.notification_category(text)             set search_path = public;
alter function public.hr_kind_label(text)                     set search_path = public;
alter function public.update_updated_at()                     set search_path = public;
alter function public.prevent_request_document_hard_delete()  set search_path = public;
alter function public.prevent_outgoing_document_hard_delete() set search_path = public;
alter function public.ar_norm(text)                           set search_path = public;

commit;
