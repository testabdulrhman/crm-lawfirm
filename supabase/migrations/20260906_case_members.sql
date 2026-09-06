-- فريق الملف: أكثر من شخص على الملف الواحد
--
-- كان `cases.assignee_id` **مسؤولاً واحداً**، ومصفوفة الصلاحيات (المرحلة ٢)
-- تمنح الوصول للمسؤول أو من عليه مهمة مفتوحة أو عضو قناة. فمن أراد إشراك
-- زميل في ملف بلا إسناده إليه، لم يكن أمامه إلا حيلة: مهمة صورية أو قناة.
--
-- ⚠️ لم أُعِد استعمال `channel_members` رغم أن `can_access_case()` تقرؤها
--    أصلاً — لأن الملف عندها يظهر **قناةً** في قائمة النقاشات، وهذا خلط في
--    المعنى. جدول مستقل أوضح، ويحتمل دوراً للعضو لاحقاً.

begin;

create table if not exists public.case_members (
  case_id    uuid not null references public.cases(id)        on delete cascade,
  member_id  uuid not null references public.team_members(id) on delete cascade,
  role       text,                                   -- «متعاون» افتراضاً، ويحتمل «مراجع» لاحقاً
  added_by   uuid references public.team_members(id),
  created_at timestamptz not null default now(),
  primary key (case_id, member_id)
);

create index if not exists case_members_member_idx on public.case_members (member_id);

alter table public.case_members enable row level security;

/* ===== الوصول ===== */
-- القراءة: من يرى الملف يرى فريقه.
drop policy if exists case_members_read on public.case_members;
create policy case_members_read on public.case_members
  for select to authenticated
  using (public.can_access_case(case_id));

-- الإضافة والإزالة: المدير، أو **مسؤول الملف نفسه** — فالإشراك قرار تشغيلي
-- يخصّ من يدير الملف، لا يُنتظر فيه المدير.
drop policy if exists case_members_write on public.case_members;
create policy case_members_write on public.case_members
  for all to authenticated
  using (
    public.is_director_caller()
    or exists (select 1 from public.cases c
                where c.id = case_id and c.assignee_id = public.my_member_id())
  )
  with check (
    public.is_director_caller()
    or exists (select 1 from public.cases c
                where c.id = case_id and c.assignee_id = public.my_member_id())
  );

/* ===== توسعة قاعدة الوصول =====
   ⚠️ can_access_case بصيغة definer، فقراءتها لـcase_members لا تخضع لسياسة
      الجدول — فلا دور (recursion) بين السياسة والدالة. */
create or replace function public.can_access_case(cid uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select cid is null
      or public.is_director_caller()
      or exists (select 1 from cases c
                  where c.id = cid and c.assignee_id = public.my_member_id())
      or exists (select 1 from case_members cm
                  where cm.case_id = cid and cm.member_id = public.my_member_id())
      or exists (select 1 from tasks t
                  where t.case_id = cid and t.deleted_at is null
                    and (t.assignee_id = public.my_member_id()
                         or exists (select 1 from task_participants tp
                                     where tp.task_id = t.id
                                       and tp.member_id = public.my_member_id())))
      or public.is_channel_member(cid);
$$;

revoke execute on function public.can_access_case(uuid) from anon;

/* ===== إشعار المُضاف — يعمل من الويب ومن iOS سواء ===== */
create or replace function public.case_member_notify()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_title text; v_num text; v_by text;
begin
  if new.member_id = public.my_member_id() then return new; end if;  -- لا يُشعر نفسه
  select coalesce(c.title, 'ملف'), c.office_num into v_title, v_num
    from cases c where c.id = new.case_id;
  select coalesce(short_name, name) into v_by
    from team_members where id = new.added_by;

  insert into notifications (type, title, message, recipient_id, case_id)
  values ('case_shared',
          'أُضفت إلى ملف ' || coalesce(v_num, v_title),
          coalesce(v_by || ' أضافك — ', '') || left(v_title, 120),
          new.member_id, new.case_id);
  return new;
exception when others then
  return new;   -- الإشعار لا يُفشل الإضافة
end $$;

drop trigger if exists case_member_notify_trg on public.case_members;
create trigger case_member_notify_trg
  after insert on public.case_members
  for each row execute function public.case_member_notify();

commit;
