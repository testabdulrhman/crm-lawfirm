-- البحث في كل شيء، حتى داخل المستندات (طلب المدير 2026-11-03: «ودي البحث يكون يبحث عن كل شيء، حتى اللي داخل
-- المستندات يقدر يبحث فيهم»).
--  ١) document_texts: نص كل مستند — تكتبه دالة doc-text (Word وExcel نصاً، وPDF بطبقته النصية + قراءة الذكاء
--     لأن طبقة PDF العربية تخرج مكسورة «املوضوع»، والصور بقراءة الذكاء). يُقرأ لمن يرى المستند نفسه فقط.
--  ٢) doc_text_queue(): ما لم يُستخرج نصه بعد (والفاشل حتى ثلاث محاولات) — لمفتاح الخادم وحده.
--  ٣) global_search: المستندات (اسمها ووصفها ونصها مع مقتطف حول الكلمة) والمهام والصادر والأحكام فوق ما كان،
--     وحدٌّ لكل نوع كي لا يزاحم نوعٌ غيره، ومعرّف الملف ونوعه ورابط الملف للواجهة.

create table if not exists public.document_texts (
  document_id  uuid primary key references public.documents(id) on delete cascade,
  status       text not null default 'done' check (status in ('done', 'failed', 'skipped')),
  content      text,
  search_norm  text generated always as (public.ar_norm(content)) stored,
  source       text,            -- docx | xlsx | pdf | image
  pages        int,
  error        text,
  attempts     int not null default 1,
  model        text,
  in_tokens    int,
  out_tokens   int,
  extracted_at timestamptz not null default now()
);
comment on table public.document_texts is
  'نص المستندات للبحث (doc-text). يُقرأ لمن يرى المستند — والكتابة لمفتاح الخادم وحده.';

alter table public.document_texts enable row level security;
revoke all on public.document_texts from anon, authenticated;
grant select on public.document_texts to authenticated;
drop policy if exists document_texts_read on public.document_texts;
-- صلاحية المستند نفسه: الاستعلام الداخلي على documents يخضع لسياساتها هي
create policy document_texts_read on public.document_texts for select to authenticated
  using (exists (select 1 from public.documents d where d.id = document_texts.document_id));

create or replace function public.doc_text_queue(n int default 4)
 returns table(id uuid, name text, file_path text, file_url text, file_type text, file_size bigint)
 language sql
 stable
 security definer
 set search_path to 'public'
as $$
  select d.id, d.name, d.file_path, d.file_url, d.file_type, d.file_size
  from documents d
  left join document_texts t on t.document_id = d.id
  where d.deleted_at is null
    and d.file_url is not null
    and (t.document_id is null
         or (t.status = 'failed' and t.attempts < 3 and t.extracted_at < now() - interval '1 hour'))
  order by d.created_at desc
  limit greatest(1, least(n, 20));
$$;
revoke all on function public.doc_text_queue(int) from public, anon, authenticated;

drop function if exists public.global_search(text);
create function public.global_search(q text)
 returns table(kind text, id uuid, title text, subtitle text, status text, case_id uuid, url text, matter_kind text)
 language sql
 stable
 set search_path to 'public'
