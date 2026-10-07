// الهجري ← الميلادي بتقويم أم القرى — في الخادم لا بالنموذج.
// النموذج يقرأ الهجري من المستند صحيحاً لكنه يخطئ في تحويله بيوم (بلاغ المدير 2026-10-07: صكٌّ
// 1448/04/23 حُوِّل إلى 2026/10/05 والصحيح 2026/10/04). فيُطلب منه نقل الهجري كما ورد، ويُحوَّل هنا.

/** «1448/04/23 هـ»، «٢٣/٠٤/١٤٤٨»، «1448-4-23» ← YYYY-MM-DD ميلادي. null = لا يُفهم أو ليس تاريخاً صحيحاً */
export function hijriTextToISO(text: unknown): string | null {
  if (!text) return null;
  const latin = String(text)
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[۰-۹]/g, (c) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(c)));
  const n = (latin.match(/\d+/g) ?? []).map(Number);
  if (n.length < 3) return null;
  let y: number, m: number, d: number;
  if (n[0] >= 1300 && n[0] <= 1600) [y, m, d] = [n[0], n[1], n[2]];
  else if (n[2] >= 1300 && n[2] <= 1600) [d, m, y] = [n[0], n[1], n[2]];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 30) return null;
  const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
    year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC",
  });
  // ١ محرم ١ هـ ≈ 622-07-16؛ السنة الهجرية ≈ 354.367 يوماً — ثم بحث يوماً بيوم يطابقه تقويم ICU
  const approx = Date.UTC(622, 6, 16) + ((y - 1) * 354.367 + (m - 1) * 29.53 + (d - 1)) * 864e5;
  for (let off = -45; off <= 45; off++) {
    const t = new Date(approx + off * 864e5);
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    if (Number(p.year) === y && Number(p.month) === m && Number(p.day) === d) return t.toISOString().slice(0, 10);
  }
  return null;
}

/** الميلادي النهائي: من الهجري المقروء إن وُجد، وإلا الميلادي الوارد في المستند نفسه */
export const pickDate = (greg: unknown, hijri: unknown): string | null =>
  hijriTextToISO(hijri) ?? (/^\d{4}-\d{2}-\d{2}$/.test(String(greg ?? "")) ? String(greg) : null);

/** تعليمة التواريخ الموحّدة للنماذج */
export const HIJRI_RULE =
  "- التواريخ: انقل التاريخ الهجري كما ورد في حقله *_hijri (مثل 1448/04/23) ولا تحوّله بنفسك — يحوّله النظام بتقويم أم القرى. وإن ورد التاريخ ميلادياً فضعه في الحقل الميلادي YYYY-MM-DD.";
