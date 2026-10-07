-- النقاش لحظي كالواتساب (طلب المدير 2026-10-07: «ليه التأخير، كيف أخليه مثل الواتس أب لحظي» ثم «نفذها»).
-- كان الويب يسأل كل ١٥ ثانية والآيفون كل ٤. صار الخادم يدفع كل تغيير في case_comments عبر Supabase Realtime
-- (postgres_changes)، ويُطبَّق على كل مشترك RLS الجدول نفسه بجلسته — فلا يصل أحداً نقاشٌ لا يراه
-- (القنوات الخاصة والمحادثات المباشرة على حواجزها). الحدث إشارةٌ فقط: الواجهة تعيد الجلب بدوالها المعتادة.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                  and schemaname = 'public' and tablename = 'case_comments') then
    alter publication supabase_realtime add table public.case_comments;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
                  and schemaname = 'public' and tablename = 'case_comment_reactions') then
    alter publication supabase_realtime add table public.case_comment_reactions;
  end if;
end $$;
