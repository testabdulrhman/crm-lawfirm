-- نتيجة الجلسة كاملةً بأقسامها في outcome، وملخّص قصير منفصل للتقرير والقوائم (طلب المدير 2026-10-07:
-- «اشوف الملخص مرة قصير إذا سجل المحضر»). null = الجلسات السابقة — يُعرض outcome كما هو.
alter table public.sessions add column if not exists outcome_short text;
