-- إشعار النقاش يزول بقراءة النقاش (طلب المدير 2026-10-06: «لما يجيني اشعار … بشأن مناقشة، وأدخل على
-- المناقشة بدون ما اضغط على التنبيه، مفروض انه يروح التنبيه، مو يبقى»).
-- الويب والآيفون يعلّمان قراءة النقاش في case_reads عند فتحه ومع كل رسالة جديدة (إيصالات القراءة)؛ فيكفي
-- ترقر هنا: كل منشن له في هذا النقاش وصل قبل وقت القراءة يُعلَّم مقروءاً — بلا تحديث للتطبيق.

create or replace function public.clear_mentions_on_read()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  update notifications
     set is_read = true
   where recipient_id = new.member_id
     and type = 'mention'
     and not is_read
     and case_id is not distinct from new.case_id
     and created_at <= coalesce(new.read_at, now()) + interval '5 seconds';
  return new;
exception when others then
  return new; -- ثانوي — لا يمنع تعليم القراءة
end $function$;
revoke all on function public.clear_mentions_on_read() from public, anon, authenticated;

drop trigger if exists case_reads_clear_mentions_trg on public.case_reads;
create trigger case_reads_clear_mentions_trg
  after insert or update of read_at on public.case_reads
  for each row execute function public.clear_mentions_on_read();

-- رجعياً: ما قُرئ نقاشه بعد وصوله
update public.notifications n
   set is_read = true
  from public.case_reads r
 where n.type = 'mention' and not n.is_read
   and r.member_id = n.recipient_id
   and r.case_id is not distinct from n.case_id
   and r.read_at >= n.created_at;
