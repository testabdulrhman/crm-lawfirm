// تسجيل فشل الدوال في «سجل الأخطاء» (/errors للمدير) — المراجعة الشاملة 2026-11-15 (الدفعة ٤، البند ٢):
// كانت المجدولات (ملخص الجلسة، تذكيرات الجلسات، محرك الإشعارات، ملخصا الدراسة) تفشل في console وحده فلا يدري أحد.
export async function logFnError(source: string, where: string, message: string): Promise<void> {
  const url = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/error_logs`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ source, error_type: where, message: `${where}: ${message}`.slice(0, 1000) }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch { /* التسجيل لا يُسقط الدالة */ }
}
