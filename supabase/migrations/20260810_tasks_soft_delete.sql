-- ============================================================================
-- حذف ناعم للمهام — طُبّق على الإنتاج 2026-08-10
--
-- ⚠️ كان الحذف نهائياً بلا أثر: لا الصف يبقى، ولا سجل النشاط يسجّل الحذف
--    (يسجّل الإضافة والتعديل فقط). فتختفي مهمة ولا يعرف أحد من حذفها.
--    نفس نمط documents و outgoing_letters و engagements.
-- ============================================================================

alter table public.tasks
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by text;

comment on column public.tasks.deleted_at is 'لحظة الحذف الناعم — الصف يبقى ولا يُعرض';
comment on column public.tasks.deleted_by is 'اسم من نفّذ الحذف';

create index if not exists tasks_active_idx
  on public.tasks (assignee_id, due_date) where deleted_at is null;

-- ============================================================================
-- التراجع
-- ============================================================================
-- begin;
--   drop index if exists public.tasks_active_idx;
--   alter table public.tasks drop column if exists deleted_at, drop column if exists deleted_by;
-- commit;
-- ⚠️ التراجع يُظهر المهام المحذوفة ناعماً مرة أخرى في كل القوائم.
-- ============================================================================
