import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================
// whatsapp-send — إرسال واتساب عبر Hatif.io (WhatsApp Business API الرسمي)
// v6 (2026-08-30): استبدال بوابة Evolution المحظورة بواجهة هاتف.
// v9 (2026-09-01): ترويسة مستند في القالب { template: {..., document: {url, name}} }
//   — بها يصل عرض السعر PDF لأي عميل حتى خارج نافذة الـ٢٤ ساعة.
// v8 (2026-08-30): دعم القوالب المعتمدة { template: {name, lang?, params?} }
//   ورسالة عربية واضحة عند انغلاق نافذة الـ٢٤ ساعة (قاعدة واتساب الرسمي:
//   النص الحر مسموح فقط خلال ٢٤ ساعة من آخر رسالة واردة من العميل).
// الواجهة كما هي منذ v5: { phone, message?, recipient_name?, media_url?, file_name? }
// فكل نقاط النداء (تذكيرات الجلسات، الشكر، تقرير الجلسة، الخطابات) تعمل بلا تعديل.
//
// الإعداد بنمط SaaS: صف lookup_values type='whatsapp_config' label='hatif'
// قيمته JSON: {"client_id":"…","client_secret":"…","channel_id":"…"}
// والاحتياط أسرار البيئة HATIF_CLIENT_ID / HATIF_CLIENT_SECRET / HATIF_CHANNEL_ID.
// channel_id اختياري — عند غيابه تُكتشف قناة الواتساب الأولى تلقائياً.
// يُسجّل كل إرسال في sms_log (sent_by=whatsapp).
// =============================================================

const HATIF_BASE = "https://api.voxa.sa";
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

interface HatifConfig { client_id: string; client_secret: string; channel_id?: string }

async function readConfig(supabase: ReturnType<typeof createClient>): Promise<HatifConfig | null> {
  const { data } = await supabase
    .from("lookup_values")
    .select("value")
    .eq("type", "whatsapp_config")
    .eq("label", "hatif")
    .maybeSingle();
  if (data?.value) {
    try {
      const c = JSON.parse(String(data.value));
      if (c.client_id && c.client_secret) return c as HatifConfig;
    } catch (_) { /* قيمة تالفة — ننزل للاحتياط */ }
  }
  const id = Deno.env.get("HATIF_CLIENT_ID");
  const secret = Deno.env.get("HATIF_CLIENT_SECRET");
  if (id && secret)
    return { client_id: id, client_secret: secret, channel_id: Deno.env.get("HATIF_CHANNEL_ID") || undefined };
  return null;
}

// كاش داخل عمر النسخة الدافئة — الرمز صالح ~١٥ يوماً والبرودة تعيد الدخول فحسب
let tokenCache: { token: string; exp: number; key: string } | null = null;
let channelCache: { id: string; key: string } | null = null;

async function getToken(cfg: HatifConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.key === cfg.client_id && tokenCache.exp > now + 60_000)
    return tokenCache.token;
  const res = await fetch(`${HATIF_BASE}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.client_id,
      client_secret: cfg.client_secret,
      grant_type: "client_credentials",
      scope: "VoxaAPI",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token)
    throw new Error(`دخول هاتف فشل (${res.status}): ${JSON.stringify(data).slice(0, 200)}`);
  tokenCache = {
    token: data.access_token,
    exp: now + (Number(data.expires_in) || 3600) * 1000,
    key: cfg.client_id,
  };
  return data.access_token;
}

async function getChannelId(cfg: HatifConfig, token: string): Promise<string> {
  if (cfg.channel_id) return cfg.channel_id;
  if (channelCache && channelCache.key === cfg.client_id) return channelCache.id;
  for (const t of ["Whatsapp", "PhoneNumberAndWhatsapp"]) {
    const res = await fetch(`${HATIF_BASE}/v1/channels/service-account?type=${t}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    const first = data?.items?.[0]?.id;
    if (res.ok && first) {
      channelCache = { id: String(first), key: cfg.client_id };
      return String(first);
    }
  }
  throw new Error("لا توجد قناة واتساب في حساب هاتف — تأكد من تفعيل القناة عندهم");
}

async function hatifPost(path: string, token: string, body: unknown): Promise<{ ok: boolean; detail: string; code: string }> {
  const res = await fetch(`${HATIF_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  const code = String(data?.error?.code ?? "");
  let detail = res.ok ? "" : `(${res.status}) ${JSON.stringify(data).slice(0, 400)}`;
  if (code === "Voxa:WhatsApp:ServiceWindowExpired")
    detail = "نافذة الـ٢٤ ساعة مغلقة مع هذا الرقم — واتساب الرسمي لا يقبل نصاً حراً إلا بعد رد العميل. استخدم قالباً معتمداً أو أرسل SMS.";
  return { ok: res.ok, detail, code };
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

    const cfg = await readConfig(supabase);
    if (!cfg)
      return json({ error: "إعدادات هاتف غير مكتملة — أضف client_id/client_secret في whatsapp_config", missing_config: true }, 500);

    let status: "sent" | "failed" = "failed";
    let detail = "";
    let errCode = "";

    try {
      const token = await getToken(cfg);
      const channelId = await getChannelId(cfg, token);

      if (template?.name) {
        // قالب معتمد مسبقاً — يفتح المحادثة حتى خارج نافذة الـ٢٤ ساعة
        const params: string[] = Array.isArray(template.params) ? template.params.map(String) : [];
        const parameters: unknown[] = [];
        // ترويسة مستند (PDF) — تُرسل الملف داخل القالب المعتمد
        if (template.document?.url) {
          parameters.push({
            Type: "Header",
            Values: [{
              Type: "document",
              DocumentUrl: String(template.document.url),
              DocumentFilename: String(template.document.name || "document.pdf"),
            }],
          });
        }
        if (params.length)
          parameters.push({ Type: "Body", Values: params.map((p) => ({ Type: "text", Text: p })) });
        const r = await hatifPost("/v1/whatsapp/service-account/sendTemplate", token, {
          ChannelId: channelId,
          TemplateName: String(template.name),
          Language: String(template.lang || "ar"),
          ToNumber: num,
          Parameters: parameters,
        });
        status = r.ok ? "sent" : "failed";
        detail = r.detail;
        errCode = r.code;
      } else if (media_url) {
        // ملف (مستند/PDF) مع تعليق اختياري — مفاتيح camelCase كما في وثائقهم
        const r = await hatifPost("/v1/whatsapp/service-account/sendFile", token, {
          channelId,
          toNumber: num,
          fileUrl: String(media_url),
          fileName: String(file_name || "document.pdf"),
          caption: message ? String(message) : undefined,
        });
        status = r.ok ? "sent" : "failed";
        detail = r.detail;
        errCode = r.code;
      } else {
        // نص فقط — مفاتيح PascalCase كما في وثيقة sendText
        const r = await hatifPost("/v1/whatsapp/service-account/sendText", token, {
          ChannelId: channelId,
          ToNumber: num,
          Text: String(message),
        });
        status = r.ok ? "sent" : "failed";
        detail = r.detail;
        errCode = r.code;
      }
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

    if (status === "sent") return json({ success: true });
    return json({ error: "تعذّر الإرسال عبر الواتساب", detail, code: errCode }, 502);
  } catch (e) {
    return json({ error: "خطأ غير متوقّع", detail: String((e as Error)?.message || e) }, 500);
  }
});
