-- ربط رسائل ناجز بملفاتها «تعلّماً» (طلب المدير 2026-09-26: «أي قضية موجودة بالنظام يربطها فيه»).
--
-- التشخيص: ٣٠ فقط من ١٥٤ رسالة MOJ مربوطة. الربط الآلي يطابق رقم القضية (court_num) وحده،
-- وأغلب الرسائل تحمل أرقاماً أخرى — طلبات الصلح «01-4803129645»، والتنفيذ، والصكوك — لا تُسجَّل
-- في الملف أصلاً. الحل: جدول case_refs لأرقام الملف الأخرى، يتعلّم من الربط اليدوي:
-- ربط رسالة واحدة يلقّن النظام رقم الطلب فيها، فتنربط أخواتها السابقة واللاحقة تلقائياً.

create table if not exists public.case_refs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases(id) on delete cascade,
  ref text not null check (ref ~ '^\d{7,}$'),          -- أرقام فقط كما تُستخرج من الرسائل
  label text,
  source text not null default 'learned' check (source in ('learned', 'manual')),
  created_by uuid references public.team_members(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (ref)
);
create index if not exists case_refs_case_idx on public.case_refs (case_id);

alter table public.case_refs enable row level security;
drop policy if exists case_refs_read on public.case_refs;
create policy case_refs_read on public.case_refs for select to authenticated using (true);
drop policy if exists case_refs_write on public.case_refs;
create policy case_refs_write on public.case_refs for insert to authenticated with check (true);
drop policy if exists case_refs_delete on public.case_refs;
create policy case_refs_delete on public.case_refs for delete to authenticated using (true);
drop policy if exists case_refs_no_collab on public.case_refs;
create policy case_refs_no_collab on public.case_refs as restrictive for all to authenticated
  using (not (select public.is_collaborator_caller()) and not (select public.is_reviewer_caller()))
  with check (not (select public.is_collaborator_caller()) and not (select public.is_reviewer_caller()));
revoke all on public.case_refs from anon, authenticated;
grant select, insert, delete on public.case_refs to authenticated;

-- المطابقة: رقم القضية كما كان + أرقام الملف المتعلَّمة (تطابق تام). تطابق وحيد أو لا شيء.
create or replace function public.match_incoming_case(p_message text)
 returns uuid
 language sql
 stable
 set search_path to 'public'
as $function$
  with runs as (
    select distinct m[1] as r
    from regexp_matches(coalesce(p_message, ''), '(\d{7,})', 'g') m
  ),
  hits as (
    select distinct c.id
    from cases c
    cross join runs
    where c.deleted_at is null
      and length(regexp_replace(coalesce(c.court_num, ''), '\D', '', 'g')) >= 7
      and (
        regexp_replace(c.court_num, '\D', '', 'g') = runs.r
        or right(runs.r, length(regexp_replace(c.court_num, '\D', '', 'g')))
           = regexp_replace(c.court_num, '\D', '', 'g')
      )
    union
    select distinct cr.case_id
    from case_refs cr
    join runs on runs.r = cr.ref
    join cases c on c.id = cr.case_id and c.deleted_at is null
  )
  select case when count(*) = 1 then min(id::text)::uuid end from hits;
$function$;

-- التعلّم: ربط رسالة واردة بملف يدوياً ⇒ أرقامها غير المعروفة تُنسب للملف، ثم تُربط أخواتها
create or replace function public.learn_sms_case_refs()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r text;
  v_learned int := 0;
begin
  -- إعادة الربط التي يجريها التعلّم نفسه لا تُعلِّم من جديد (لا سلاسل)
  if current_setting('app.sms_relinking', true) = '1' then return new; end if;
  if new.status is distinct from 'incoming' or new.case_id is null
     or new.case_id is not distinct from old.case_id then
    return new;
  end if;

  for r in
    select distinct m[1] from regexp_matches(coalesce(new.message, ''), '(\d{7,})', 'g') m
  loop
    -- رقم معروف لملف (رقم قضية أو متعلَّم) لا يُعاد تعليمه
    continue when exists (select 1 from case_refs where ref = r);
    continue when exists (
      select 1 from cases c
      where c.deleted_at is null
        and length(regexp_replace(coalesce(c.court_num, ''), '\D', '', 'g')) >= 7
        and (regexp_replace(c.court_num, '\D', '', 'g') = r
             or right(r, length(regexp_replace(c.court_num, '\D', '', 'g'))) = regexp_replace(c.court_num, '\D', '', 'g'))
    );
    -- رقم ظهر في رسالة مربوطة بملف آخر ليس خاصاً بهذا الملف (رقم عام أو مشترك)
    continue when exists (
      select 1 from sms_log s
      where s.status = 'incoming' and s.case_id is not null and s.case_id <> new.case_id
        and s.message ~ ('(^|\D)' || r || '(\D|$)')
    );
    insert into case_refs (case_id, ref, label, source, created_by)
    values (new.case_id, r, 'رقم من رسالة ناجز', 'learned', (select public.my_member_id()))
    on conflict (ref) do nothing;
    v_learned := v_learned + 1;
  end loop;

  if v_learned > 0 then
    perform set_config('app.sms_relinking', '1', true);
    update sms_log s
       set case_id = match_incoming_case(s.message)
     where s.status = 'incoming' and s.case_id is null and s.id <> new.id
       and match_incoming_case(s.message) is not null;
    perform set_config('app.sms_relinking', '0', true);
  end if;
  return new;
exception when others then
  perform set_config('app.sms_relinking', '0', true);
  return new;
end; $function$;

revoke all on function public.learn_sms_case_refs() from public, anon, authenticated;

drop trigger if exists sms_log_learn_refs_trg on public.sms_log;
create trigger sms_log_learn_refs_trg
  after update of case_id on public.sms_log
  for each row execute function public.learn_sms_case_refs();

-- رجعياً: ما صار يطابق الآن (ملفات أُضيف رقمها بعد وصول رسائلها)
update public.sms_log s
   set case_id = public.match_incoming_case(s.message)
 where s.status = 'incoming' and s.case_id is null
   and public.match_incoming_case(s.message) is not null;
