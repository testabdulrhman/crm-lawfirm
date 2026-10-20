-- تقويم الموظف يعرض انتهاء وكالات أشخاص لا علاقة له بهم (بلاغ المدير 2026-10-20): ٤٠ من ٤٥ وكالة سارية غير
-- مربوطة بملف، وغير المربوط مرئي للجميع، والتقويم وشارة «تنتهي قريباً» يقرآن الكل.
-- الآن العرض (مصدر تقويم الآيفون وشارة الويب، والتقويم في الويب صار يقرؤه) يُظهر لغير المدير ومن يرى الكل
-- ما يخصه فقط: وكالة ملفٍ في نطاقه، أو وكالة موكّلٍ له ملف في نطاقه. والجدول نفسه (صفحة الوكالات) كما هو.
create or replace view public.poas_needing_renewal with (security_invoker = true) as
 select p.id, p.poa_number, p.poa_date, p.expiry_date, p.status, p.client_id, p.client_name, p.agent_name,
        p.document_url, p.notes, p.case_id, p.created_at, p.deleted_at, p.deleted_by,
        c.office_num as case_office_num, c.status as case_status
   from powers_of_attorney p
   left join cases c on c.id = p.case_id
  where p.deleted_at is null and p.status = 'active'::text and p.expiry_date >= current_date
    and (p.case_id is null or not matter_is_closed(p.case_id))
    and ((select public.is_office_viewer_caller())
         or p.case_id = any((select public.my_accessible_case_ids())::uuid[])
         or (p.client_id is not null and exists (
               select 1 from cases mc
                where mc.contact_id = p.client_id
                  and mc.id = any((select public.my_accessible_case_ids())::uuid[]))));
