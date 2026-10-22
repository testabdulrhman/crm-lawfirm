// «اليوم» بتوقيت الرياض (+03:00، بلا توقيت صيفي). الخادم يعمل بـUTC، فـtoISOString().slice(0,10)
// كان يُرجع تاريخ أمس بين منتصف الليل والثالثة فجراً بالرياض — فتُحسب مهمة اليوم «متأخرة»، وتغيب جلسات اليوم،
// وتُؤرَّخ الملفات والخطابات بالأمس (فحص 2026-10-22).
const RIYADH_MS = 3 * 3600 * 1000;

/** تاريخ اليوم في الرياض YYYY-MM-DD، أو بعد/قبل عدد أيام */
export function riyadhToday(plusDays = 0): string {
  return new Date(Date.now() + RIYADH_MS + plusDays * 86_400_000).toISOString().slice(0, 10);
}

/** السنة الجارية في الرياض — لترقيم السنة (CASE26… / OUT-26-…) */
export function riyadhYear(): number {
  return new Date(Date.now() + RIYADH_MS).getUTCFullYear();
}
