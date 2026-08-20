-- الجدولة العكسية — الكيان يلد مهامه (الطبقة ٢ من هرم المستخدم، 2026-08-21)
--
-- «حكم يصدر ← لا تتولّد مهمة الاعتراض بمهلتها النظامية (٣٠ يوماً تجري
--  صامتة!) · جلسة تُجدوَل ← لا تتولّد مهام تحضيرها · وكالة تنتهي ← تنبيه
--  بلا مهمة» — الفجوة التي كشفها الهرم: الاشتقاق التلقائي غائب، والكيان
--  نفسه يعرف ما يلزمه.
--
-- SQL خالص بلا ذكاء اصطناعي — الاشتقاق هنا حتمي (تاريخ + مدة)، والحتمي
-- لا يُدفع فيه ثمن نموذج ولا احتمال خطئه. وخادميّ بالكامل: يخدم الويب
-- وتطبيق SwiftUI معاً، وأي عميل قادم (قرار «أصيل بسويفت»: المنطق في
-- القاعدة يُكتب مرة).
--
-- المهلة الافتراضية ٣٠ يوماً (نصوص الأحكام في النظام نفسها تقول «وللمعترض
-- حق الاعتراض خلال ثلاثين يوماً»)، وكل المدد قابلة للضبط من lookup_values
-- (type='task_derivation_config') — نمط SaaS المعتمد في النظام.

begin;

/* ============ ١. مفتاح الاشتقاق — idempotency ============ */

-- 'ruling:<id>:objection' · 'session:<id>:memo' · 'session:<id>:prep' ·
-- 'poa:<id>:renew' — الكيان الواحد لا يلد مهمته مرتين مهما تكرر التشغيل.
alter table public.tasks
  add column if not exists derived_key text;

create unique index if not exists tasks_derived_key_unique
  on public.tasks (derived_key)
  where derived_key is not null;

comment on column public.tasks.derived_key is
  'مفتاح الاشتقاق التلقائي (ruling:/session:/poa:) — فريد، يمنع تكرار توليد نفس المهمة';

/* ============ ٢. المدد القابلة للضبط ============ */

insert into public.lookup_values (type, label, value)
select v.t, v.l, v.v
from (values
  ('task_derivation_config', 'objection_days',            '30'),
  ('task_derivation_config', 'objection_margin_days',     '5'),
  ('task_derivation_config', 'session_memo_days_before',  '3'),
  ('task_derivation_config', 'session_prep_days_before',  '1'),
  ('task_derivation_config', 'poa_renew_days_before',     '30')
) as v(t, l, v)
where not exists (
  select 1 from public.lookup_values
  where type = v.t and label = v.l
);

create or replace function public.derivation_cfg(p_label text, p_default int)
returns int
language sql
stable
set search_path to 'public'
as $$
  select coalesce(
    (select nullif(btrim(value), '')::int from lookup_values
      where type = 'task_derivation_config' and label = p_label limit 1),
    p_default
  );
$$;

revoke execute on function public.derivation_cfg(text, int) from anon, public;

/* ============ ٣. مولّد مهمة مشتقة + إشعار ============ */

