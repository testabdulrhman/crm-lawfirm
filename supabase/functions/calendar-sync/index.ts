import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// كل الأسرار تُقرأ من Supabase Secrets (لا تُكتب في الكود).
const GOOGLE_CLIENT_ID     = Deno.env.get("GOOGLE_CLIENT_ID")     ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const GOOGLE_REFRESH_TOKEN = Deno.env.get("GOOGLE_REFRESH_TOKEN") ?? "";
const DEFAULT_CALENDAR_ID  = Deno.env.get("GOOGLE_CALENDAR_ID")   ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// الإعدادات القابلة للتحرير من الواجهة (الإعدادات ← التكاملات):
// lookup_values (type='integration_config'): google_calendar_enabled / google_calendar_id
// عند غيابها: مفعّل + تقويم المنصة الافتراضي (السرّ) — جاهزية SaaS.
async function getCalendarConfig(): Promise<{ enabled: boolean; calendarId: string }> {
  let enabled = true;
  let calendarId = DEFAULT_CALENDAR_ID;
  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data } = await supabase
      .from("lookup_values")
      .select("label, value")
      .eq("type", "integration_config")
      .in("label", ["google_calendar_enabled", "google_calendar_id"]);
    for (const row of data ?? []) {
      if (row.label === "google_calendar_enabled") enabled = row.value !== "false";
      if (row.label === "google_calendar_id" && (row.value ?? "").trim() !== "")
        calendarId = String(row.value).trim();
    }
  } catch (_) {
    /* تعذّرت القراءة — نستخدم الافتراضي */
  }
  return { enabled, calendarId };
}

// Get fresh access token
async function getAccessToken(): Promise<string> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error("Google secrets not configured (GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN)");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type:    "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("Failed to get access token: " + JSON.stringify(data));
  return data.access_token;
}

// تذكير موحّد: إشعار منبثق قبل 10 دقائق فقط (بدون بريد)
const REMINDERS = {
  useDefault: false,
  overrides: [
    { method: "popup", minutes: 10 },
  ],
};

/**
 * بداية ونهاية الحدث بتوقيت الرياض.
 *
 * ⚠️ العطل الذي أُصلح (2026-08-16): كانت النهاية تُحسب حسابياً
 *    `Math.floor(total/60) % 24` وتُلصق **بتاريخ البداية نفسه**. فموعد
 *    23:30 + 30 دقيقة يعطي نهاية `00:00` من *نفس اليوم* — أي قبل البداية
 *    بـ23 ساعة، فيرفضه Google بـ`timeRangeEmpty` ويفشل أي حدث يعبر منتصف
 *    الليل. الآن تُحسب النهاية تاريخاً حقيقياً فيتدحرج اليوم تلقائياً.
 *    (السعودية بلا توقيت صيفي، فالإزاحة +03:00 ثابتة.)
 */
function buildTimes(date: string, time: string | null, durationMinutes: number) {
  // تطبيع الوقت إلى HH:MM (قاعدة البيانات قد ترجعه HH:MM:SS)
  const t = (time || "09:00").slice(0, 5);
  const startDateTime = `${date}T${t}:00+03:00`;
  const start = new Date(startDateTime);
  const end = new Date(start.getTime() + (durationMinutes || 60) * 60_000);
  // نطبع النهاية بتوقيت الرياض: نزيح +3 ساعات ثم نصوغها ISO ونلحق الإزاحة
  const shifted = new Date(end.getTime() + 3 * 3_600_000);
  const endDateTime = `${shifted.toISOString().slice(0, 19)}+03:00`;
  return { startDateTime, endDateTime };
}

// إضافة حدث جلسة قضية
async function addSessionEvent(accessToken: string, calendarId: string, session: any, caseTitle: string) {
  const { startDateTime, endDateTime } = buildTimes(session.session_date, session.session_time, 60);
  const event = {
    summary: `⚖️ ${caseTitle}`,
    description: [
      session.title ? `الجلسة: ${session.title}` : "",
      session.court ? `المحكمة: ${session.court}` : "",
      session.preparation ? `التحضير: ${session.preparation}` : "",
    ].filter(Boolean).join("\n"),
    location: session.court || "",
    start: { dateTime: startDateTime, timeZone: "Asia/Riyadh" },
    end:   { dateTime: endDateTime,   timeZone: "Asia/Riyadh" },
    reminders: REMINDERS,
    colorId: "9", // أزرق للجلسات
  };
  return await postEvent(accessToken, calendarId, event);
}


/** رابط Google Meet من رد الحدث (يظهر في hangoutLink أو entryPoints) */
function meetLinkOf(event: any): string | null {
  if (event?.hangoutLink) return String(event.hangoutLink);
  const ep = event?.conferenceData?.entryPoints;
  if (Array.isArray(ep)) {
    const v = ep.find((e: any) => e?.entryPointType === "video")?.uri;
    if (v) return String(v);
  }
  return null;
}

