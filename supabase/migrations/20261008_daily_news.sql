-- «خبر اليوم» (قرار المدير 2026-10-08: «ودي كل يوم آخذ منها خبر يطلع لنا في التطبيق» — للفريق داخل التطبيق فقط).
-- المصدر أساب للنشر (publishing.asap.sa/api/news). دالة daily-news تختار كل صباح خبراً واحداً هو الأقرب لعمل
-- المكتب وتكتب له سطر «لماذا يهمّنا» — وقد لا تختار شيئاً إن لم يكن في اليوم ما يخصنا. لا نص منسوخ يُعرض:
-- العنوان وسطرنا ورابط للمصدر. وصف المصدر يُحفظ للاختيار وحده.
create table if not exists public.daily_news (
  id            uuid primary key default gen_random_uuid(),
  day           date not null unique,                 -- يوم العرض (توقيت الرياض)
  source        text not null default 'asap',
  source_slug   text not null,
  title         text not null,
  category      text,
  url           text not null,
  why           text not null,                        -- «لماذا يهمّنا» — من صياغتنا
  published_at  timestamptz,
  candidates    int,
  created_at    timestamptz not null default now()
);
create unique index if not exists daily_news_slug on public.daily_news(source, source_slug);

alter table public.daily_news enable row level security;
revoke all on public.daily_news from anon;
revoke insert, update, delete on public.daily_news from authenticated;
drop policy if exists daily_news_read on public.daily_news;
-- الفريق وحده — المتعاون الخارجي لا يراه (صفحاته مقصورة على ملفاته)
create policy daily_news_read on public.daily_news for select to authenticated
  using ((select my_member_id()) is not null and not (select is_collaborator_caller()));
