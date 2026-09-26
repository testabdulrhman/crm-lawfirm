-- البحث بالأرقام من لوحة المفاتيح العربية (2026-09-26): «٢٦٠١١» لا تجد «CASE26011» —
-- لوحة المفاتيح العربية تكتب الأرقام الهندية والمخزّن لاتيني. تُوحَّد الأرقام الهندية (٠-٩)
-- والفارسية (۰-۹) إلى لاتينية. ونفس القاعدة في src/lib/arabic.ts وarNorm في iOS وامتداد المشاركة.
-- لا فهارس على ar_norm فتغييرها آمن.
create or replace function public.ar_norm(s text)
 returns text
 language sql
 immutable parallel safe
 set search_path to 'public'
as $function$
  select translate(
    translate(
      regexp_replace(
        lower(coalesce(s, '')),
        '[' || chr(1611) || '-' || chr(1618) || chr(1648) || chr(1600) || ']',
        '', 'g'
      ),
      chr(1571) || chr(1573) || chr(1570) || chr(1649) || chr(1577) || chr(1609),
      chr(1575) || chr(1575) || chr(1575) || chr(1575) || chr(1607) || chr(1610)
    ),
    '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
    '01234567890123456789'
  );
$function$;
