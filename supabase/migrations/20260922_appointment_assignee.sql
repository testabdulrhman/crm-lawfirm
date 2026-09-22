-- مسؤول الموعد (طلب المدير 2026-09-22: «مواعيد العملاء ودي أحط شخص مسؤول فيها»)
--
-- كان الموعد بلا مالك: created_by نصّ اسم من أنشأه لا من يستقبل العميل،
-- فلا يُعرف من يتابعه ولا يصل أحداً إشعار به.
--
-- assignee_id هو الموظف المسؤول. اسم العمود مطابق لما في cases/tasks عمداً.

alter table public.appointments
  add column if not exists assignee_id uuid references public.team_members(id);

comment on column public.appointments.assignee_id is
  'الموظف المسؤول عن استقبال الموعد ومتابعته (طلب المدير 2026-09-22).';

-- يُستعمل في فلتر «مواعيدي» وفي بطاقة الموظف
create index if not exists appointments_assignee_idx
  on public.appointments (assignee_id)
  where assignee_id is not null;
