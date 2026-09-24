import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================
// whatsapp-send — إرسال واتساب للمحاماة.
// v15 (2026-09-24): يمرّ عبر send-message في redwan-hub، البوابة الصادرة الوحيدة، فتشمله قائمة
//   الإيقاف وقاطع الطوارئ وتولّي الموظف وسجلٌّ واحد للصادر. ولا يُكلَّم هاتف من هنا بعد اليوم.
//   (النسخ السابقة كانت تكلّم هاتف مباشرة.)
// v6 (2026-08-30): استبدال بوابة Evolution المحظورة بواجهة هاتف.
// v9 (2026-09-01): ترويسة مستند في القالب { template: {..., document: {url, name}} }
//   — بها يصل عرض السعر PDF لأي عميل حتى خارج نافذة الـ٢٤ ساعة.
// v8 (2026-08-30): دعم القوالب المعتمدة { template: {name, lang?, params?} }
//   ورسالة عربية واضحة عند انغلاق نافذة الـ٢٤ ساعة (قاعدة واتساب الرسمي:
//   النص الحر مسموح فقط خلال ٢٤ ساعة من آخر رسالة واردة من العميل).
// الواجهة كما هي منذ v5: { phone, message?, recipient_name?, media_url?, file_name? }
// فكل نقاط النداء (تذكيرات الجلسات، الشكر، تقرير الجلسة، الخطابات) تعمل بلا تعديل.
//
// الأسرار: HUB_URL وHUB_SEND_KEY (مفتاح المحاماة في send-message)، وهي نفسها لمكتب الاستقبال.
// idempotency_key اختياري من المستدعي: من أعاد الطلب به لم تخرج الرسالة مرتين.
// يُسجّل كل إرسال في sms_log (sent_by=whatsapp).
// =============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// تطبيع رقم الجوال إلى صيغة دولية 9665XXXXXXXX
function normalizePhone(raw: string): string {
  let p = String(raw || "").replace(/\D/g, "");
  if (p.startsWith("00966")) p = p.slice(2);
  else if (p.startsWith("966")) { /* ok */ }
  else if (p.startsWith("0")) p = "966" + p.slice(1);
  else if (p.startsWith("5")) p = "966" + p;
  return p;
}

const WINDOW_CODE = "Voxa:WhatsApp:ServiceWindowExpired";   // يعرفه المستدعون (عرض السعر يرتد به إلى القالب)
const WINDOW_DETAIL =
  "نافذة الـ٢٤ ساعة مغلقة مع هذا الرقم — واتساب الرسمي لا يقبل نصاً حراً إلا بعد رد العميل. استخدم قالباً معتمداً أو أرسل SMS.";

/** الإرسال عبر send-message في الـ Hub، ونتيجته بصيغة هذه الدالة كما كانت */
async function viaHub(req: Record<string, unknown>): Promise<{ status: "sent" | "failed"; detail: string; code: string; queued?: boolean }> {
  const hub = Deno.env.get("HUB_URL");
  const key = Deno.env.get("HUB_SEND_KEY");
  if (!hub || !key) return { status: "failed", detail: "HUB_URL/HUB_SEND_KEY غير مضبوطين", code: "hub_not_configured" };
  let res: Response;
  try {
    res = await fetch(`${hub}/functions/v1/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-hub-key": key },
      body: JSON.stringify({ system: "law", ...req }),
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    return { status: "failed", detail: `تعذّر الوصول إلى الـ Hub: ${String((e as Error)?.message || e).slice(0, 200)}`, code: "hub_unreachable" };
  }
  const d = await res.json().catch(() => ({}));
  if (res.status === 200) return { status: "sent", detail: "", code: "" };
  // فشلٌ مؤقت من هاتف: الـ Hub يعيد المحاولة من طابوره، فالرسالة في طريقها
  if (res.status === 202) return { status: "sent", detail: "في طابور الإعادة", code: "", queued: true };
  const err = String(d?.error ?? "");
  if (err === "template_required") return { status: "failed", detail: WINDOW_DETAIL, code: WINDOW_CODE };
  return { status: "failed", detail: `(${res.status}) ${String(d?.message ?? err).slice(0, 300)}`, code: err };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json();
    const { phone, message, recipient_name, media_url, file_name, template } = body ?? {};

    if (!phone) return json({ error: "phone مطلوب" }, 400);
    if (!message && !media_url && !template?.name)
      return json({ error: "message أو media_url أو template مطلوب" }, 400);

    const num = normalizePhone(phone);
    if (num.length < 11) return json({ error: "رقم الجوال غير صحيح" }, 400);

    let status: "sent" | "failed" = "failed";
    let detail = "";
    let errCode = "";
    let queued = false;

    const idem = String(body?.idempotency_key ?? "").trim() || `whatsapp-send:${crypto.randomUUID()}`;
    let hubReq: Record<string, unknown>;
    if (template?.name) {
      // قالب معتمد مسبقاً — يفتح المحادثة حتى خارج نافذة الـ٢٤ ساعة، وترويسة المستند (PDF) إن وُجدت
      hubReq = {
        template: String(template.name),
        language: String(template.lang || "ar"),
        params: Array.isArray(template.params) ? template.params.map(String) : [],
        ...(template.document?.url
          ? { document: { url: String(template.document.url), name: String(template.document.name || "document.pdf") } }
          : {}),
      };
    } else if (media_url) {
      // ملف (مستند/PDF) مع تعليق اختياري — داخل النافذة
      hubReq = {
        document: { url: String(media_url), name: String(file_name || "document.pdf") },
        ...(message ? { body: String(message) } : {}),
      };
    } else {
      hubReq = { body: String(message) };
    }
    try {
      const r = await viaHub({ phone_e164: num, idempotency_key: idem, ...hubReq });
      status = r.status;
      detail = r.detail;
      errCode = r.code;
      queued = Boolean(r.queued);
    } catch (e) {
      detail = String((e as Error)?.message || e).slice(0, 300);
    }

    // تسجيل في sms_log
    try {
      await supabase.from("sms_log").insert({
        recipient_name: recipient_name || "واتساب",
        phone: num,
        message: template?.name
          ? `[قالب: ${template.name}] ${(Array.isArray(template.params) ? template.params : []).join(" | ")}`.trim()
          : media_url ? `[ملف: ${file_name || "مستند"}] ${message || ""}`.trim() : message,
        status,
        sent_by: "whatsapp",
      });
    } catch (_) { /* تجاهل */ }

    if (status === "sent") return json({ success: true, ...(queued ? { queued: true } : {}) });
    return json({ error: "تعذّر الإرسال عبر الواتساب", detail, code: errCode }, 502);
  } catch (e) {
    return json({ error: "خطأ غير متوقّع", detail: String((e as Error)?.message || e) }, 500);
  }
});
