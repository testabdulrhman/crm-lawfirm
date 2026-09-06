-- وكالة على مشروع منتهٍ لا تُنبّه
--
-- الطلب: «إذا كان فيه وكالة مربوطة في مشروع منتهي ما يحتاج تنبهني إذا انتهت».
-- والعلّة أن التنبيه كان ينظر إلى الوكالة وحدها ولا يسأل عن حال ملفها.
--
-- مسارات التنبيه ثلاثة، سُدّت كلها:
--   ١) derive_poa_renewal_tasks() — المهمة المشتقة (كرون يومي ٠٦:٠٠)
--   ٢) شارة الشريط الجانبي (useExpiringPOAsCount) عبر العرض أدناه
--   ٣) تحذير البطاقة في صفحة الوكالات (onClosedMatter في الواجهة)

create or replace function public.matter_is_closed(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cases c
     where c.id = cid
       and (c.deleted_at is not null
            or c.status in ('muntahia', 'delivered', 'مكتملة'))
  );
$$;
revoke execute on function public.matter_is_closed(uuid) from anon, public;
grant execute on function public.matter_is_closed(uuid) to authenticated;

-- (نصّ derive_poa_renewal_tasks المعدّل مطبَّق على الإنتاج — الشرط المضاف:
--  `and (case_id is null or not public.matter_is_closed(case_id))`)

create or replace view public.poas_needing_renewal
with (security_invoker = true) as
  select p.*, c.office_num as case_office_num, c.status as case_status
    from powers_of_attorney p
    left join cases c on c.id = p.case_id
   where p.deleted_at is null
     and p.status = 'active'
     and p.expiry_date >= current_date
     and (p.case_id is null or not public.matter_is_closed(p.case_id));

-- ⚠️ العرض بصيغة security_invoker فيخضع لسياسات RLS ولا يلتفّ عليها.