as $function$
  with term as (select '%' || ar_norm(trim(q)) || '%' as p, ar_norm(trim(q)) as t)
  (select 'case', c.id,
         coalesce(c.title, 'قضية بلا عنوان'),
         nullif(concat_ws(' · ',
           nullif('مكتب: ' || nullif(c.office_num,''), 'مكتب: '),
           nullif('محكمة: ' || nullif(c.court_num,''), 'محكمة: ')
         ), ''),
         c.status, c.id, null::text, c.kind
  from cases c, term
  where c.kind not in ('channel', 'dm')
    and (ar_norm(c.title) like term.p or ar_norm(c.office_num) like term.p or ar_norm(c.court_num) like term.p)
  order by c.created_at desc limit 10)
  union all
  (select 'contact', ct.id,
         coalesce(ct.name, 'بدون اسم'),
         nullif(concat_ws(' · ', nullif(ct.phone,''), nullif(ct.phone2,'')), ''),
         ct.category, null::uuid, null::text, null::text
  from contacts ct, term
  where ar_norm(ct.name) like term.p or ct.phone ilike term.p or ct.phone2 ilike term.p
  limit 8)
  union all
  (select 'poa', p.id,
         coalesce(p.client_name, 'وكالة'),
         nullif(concat_ws(' · ',
           nullif('رقم: ' || nullif(p.poa_number,''), 'رقم: '),
           nullif('وكيل: ' || nullif(p.agent_name,''), 'وكيل: ')
         ), ''),
         p.status, p.case_id, null::text, null::text
  from powers_of_attorney p, term
  where p.deleted_at is null
    and (p.poa_number ilike term.p or ar_norm(p.client_name) like term.p or ar_norm(p.agent_name) like term.p)
  limit 8)
  union all
  -- المستندات: الاسم والوصف والنص — والمقتطف حول أول موضع للكلمة في النص
  (select 'document', d.id,
         d.name,
         nullif(concat_ws(' · ',
           cs.title,
           case when strpos(t.search_norm, term.t) > 0 then
             '…' || regexp_replace(substr(t.search_norm, greatest(strpos(t.search_norm, term.t) - 45, 1), 130), E'\\s+', ' ', 'g') || '…'
           else nullif(d.description, '') end
         ), ''),
         null::text, d.case_id, d.file_url, cs.kind
  from documents d
  left join document_texts t on t.document_id = d.id
  left join cases cs on cs.id = d.case_id
  cross join term
  where d.deleted_at is null
    and (ar_norm(d.name) like term.p or ar_norm(d.description) like term.p or t.search_norm like term.p)
  order by (ar_norm(d.name) like term.p) desc, d.created_at desc
  limit 12)
  union all
  (select 'task', tk.id,
         coalesce(tk.title, 'مهمة'),
         nullif(concat_ws(' · ', cs.title, to_char(tk.due_date, 'YYYY/MM/DD')), ''),
         tk.status, tk.case_id, null::text, cs.kind
  from tasks tk
  left join cases cs on cs.id = tk.case_id
  cross join term
  where tk.deleted_at is null
    and (ar_norm(tk.title) like term.p or ar_norm(tk.description) like term.p or ar_norm(tk.notes) like term.p)
  order by tk.created_at desc limit 8)
  union all
  (select 'outgoing', o.id,
         coalesce(o.subject, o.letter_number, 'خطاب'),
         nullif(concat_ws(' · ', o.letter_number, nullif('إلى ' || o.recipient, 'إلى '), to_char(o.letter_date, 'YYYY/MM/DD')), ''),
         null::text, o.case_id, o.file_url, null::text
  from outgoing_letters o, term
  where o.deleted_at is null
    and (ar_norm(o.subject) like term.p or ar_norm(o.letter_number) like term.p or ar_norm(o.recipient) like term.p
         or ar_norm(o.notes) like term.p)
  order by o.created_at desc limit 8)
  union all
  (select 'ruling', r.id,
         coalesce(r.title, 'حكم'),
         nullif(concat_ws(' · ', cs.title, nullif('رقم ' || r.ruling_number, 'رقم '), r.court_name), ''),
         r.outcome_short, r.case_id, r.document_url, cs.kind
  from rulings r
  left join cases cs on cs.id = r.case_id
  cross join term
  where ar_norm(r.title) like term.p or ar_norm(r.ruling_number) like term.p or ar_norm(r.summary) like term.p
  order by r.ruling_date desc nulls last limit 8)
  union all
  -- النقاش: يُرجع معرّف الملف كي تفتح النتيجة نقاشه مباشرةً
  (select 'discussion',
         coalesce(cc.case_id, cc.id),
         left(regexp_replace(cc.body, E'\\s+', ' ', 'g'), 90),
         nullif(concat_ws(' · ',
           coalesce(cs.title, 'عام — المكتب'),
           nullif(cs.office_num, ''),
           coalesce(tm.short_name, tm.name, case when cc.kind = 'ai' then 'الذكاء' end),
           to_char(cc.created_at, 'YYYY/MM/DD')
         ), ''),
         null::text, cc.case_id, null::text, cs.kind
  from case_comments cc
  left join cases cs on cs.id = cc.case_id
  left join team_members tm on tm.id = cc.author_id
  cross join term
  where cc.deleted_at is null
    and cc.body is not null
    and cc.kind <> 'system'
    and ar_norm(cc.body) like term.p
  order by cc.created_at desc limit 10);
$function$;
revoke execute on function public.global_search(text) from anon, public;
grant execute on function public.global_search(text) to authenticated;

-- ٤) الجدولة: دفعة من ثلاثة كل ثلاث دقائق — المستندات القائمة (~٩٤٠) في نحو يوم، والجديد خلال دقائق من رفعه
do $$
begin
  perform cron.unschedule('doc-text') where exists (select 1 from cron.job where jobname = 'doc-text');
  perform cron.schedule('doc-text', '*/3 * * * *', $c$select net.http_post(
    url := 'https://zwaahunavepleczuamuy.supabase.co/functions/v1/doc-text',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select value from public.lookup_values where type = 'discussion_ai_config' and label = 'anon_key' limit 1),
      'x-internal-secret', (select value from public.lookup_values where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1)),
    body := '{"limit":3}'::jsonb,
    timeout_milliseconds := 300000)$c$);
end $$;
