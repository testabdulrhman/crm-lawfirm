// تأكيد الموعد للموكّل — رسالة تختلف بنوع الاجتماع.
//
// ⚠️ لماذا دالة مستقلة يستدعيها مشغّل في القاعدة، لا تعديل داخل دالة booking:
//    ١. دالة الحجز تعمل ولا سبب لتعريضها لخطر — الفصل يمنع أي انحدار فيها.
//    ٢. المشغّل يلتقط **كل** موعد جديد: من الموقع ومن الإدخال اليدوي داخل
//       النظام ومن رسائل ناجز — لا الموقع وحده.
//
// حضوري  → رابط موقع المكتب من office_info.location_url
// عن بُعد → «يصلكم رابط الاجتماع قبل الموعد» (يُجهَّز لاحقاً ويُرسل مستقلاً)
//
// الحماية: verify_jwt. المشغّل يستدعيها بمفتاح service_role من داخل القاعدة.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

function normalizeSaudi(raw: string): string {
  let n = (raw ?? "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("00966")) n = n.slice(2);
  if (n.startsWith("0")) n = "966" + n.slice(1);
  else if (!n.startsWith("966")) n = "966" + n;
  return n;
}

/** التاريخ بالميلادي والهجري معاً — كما يعرضه النظام في كل مكان */
function dualDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00+03:00`);
  if (isNaN(d.getTime())) return iso;
  const greg = d.toLocaleDateString("ar", {
    day: "2-digit", month: "2-digit", year: "numeric", numberingSystem: "latn",
  });
  // Intl قد يُلحق «هـ» بنفسه — ننزعها ثم نضيفها مرة واحدة
  const hijri = d
    .toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", {
      day: "2-digit", month: "2-digit", year: "numeric",
    })
    .replace(/\s*هـ\s*$/, "");
  return `${greg}م (${hijri}هـ)`;
}

function arabicTime(hhmm: string): string {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  const period = h >= 12 ? "مساءً" : "صباحاً";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

async function getTemplate(key: string): Promise<string | null> {
  try {
    const { data } = await admin.from("message_templates").select("body").eq("key", key).maybeSingle();
    return data?.body ?? null;
  } catch (_) { return null; }
}

async function getLocation(): Promise<string> {
  try {
    const { data } = await admin.from("office_info").select("location_url, address").limit(1).maybeSingle();
    // حتى يُضبط الرابط نرسل العنوان النصي بدل فراغ محرج
    return data?.location_url || data?.address || "";
  } catch (_) { return ""; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "JSON غير صالح" }, 400); }

  const id = String(body?.appointment_id ?? "").trim();
  const kind = String(body?.kind ?? "confirm"); // confirm | meeting_link
  if (!id) return json({ error: "appointment_id مطلوب" }, 400);

  const { data: a, error } = await admin
    .from("appointments")
    .select("id, client_name, client_phone, appointment_date, appointment_time, meeting_method, reference_no, meeting_link, confirmation_sent_at, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !a) return json({ error: "الموعد غير موجود" }, 404);

  // لا نُرسل مرتين لنفس الموعد (المشغّل قد يُستدعى مجدداً)
  if (kind === "confirm" && a.confirmation_sent_at) {
    return json({ ok: true, skipped: "أُرسل التأكيد سابقاً" });
  }
  if (a.status === "cancelled") return json({ ok: true, skipped: "الموعد ملغى" });

  const phone = normalizeSaudi(String(a.client_phone ?? ""));
  if (!/^9665\d{8}$/.test(phone)) {
    return json({ ok: true, skipped: "لا يوجد رقم جوال صالح" });
  }

  const isRemote = a.meeting_method === "remote";
  const name = a.client_name || "عميلنا";
  const key = kind === "meeting_link"
    ? "appt_meeting_link"
    : isRemote ? "appt_confirm_remote" : "appt_confirm_onsite";

  if (kind === "meeting_link" && !a.meeting_link) {
    return json({ error: "لا يوجد رابط اجتماع محفوظ على هذا الموعد" }, 400);
  }

  let tpl = await getTemplate(key);
  if (!tpl) {
    tpl = kind === "meeting_link"
      ? "مرحباً {name}\nرابط اجتماعكم بتاريخ {date} الساعة {time}:\n{link}"
      : isRemote
        ? "مرحباً {name}\nتم تأكيد موعدكم بتاريخ {date} الساعة {time}.\nاجتماع عن بُعد — يصلكم الرابط قبل الموعد.\nالرقم المرجعي: {reference}"
        : "مرحباً {name}\nتم تأكيد موعدكم بتاريخ {date} الساعة {time}.\n{location}\nالرقم المرجعي: {reference}";
  }

  const msg = tpl
    .replaceAll("{name}", name)
    .replaceAll("{date}", dualDate(String(a.appointment_date)))
    .replaceAll("{time}", arabicTime(String(a.appointment_time ?? "09:00")))
    .replaceAll("{reference}", a.reference_no ?? "")
    .replaceAll("{link}", a.meeting_link ?? "")
    .replaceAll("{location}", isRemote ? "" : await getLocation());

  let ok = false;
  let reason = "";
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/swift-endpoint`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ numbers: phone, msg }),
    });
    const d = await res.json().catch(() => null);
    ok = res.ok && (d?.code === "1" || d?.code === 1);
    if (!ok) reason = `HTTP ${res.status}${d?.message ? " — " + d.message : ""}`;
  } catch (e) {
    reason = String((e as Error)?.message || e);
  }

  // الأثر يُسجَّل نجح أم فشل — لا إرسال صامت (درس اعتمادات الصادر)
  try {
    await admin.from("sms_log").insert({
      recipient_name: name,
      phone,
      message: msg,
      status: ok ? "sent" : "failed",
      sent_by: "تأكيد تلقائي",
    });
  } catch (_) { /* التسجيل ثانوي */ }

  if (ok) {
    const stamp = kind === "meeting_link"
      ? { meeting_link_sent_at: new Date().toISOString() }
      : { confirmation_sent_at: new Date().toISOString() };
    try { await admin.from("appointments").update(stamp).eq("id", id); } catch (_) { /* الختم ثانوي */ }
  }

  return json({ ok, kind, method: a.meeting_method, reason: ok ? undefined : reason });
});
