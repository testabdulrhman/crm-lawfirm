-- سجل الأخطاء يُملأ من الواجهات ويقرؤه المدير (طلب المدير 2026-09-15: «ليه إذا صار فيه خطأ
-- ما يتسجل عندنا وانت تطلع على الأخطاء ونصلحها؟»).
--
-- قبله: سياسة authenticated_all تُتيح لأي موظف قراءة السجل كله وتعديله وحذفه، ونصوص الأخطاء
-- قد تحمل بيانات (قيمة مكررة مثل رقم جوال). الآن:
--   • الإدراج: الموظف يسجّل أخطاءه هو (أو بلا هوية) — لا ينتحل غيره
--   • القراءة: المدير الكل؛ والموظف أخطاءه؛ وفشل «دراسة القضية» لمن يصل إلى ملفه
--     (تبويب الدراسة يقرؤه ليعرض السبب بدل رسالة المهلة العامة، والدالة تكتبه بلا هوية)
--   • المسح للمدير وحده، ولا تعديل لأحد — سجل لا يُحرَّر
-- دوال الحافة (دراسة القضية، طلبات التوظيف) تكتب بمفتاح الخدمة فلا تمسّها هذه القواعد.

begin;

alter table public.error_logs enable row level security;

drop policy if exists authenticated_all on public.error_logs;

create policy error_logs_insert_own on public.error_logs
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

create policy error_logs_select on public.error_logs
  for select to authenticated
  using (
    is_director_caller()
    or user_id = auth.uid()
    or case
         when source = 'case-study' and url ~ '^[0-9a-f-]{36}$' then can_access_case(url::uuid)
         else false
       end
  );

create policy error_logs_delete_director on public.error_logs
  for delete to authenticated
  using (is_director_caller());

-- الزائر لا شيء؛ والموظف لا تعديل ولا تفريغ للجدول (TRUNCATE يتجاوز RLS)
revoke all on public.error_logs from anon;
revoke update, truncate, references, trigger on public.error_logs from authenticated;

create index if not exists error_logs_created_at_idx on public.error_logs (created_at desc);

commit;
