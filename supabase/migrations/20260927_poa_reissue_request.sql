-- طلب إعادة إصدار الوكالة من الموكّل عبر واتساب (طلب المدير 2026-09-27: «اذا فيه وكالة انتهت او
-- بتنتهي قريب ابي يكون عندي خيار ارسال للعميل طلب إصدار وكالة»). القالب crm_law_07 في الـHub.
-- آخر طلب وممن — يُعرض في الوكالة ويمنع الإرسال المكرر غير المقصود.
alter table public.powers_of_attorney
  add column if not exists reissue_requested_at timestamptz,
  add column if not exists reissue_requested_by uuid references public.team_members(id) on delete set null;
