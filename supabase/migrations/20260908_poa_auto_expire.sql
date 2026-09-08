-- «مكتوب عليها منتهية فعلياً ولكن مصنّفة على أنها سارية، كيف؟»
-- (بلاغ المستخدم على الوكالة 471634644، 2026-09-08)
--
-- السبب: `status` حقل **مخزَّن** يُكتب عند الإدخال، ولا شيء يعيد حسابه حين
-- يمرّ تاريخ الانتهاء. وبطاقة الوكالة تقارن التاريخ فتعرض تحذير «منتهية
-- فعلياً»، بينما الوسم يعرض المخزَّن — فيتناقضان على الشاشة نفسها.
-- كانت ١٤ وكالة كذلك، أقدمها متأخرة ١٣٨ يوماً.
--
-- ⚠️ لا تُشتقّ الحالة اشتقاقاً كاملاً من التاريخ: **«ملغاة» قرار إنسان** لا
--    يُستنتج، فلا يجوز أن يمسحه حساب. لذلك يبقى المخزَّن ويُصحَّح آلياً في
--    الحالة الوحيدة التي لا لبس فيها: سارية + مضى تاريخها ⇒ منتهية.

create or replace function public.expire_stale_poas()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update powers_of_attorney
     set status = 'expired'
   where deleted_at is null
     and status = 'active'
     and expiry_date is not null
     and expiry_date < current_date;
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.expire_stale_poas() from anon, authenticated;

comment on function public.expire_stale_poas() is
  'يقلب الوكالات السارية التي مضى تاريخ انتهائها إلى «منتهية» — يومياً عبر pg_cron';

-- select cron.schedule('poa-auto-expire', '20 1 * * *', 'select public.expire_stale_poas()');
-- نُفِّذ مرة يدوياً عند الإصلاح فصحّح ١٤ صفاً.
