import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================
// session-reminders — تذكير المحامين بالجلسات
// type=day   : قبل الجلسة بيوم (يوميّاً 5 مساءً بتوقيت الرياض)
// type=30min : قبل الجلسة بنص ساعة (كل 10 دقائق)
//
// v4 (2026-08-30): إشعار تطبيق بدل SMS — قرار المستخدم:
//     «ما أحتاجها SMS أو واتساب — يكفي الإشعار بالتطبيق».
//     إدراج في notifications = دفع تلقائي للجوال (APNs) + جرس الويب،
//     والإشعار مربوط بالقضية (case_id) فالنقرة تفتحها.
//     الوسم reminder_*_sent_at يوضع فقط عند نجاح الإدراج — وإلا تُعاد
//     المحاولة في الدورة التالية (درس الفشل الصامت أيام الواتساب المحظور).
// =============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

function formatTime(t: string | null): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  let h = parseInt(hStr, 10);
  const m = mStr || "00";
  const period = h >= 12 ? "مساءً" : "صباحاً";
  if (h === 0) h = 12; else if (h > 12) h -= 12;
  return `${h}:${m} ${period}`;
}

Deno.serve(async (req) => {
  const results = { type: "", sent: 0, failed: 0, details: [] as string[] };

  let reminderType = "day";
  try {
    const body = await req.json();
    if (body?.type) reminderType = body.type;
  } catch (_) { /* الافتراضي day */ }
  results.type = reminderType;

  try {
    const rpcName = reminderType === "30min" ? "sessions_30min_reminders" : "sessions_day_reminders";
    const stampCol = reminderType === "30min" ? "reminder_30_sent_at" : "reminder_day_sent_at";

    const { data: sessions, error } = await supabase.rpc(rpcName);
    if (error) return json({ error: error.message }, 500);

    for (const s of (sessions || [])) {
      const title = reminderType === "30min" ? "⏰ جلستك بعد نصف ساعة" : "🔔 تذكير: جلسة غداً";
      const parts = [
        s.case_title || "قضية",
        `${s.session_date}${s.session_time ? " — " + formatTime(s.session_time) : ""}`,
      ];
      if (s.court) parts.push(s.court);
      const message = parts.join("\n");

      const { error: insErr } = await supabase.from("notifications").insert({
        type: "session_reminder",
        title,
        message,
        recipient_id: s.lawyer_id,
        case_id: s.case_id,
      });

      if (!insErr) {
        results.sent++;
        results.details.push(`✓ ${s.lawyer_name}: ${s.case_title}`);
        // الوسم يمنع التكرار — فقط بعد نجاح الإدراج
        await supabase.from("sessions").update({ [stampCol]: new Date().toISOString() }).eq("id", s.session_id);
      } else {
        results.failed++;
        results.details.push(`✗ ${s.lawyer_name}: ${insErr.message}`);
      }
    }

    return json({ success: true, channel: "app", ...results });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
