// الدوام: الأحد–الخميس 8ص–4م بتوقيت الرياض (UTC+3 طوال السنة، بلا توقيت صيفي).
// الإجازات الرسمية غير محسوبة — تُضاف لاحقاً إن لزم عبر جدول أيام مغلقة.

const RIYADH_OFFSET_MS = 3 * 3_600_000;
export const OPEN_HOUR = 8;
export const CLOSE_HOUR = 16;

export function isBusinessHours(at: Date): boolean {
  const r = new Date(at.getTime() + RIYADH_OFFSET_MS);
  const day = r.getUTCDay(); // 0 = الأحد
  const hour = r.getUTCHours();
  return day >= 0 && day <= 4 && hour >= OPEN_HOUR && hour < CLOSE_HOUR;
}