// إضافة حدث موعد عميل
async function addAppointmentEvent(accessToken: string, calendarId: string, appointment: any) {
  const { startDateTime, endDateTime } = buildTimes(
    appointment.appointment_date,
    appointment.appointment_time,
    appointment.duration_minutes || 60,
  );
  // الموعد عن بُعد ← نطلب من Google إنشاء رابط Meet مع الحدث نفسه
  // (طلب المستخدم 2026-08-26). قيم الطريقة من صفحة الحجز: remote / onsite.
  const isRemote = ["remote", "online", "عن بعد"].includes(
    String(appointment.meeting_method ?? "").trim(),
  );

  const event: any = {
    summary: `📅 موعد: ${appointment.client_name || "عميل"}`,
    description: [
      appointment.client_phone ? `الجوال: ${appointment.client_phone}` : "",
      appointment.notes ? `ملاحظات: ${appointment.notes}` : "",
    ].filter(Boolean).join("\n"),
    start: { dateTime: startDateTime, timeZone: "Asia/Riyadh" },
    end:   { dateTime: endDateTime,   timeZone: "Asia/Riyadh" },
    reminders: REMINDERS,
    colorId: "10", // أخضر للمواعيد
  };

  if (isRemote) {
    event.conferenceData = {
      createRequest: {
        // معرّف فريد للطلب — Google يرفض تكرار المعرّف بحدث آخر
        requestId: `redwan-${appointment.id ?? crypto.randomUUID()}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    };
  }

  return await postEvent(accessToken, calendarId, event, isRemote);
}

async function postEvent(
  accessToken: string,
  calendarId: string,
  event: any,
  withMeet = false,
) {
  // ⚠️ بلا conferenceDataVersion=1 يتجاهل Google طلب إنشاء الاجتماع بصمت
  const qs = withMeet ? "?conferenceDataVersion=1" : "";
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events${qs}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(event),
    }
  );
  const result = await res.json();
  if (!res.ok) {
    // سبب Google بالعربية حيث أمكن — الواجهة تعرضه للموظف بدل رسالة عامة
    const reason = result?.error?.errors?.[0]?.reason ?? "";
    const readable =
      reason === "timeRangeEmpty"
        ? "وقت نهاية الحدث لا يلي بدايته."
        : reason === "notFound"
          ? "التقويم غير موجود أو لا صلاحية عليه — راجع الإعدادات ← التكاملات."
          : reason === "forbidden"
            ? "لا صلاحية للكتابة في هذا التقويم."
            : result?.error?.message ?? "خطأ غير معروف من Google";
    throw new Error(`تعذّرت الكتابة في التقويم: ${readable}`);
  }
  return result;
}

async function deleteCalendarEvent(accessToken: string, calendarId: string, googleEventId: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${googleEventId}`,
    { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return res.ok;
}

serve(async (req) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    // action: config | add | add-appointment | delete
    // للتوافق مع v1: action='add' بدون type يعامل كجلسة
    const { action, type, session, appointment, caseTitle, googleEventId } = body;
    const json = (o: any, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const cfg = await getCalendarConfig();

    // إرجاع الإعدادات الفعّالة (للواجهة)
    if (action === "config") {
      return json({ success: true, enabled: cfg.enabled, calendarId: cfg.calendarId });
    }

    // التعطيل يجعل المزامنة لا-عملية (بنجاح صامت)
    if (!cfg.enabled) return json({ success: true, skipped: true, reason: "sync disabled" });
    if (!cfg.calendarId) return json({ error: "لم يُحدَّد معرّف التقويم — أضِفه من الإعدادات ← التكاملات" }, 400);

    const accessToken = await getAccessToken();

    if (action === "add" || action === "add-session") {
      if (type === "appointment" || appointment) {
        if (!appointment) return json({ error: "appointment required" }, 400);
        const event = await addAppointmentEvent(accessToken, cfg.calendarId, appointment);
        return json({ success: true, eventId: event.id, htmlLink: event.htmlLink, meetLink: meetLinkOf(event) });
      }
      if (!session || !caseTitle) return json({ error: "session and caseTitle required" }, 400);
      const event = await addSessionEvent(accessToken, cfg.calendarId, session, caseTitle);
      return json({ success: true, eventId: event.id, htmlLink: event.htmlLink });
    }

    if (action === "add-appointment") {
      if (!appointment) return json({ error: "appointment required" }, 400);
      const event = await addAppointmentEvent(accessToken, cfg.calendarId, appointment);
      return json({ success: true, eventId: event.id, htmlLink: event.htmlLink, meetLink: meetLinkOf(event) });
    }

    if (action === "delete") {
      if (!googleEventId) return json({ error: "googleEventId required" }, 400);
      await deleteCalendarEvent(accessToken, cfg.calendarId, googleEventId);
      return json({ success: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
