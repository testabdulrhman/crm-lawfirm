-- بحث غير حساس للهمزات/التاء المربوطة/الألف المقصورة/التشكيل (طلب المستخدم 2026-08-23)
-- «محكمه» تجد «المحكمة» و«احمد» يجد «أحمد».
-- نفس القاعدة في src/lib/arabic.ts (الويب) وArabicSearch.swift (التطبيق) — عدّل الثلاثة معاً.
--
-- ⚠️ الحروف بأرقام يونيكود (chr) عمداً: النص الحرفي وصل مفكك الهمزات عبر
--    قناة النشر (NFD) فاختلت مواضع translate — درس مسجّل.
-- أ=1571 إ=1573 آ=1570 ٱ=1649 ة=1577 ى=1609 ← ا=1575 (×4) ه=1607 ي=1610
-- التشكيل 1611-1618 + الخنجرية 1648 + التطويل 1600

create or replace function public.ar_norm(s text) returns text
language sql immutable parallel safe as $$
  select translate(
    regexp_replace(
      lower(coalesce(s, '')),
      '[' || chr(1611) || '-' || chr(1618) || chr(1648) || chr(1600) || ']',
      '', 'g'
    ),
    chr(1571) || chr(1573) || chr(1570) || chr(1649) || chr(1577) || chr(1609),
    chr(1575) || chr(1575) || chr(1575) || chr(1575) || chr(1607) || chr(1610)
  );
$$;

grant execute on function public.ar_norm(text) to authenticated, anon;

-- global_search أعيدت كتابتها لتقارن ar_norm(العمود) LIKE ar_norm(النص)
-- على القضايا (title/office_num/court_num) وجهات الاتصال (name) والوكالات
-- (client_name/agent_name)؛ الأرقام والهواتف بقيت ILIKE خاماً.
-- (النص الكامل مطبّق على الإنتاج عبر MCP بترحيل arabic_normalized_search)