create or replace function public.spawn_derived_task(
  p_key      text,
  p_case_id  uuid,
  p_title    text,
  p_due      date,
  p_notes    text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_assignee uuid;
  v_task_id  uuid;
begin
  -- المكلَّف: مسؤول القضية إن وُجدت — وإلا بلا مكلَّف (تظهر في «الكل»)
  if p_case_id is not null then
    select assignee_id into v_assignee from cases where id = p_case_id;
  end if;

  insert into tasks (case_id, title, assignee_id, due_date, status, notes, derived_key)
  values (p_case_id, p_title, v_assignee, p_due, 'todo', p_notes, p_key)
  on conflict (derived_key) where derived_key is not null do nothing
  returning id into v_task_id;

  -- إشعار داخلي للمكلَّف — عند التوليد الفعلي فقط (لا عند التكرار المُهمَل)
  if v_task_id is not null and v_assignee is not null then
    insert into notifications (type, title, message, recipient_id, case_id, task_id)
    values ('task', 'مهمة مولّدة تلقائياً', p_title || ' — استحقاق ' || p_due::text,
            v_assignee, p_case_id, v_task_id);
  end if;
exception when others then
  -- الاشتقاق ثانوي: فشله يجب ألا يمنع حفظ الكيان الأصلي أبداً
  null;
end;
$$;

revoke execute on function public.spawn_derived_task(text, uuid, text, date, text) from anon, public;

/* ============ ٤. الحكم يلد مهمة الاعتراض ============ */

-- كل حكم غير ساقط: مهمة «دراسة الحكم وإعداد الاعتراض» مستحقة قبل انقضاء
-- المهلة بهامش أمان. المهلة الفائتة هناك ليست تأخيراً بل **سقوط حق** —
-- لذا لا تُشتق مهمة لحكم مهلته انقضت أصلاً (إدخال تاريخي).
create or replace function public.derive_ruling_tasks()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_deadline date;
  v_due      date;
begin
  if new.is_dropped is true then return new; end if;
  if new.ruling_date is null then return new; end if;

  v_deadline := new.ruling_date + derivation_cfg('objection_days', 30);
  if v_deadline < current_date then return new; end if;

  v_due := greatest(current_date, v_deadline - derivation_cfg('objection_margin_days', 5));

  perform spawn_derived_task(
    'ruling:' || new.id || ':objection',
    new.case_id,
    'دراسة الحكم وإعداد الاعتراض إن لزم' ||
      coalesce(' — حكم رقم ' || nullif(new.ruling_number, ''), ''),
    v_due,
    'مشتقة تلقائياً من تسجيل الحكم. ⚠️ مهلة الاعتراض تنتهي ' || v_deadline::text ||
      ' (' || derivation_cfg('objection_days', 30)::text || ' يوماً من تاريخ الحكم ' ||
      new.ruling_date::text || ') — فواتها سقوط حق لا تأخير.'
  );
  return new;
end;
$$;

revoke execute on function public.derive_ruling_tasks() from anon, public;

drop trigger if exists derive_ruling_tasks_trg on public.rulings;
create trigger derive_ruling_tasks_trg
  after insert on public.rulings
  for each row execute function public.derive_ruling_tasks();

/* ============ ٥. الجلسة تلد مهام تحضيرها ============ */

-- مهمتان لكل جلسة مستقبلية: المذكرة قبلها بأيام، وتجهيز الملف قبلها بيوم.
-- تعمل أيضاً على «الجلسة القادمة» التي ينشئها إغلاق الجلسة — سلسلة تلقائية.
create or replace function public.derive_session_tasks()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.session_date is null or new.session_date <= current_date then return new; end if;

  perform spawn_derived_task(
    'session:' || new.id || ':memo',
    new.case_id,
    'إعداد المذكرة ورفعها قبل الجلسة' ||
      coalesce(' (' || new.session_date::text || ')', ''),
    greatest(current_date, new.session_date - derivation_cfg('session_memo_days_before', 3)),
    'مشتقة تلقائياً من جدولة الجلسة بتاريخ ' || new.session_date::text ||
      coalesce(' — ' || nullif(new.court, ''), '') ||
      '. إن لم تلزم مذكرة لهذه الجلسة أنجِز المهمة بملاحظة.'
  );

  perform spawn_derived_task(
    'session:' || new.id || ':prep',
    new.case_id,
    'تجهيز ملف الجلسة' ||
      coalesce(' (' || new.session_date::text || ')', ''),
    greatest(current_date, new.session_date - derivation_cfg('session_prep_days_before', 1)),
    'مشتقة تلقائياً: مراجعة المستندات والوكالة وخط السير قبل جلسة ' ||
      new.session_date::text || '.'
  );
  return new;
end;
$$;

revoke execute on function public.derive_session_tasks() from anon, public;

drop trigger if exists derive_session_tasks_trg on public.sessions;
create trigger derive_session_tasks_trg
  after insert on public.sessions
  for each row execute function public.derive_session_tasks();

/* ============ ٦. الوكالة المشرفة على الانتهاء تلد مهمة تجديد ============ */

-- الانتهاء يقترب مع الزمن لا عند الإدراج — لذا فحص يومي (pg_cron) لا trigger.
create or replace function public.derive_poa_renewal_tasks()
returns int
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select id, poa_number, client_name, case_id, expiry_date
    from powers_of_attorney
    where deleted_at is null
      and status = 'active'
      and expiry_date between current_date
          and current_date + derivation_cfg('poa_renew_days_before', 30)
  loop
    perform spawn_derived_task(
      'poa:' || r.id || ':renew',
      r.case_id,
      'تجديد الوكالة — ' || coalesce(r.client_name, 'موكّل') ||
        coalesce(' (' || nullif(r.poa_number, '') || ')', ''),
      greatest(current_date, r.expiry_date - 7),
      'مشتقة تلقائياً: الوكالة تنتهي في ' || r.expiry_date::text ||
        '. انتهاؤها دون تجديد يعطّل التمثيل أمام المحكمة.'
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.derive_poa_renewal_tasks() from anon, public;

-- يومياً ٦:٠٠ UTC = ٩:٠٠ صباحاً بتوقيت الرياض
select cron.schedule(
  'poa-renewal-tasks',
  '0 6 * * *',
  $$select public.derive_poa_renewal_tasks()$$
);

commit;
