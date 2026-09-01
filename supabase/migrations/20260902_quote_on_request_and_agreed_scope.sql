-- عرض السعر يحفظ نفسه على الطلب الوارد (كان يولَّد ويُرسل ولا يترك أثراً)،
-- ونطاق العمل المتفق عليه ينتقل مع الملف عند فتحه — بدل تبويب «بطاقة المشروع»
-- الذي طلب إعادة كتابة ما التزم به المكتب مسبقاً فبقي فارغاً (١ من ٢٢٧).
-- مطبَّق على الإنتاج 2026-09-02 باسم quote_on_request_and_agreed_scope.
alter table incoming_requests
  add column if not exists quote_no text,
  add column if not exists quote_scope text,
  add column if not exists quote_amount numeric,
  add column if not exists quote_sent_at timestamptz;

alter table cases add column if not exists agreed_scope text;
comment on column cases.agreed_scope is 'نطاق العمل المتفق عليه — ينتقل من عرض السعر عند فتح الملف، ويُعرض في نظرة عامة';

-- نقل بطاقة المشروع الوحيدة المعبّأة إلى نطاق الملف قبل إخفاء التبويب
update cases c
set agreed_scope = concat_ws(E'\n\n',
  case when coalesce(p.goal,'') <> '' then 'الغاية: ' || p.goal end,
  case when coalesce(p.scope_in,'') <> '' then E'نطاق العمل:\n' || p.scope_in end,
  case when coalesce(p.scope_out,'') <> '' then E'لا يشمل:\n' || p.scope_out end,
  case when coalesce(p.deliverables,'') <> '' then E'المخرجات:\n' || p.deliverables end,
  case when coalesce(p.assumptions,'') <> '' then E'الافتراضات:\n' || p.assumptions end)
from case_projects p
where p.case_id = c.id and c.agreed_scope is null;
