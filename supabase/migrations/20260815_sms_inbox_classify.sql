-- صندوق الوارد: استقبال كل الرسائل وتصنيفها في النظام بدل الفلترة في الاختصار
-- 2026-08-15
--
-- السبب (طلب المستخدم): الاختصار كان يفلتر باسم المرسِل، والاسم يتغيّر أو لا
-- يضبط فتضيع رسائل. الحل: يرسل الاختصار كل شيء، والنظام يصنّف.
--
-- ⚠️ أثر أمني لازم: تحويل «كل» الرسائل يُدخل رموز التحقق والرسائل الشخصية
--    إلى جدول يقرؤه كل موظف (سياسة authenticated_all). لذا هذا الترحيل:
--    ١. يحجب رموز التحقق من النص قبل الحفظ (في دالة sms-inbox).
--    ٢. يقصر رؤية فئتَي otp/personal على المدراء.

begin;

/* ============ ١. أعمدة التصنيف والمتابعة ============ */

alter table public.sms_log
  add column if not exists category     text,
  add column if not exists is_important boolean not null default false,
  add column if not exists contact_id   uuid references public.contacts(id) on delete set null,
  add column if not exists read_at      timestamptz,
  add column if not exists dedup_key    text;

comment on column public.sms_log.category is
  'najiz | government | bank | client | otp | promo | personal | other — يصنّفها sms-inbox';
comment on column public.sms_log.is_important is
  'يستحق نظر الموظف (ناجز/حكومي/بنك/موكّل) — الوارد الآخر ضجيج يُخفى افتراضياً';
comment on column public.sms_log.dedup_key is
  'md5(المرسِل|النص) — يمنع تكرار الرسالة نفسها عند إعادة إرسال الاختصار';

-- الاستعلام الغالب: الوارد المهم غير المقروء مرتّباً زمنياً
create index if not exists sms_log_incoming_idx
  on public.sms_log (created_at desc)
  where status = 'incoming';

create index if not exists sms_log_dedup_idx
  on public.sms_log (dedup_key)
  where status = 'incoming';

/* ============ ٢. دالة «هل المستخدم الحالي مدير؟» ============ */

-- SECURITY DEFINER لتتجاوز RLS على team_members أثناء الفحص (وإلا دارت السياسة
-- على نفسها). مقصورة على authenticated — لا anon.
create or replace function public.current_is_director()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.team_members
    where auth_id = auth.uid() and coalesce(is_director, false)
  );
$$;

revoke execute on function public.current_is_director() from anon, public;
grant execute on function public.current_is_director() to authenticated;

/* ============ ٣. الخصوصية: من يرى ماذا ============ */

-- كانت سياسة واحدة تفتح كل شيء للجميع. نفصل القراءة عن الكتابة، ونستثني
-- فئتَي otp/personal من الوارد فلا يراهما إلا المدير.
drop policy if exists authenticated_all on public.sms_log;

create policy sms_log_select on public.sms_log
  for select to authenticated
  using (
    status is distinct from 'incoming'                 -- الصادر: كما كان
    or coalesce(category, 'other') not in ('otp', 'personal')
    or public.current_is_director()                    -- المدير يرى كل شيء
  );

create policy sms_log_write on public.sms_log
  for insert to authenticated with check (true);

create policy sms_log_update on public.sms_log
  for update to authenticated using (true) with check (true);

create policy sms_log_delete on public.sms_log
  for delete to authenticated using (public.current_is_director());

/* ============ ٤. تصنيف الوارد القائم بأثر رجعي ============ */

-- الموجود كله من MOJ وSBC — جهات حكومية مهمة، فلا يُخفى شيء بعد الترحيل
update public.sms_log
set category = case
      when phone ilike '%MOJ%' or message like '%ناجز%' or message like '%وزارة العدل%'
        then 'najiz'
      else 'government'
    end,
    is_important = true
where status = 'incoming' and category is null;

commit;
