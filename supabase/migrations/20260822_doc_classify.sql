-- تصنيف المستندات بالذكاء (طلب المستخدم 2026-08-22: «ترفع ملفاً فيقترح
-- نوعه (حكم؟ لائحة؟ وكالة؟) وملفه»)
--
-- الترقر خادمي: أي مستند PDF/صورة جديد — من الويب أو التطبيق أو امتداد
-- المشاركة — يُرسل لدالة classify-doc التي تقرؤه وتكتب: التصنيف، وصفاً
-- موجزاً، ولو كان بلا ملف اقترحت ملفه (suggested_case_id) وردّت في خيط
-- رسالته في النقاش. نفس نمط ذكاء النقاش (pg_net + سر داخلي).

begin;

alter table public.documents
  add column if not exists category text,
  add column if not exists suggested_case_id uuid references public.cases(id) on delete set null;

comment on column public.documents.category is 'تصنيف الذكاء: حكم قضائي، لائحة/مذكرة، وكالة، عقد…';
comment on column public.documents.suggested_case_id is 'اقتراح الذكاء لملف مستندٍ رُفع بلا ملف';

-- عنوان الدالة — المفاتيح تُقرأ من discussion_ai_config الموجودة
insert into public.lookup_values (type, label, value)
select 'doc_ai_config', 'function_url',
       'https://zwaahunavepleczuamuy.supabase.co/functions/v1/classify-doc'
where not exists (
  select 1 from public.lookup_values where type='doc_ai_config' and label='function_url'
);

create or replace function public.document_ai_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  fn_url text;
  akey   text;
  secret text;
begin
  if new.deleted_at is not null then return new; end if;
  if new.category is not null then return new; end if;
  -- PDF وصور فقط، وبحجم معقول (حد نموذج الذكاء وتكلفته)
  if coalesce(new.file_type, '') !~ '^(application/pdf|image/)' then return new; end if;
  if coalesce(new.file_size, 0) > 8 * 1024 * 1024 or coalesce(new.file_size, 0) = 0 then return new; end if;

  select value into fn_url from public.lookup_values
   where type = 'doc_ai_config' and label = 'function_url' limit 1;
  select value into akey from public.lookup_values
   where type = 'discussion_ai_config' and label = 'anon_key' limit 1;
  select value into secret from public.lookup_values
   where type = 'discussion_ai_config' and label = 'inbound_secret' limit 1;
  if fn_url is null or akey is null or secret is null then return new; end if;

  perform net.http_post(
    url     := fn_url,
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'Authorization', 'Bearer ' || akey,
                 'x-ai-secret',   secret
               ),
    body    := jsonb_build_object('document_id', new.id)
  );
  return new;
exception when others then
  -- التصنيف ثانوي: لا يمنع حفظ المستند أبداً
  return new;
end; $$;

revoke execute on function public.document_ai_dispatch() from anon, public;

drop trigger if exists document_ai_trg on public.documents;
create trigger document_ai_trg
  after insert on public.documents
  for each row execute function public.document_ai_dispatch();

commit;
