-- استهلاك الإدخال/الإخراج (تنبيه Supabase بتاريخ 2026-09-02) — العلاج
--
-- التشخيص: القاعدة ٥٦ م.ب، **٣٠ م.ب منها سجلّات pg_cron وpg_net** لا بيانات
-- المكتب. cron.job_run_details ٢١٧٠٢ صفاً منذ ٣ يوليو بلا أي تنظيف (١٥ م.ب)،
-- وnet._http_response ١٥ م.ب لـ١٣٩ صفاً حيّاً (٩٩٪ انتفاخ). والحوسبة nano
-- وهي أصغر شريحة إدخال/إخراج، فهذا العبث وحده يستنزف رصيدها.
--
-- ١) احتفاظ بسجل الجدولة ٣٠ يوماً + مهمة تنظيف يومية.
-- ٢) فهارس للنداءات التي تمسح جداول كاملة — أهمها team_members(auth_id):
--    كل سياسة RLS في النظام تنادي is_director_caller()/my_member_id() وهما
--    تبحثان بـauth_id بلا فهرس (١٫٤٩ مليون مسح كامل). وtasks(case_id) لأن
--    can_access_case() الجديدة (المرحلة ٢) تمسح tasks لكل صفّ تفحصه.
-- ٣) lead_counters كان **بلا RLS إطلاقاً** وanon يملك عليه الكتابة
--    (تحذير Advisor الحرج). دالته next_lead_reference بصيغة definer فتعمل
--    بعد التفعيل بلا سياسة.

begin;

/* ============ ١) فهارس ============ */

-- الأهم: مفتاح الربط بين حساب الدخول وصفّ الموظف — تناديه كل سياسة
create index if not exists team_members_auth_idx
  on public.team_members (auth_id) where auth_id is not null;

-- can_access_case(): المسؤول عن الملف
create index if not exists cases_assignee_idx
  on public.cases (assignee_id) where deleted_at is null;

-- can_access_case(): «عليه مهمة مفتوحة في الملف» — كانت تمسح tasks كاملاً
create index if not exists tasks_case_idx
  on public.tasks (case_id) where deleted_at is null;

create index if not exists case_parties_case_idx
  on public.case_parties (case_id);

create index if not exists activity_log_case_idx
  on public.activity_log (case_id) where case_id is not null;

create index if not exists activity_log_entity_idx
  on public.activity_log (entity, entity_id);

create index if not exists notifications_recipient_idx
  on public.notifications (recipient_id, created_at desc);

/* ============ ٢) lead_counters — سدّ ثغرة anon ============ */

alter table public.lead_counters enable row level security;
revoke all on public.lead_counters from anon, authenticated;
-- بلا سياسات: الوصول الوحيد عبر public.next_lead_reference() وهي definer.

commit;

/* ============ ٣) نُفِّذ خارج المعاملة (‏VACUUM لا يقبل transaction) ============ */
-- delete from cron.job_run_details where start_time < now() - interval '7 days';  -- التنظيف الأول: ١٧٢٩٩ صفاً
-- vacuum full cron.job_run_details;   -- ١٥ م.ب ← ٢٫٧ م.ب
-- vacuum full net._http_response;     -- ١٥ م.ب ← ٢١٦ ك.ب
-- select cron.schedule('cron-log-retention', '15 2 * * *',
--   $$delete from cron.job_run_details where start_time < now() - interval '30 days'$$);
--
-- النتيجة: حجم القاعدة ٥٦ م.ب ← **٣١ م.ب**.
--
-- ⚠️ الاحتفاظ ضُبط ٧ أيام أولاً ثم **رُفع إلى ٣٠ يوماً** بعد ترقية الحوسبة إلى
--    micro (مبدأ المستخدم: «دائماً أعمل ترقية أفضل من أني أحذف شيء أو أأخّر
--    ميزة»). ولنفس السبب **لم تُخفَّف** أي مهمة مجدولة — booking-warm و
--    email-sync-5min تبقيان كل ٥ دقائق.
