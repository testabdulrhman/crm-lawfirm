-- صندوق الطلبات الواردة (طلب المدير 2026-11-21: «لا زال احس انها حوسه»): اللوحة صارت أقساماً —
-- يحتاج قرارك · عند المحامي · بانتظار رد العميل · راكد. هنا ما يلزم القسم الثالث والإغلاق:
--   close_reason: «اعتذرنا» (declined) غير «العميل ما رجع» (no_response) — ليُعرف كم عرضاً ضاع بلا رد
--   followup_count / last_followup_at: «ذكّره» بالواتساب على عرض لم يُرد عليه
alter table public.incoming_requests
  add column if not exists close_reason text,
  add column if not exists followup_count int not null default 0,
  add column if not exists last_followup_at timestamptz;

alter table public.incoming_requests drop constraint if exists incoming_requests_close_reason_chk;
alter table public.incoming_requests add constraint incoming_requests_close_reason_chk
  check (close_reason is null or close_reason in ('declined', 'no_response'));

-- المغلقة قبل اليوم كلها اعتذارات منا
update public.incoming_requests set close_reason = 'declined'
 where status = 'rejected' and close_reason is null;
