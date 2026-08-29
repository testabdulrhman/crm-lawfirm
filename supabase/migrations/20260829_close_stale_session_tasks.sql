-- مهام تحضير الجلسة تفقد معناها بانقضاء الجلسة. بقاؤها «متأخّرة» يُفسد
-- مؤشر «المفوَّت = صفر» بضجيج، ويُغرق سلّم التصعيد بما لا يُعمل به —
-- فيتعوّد الفريق تجاهل التنبيه، وهو أسوأ ما يصيب نظام مهل.
-- تُقفل بحالة done مع ملاحظة صريحة أنها آلية (لا ادّعاء إنجاز).
-- طُبِّقت على الإنتاج 2026-08-29 وأغلقت ٤ مهام لجلسات ٢٢ و٢٦ أغسطس.

create or replace function public.close_stale_session_tasks()
returns int
language plpgsql security definer set search_path to 'public'
as $$
declare n int;
begin
  with stale as (
    select t.id from tasks t
    join sessions s on s.id = split_part(t.derived_key, ':', 2)::uuid
    where t.derived_key like 'session:%' and t.status = 'todo'
      and t.deleted_at is null
      and (s.session_date < current_date or s.closed_at is not null)
  )
  update tasks t
  set status='done', done_at=now(),
      notes = coalesce(t.notes || E'\n\n', '') ||
              '⚙️ أُقفلت آلياً: انقضت الجلسة فلم يعد لتحضيرها محل.'
  from stale where t.id = stale.id;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.close_stale_session_tasks() from anon, public;
-- تُستدعى في أول notify_deadline_ladder() — انظر 20260829_ladder_first_alert.sql
