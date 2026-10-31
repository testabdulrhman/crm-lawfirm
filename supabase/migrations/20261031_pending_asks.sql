-- «ينتظرون ردك» (طلب المدير 2026-10-29: «بالنقاشات فيه الموظفين يرسلون لي بس انسى ارد عليهم أو انسى وش يبون
-- مني — فيه طريقة يجمّع وش المطلوب مني؟» ثم «ابنه لي لحالي الآن»).
-- دالة pending-asks تجمع المنشن الذي لم يُرد بعده والمحادثات المباشرة التي آخرها من الزميل، ويقرأ الذكاء سياقها
-- فيكتب سطراً بما يريده، ويُسقط ما لا يحتاج رداً. هنا حالة كل طلب. القياس يوم البناء: ٢٦ منشناً بلا رد في ٦٠ يوماً.

create table if not exists public.pending_asks (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.team_members(id) on delete cascade,  -- المطلوب منه
  case_id uuid references public.cases(id) on delete cascade,                    -- النقاش (ملف/قناة/محادثة)
  thread_root uuid,                                                               -- الخيط، أو null لمجرى النقاش
  anchor_comment_id uuid not null,                                                -- آخر رسالة في الطلب (للقفز)
  comment_ids uuid[] not null default '{}',                                       -- كل رسائل الطلب (لا تُعالج مرتين)
  asker_id uuid references public.team_members(id) on delete set null,
  ask text,                                                                       -- ما يريده بسطر واحد
  urgency text not null default 'normal' check (urgency in ('high', 'normal')),
  needs_reply boolean not null default true,
  status text not null default 'open'
    check (status in ('open', 'done', 'snoozed', 'answered', 'dismissed', 'tasked')),
  snooze_until date,
  task_id uuid references public.tasks(id) on delete set null,
  ask_at timestamptz not null,                                                    -- وقت آخر رسالة في الطلب
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, anchor_comment_id)
);
create index if not exists pending_asks_member_open on public.pending_asks (member_id, status);

alter table public.pending_asks enable row level security;
drop policy if exists pending_asks_own_select on public.pending_asks;
create policy pending_asks_own_select on public.pending_asks for select to authenticated
  using (member_id = public.my_member_id());
drop policy if exists pending_asks_own_update on public.pending_asks;
create policy pending_asks_own_update on public.pending_asks for update to authenticated
  using (member_id = public.my_member_id()) with check (member_id = public.my_member_id());
-- الإنشاء والمحتوى للخادم وحده؛ صاحب الطلب يغيّر حالته فقط
revoke all on public.pending_asks from anon, authenticated;
grant select on public.pending_asks to authenticated;
grant update (status, snooze_until, task_id, updated_at) on public.pending_asks to authenticated;

-- كل ساعة من ٥ صباحاً إلى ٩ مساءً بالرياض (٢–١٨ UTC) — الذكاء يُنادى للجديد فقط
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'pending-asks';
  perform cron.schedule('pending-asks', '20 2-18 * * *', $c$select net.http_post(
    url := 'https://zwaahunavepleczuamuy.supabase.co/functions/v1/pending-asks',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.lookup_values where type = 'discussion_ai_config' and label = 'anon_key' limit 1),
      'x-internal-secret', (select value from public.lookup_values where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1)),
    body := '{}'::jsonb)$c$);
end $$;
