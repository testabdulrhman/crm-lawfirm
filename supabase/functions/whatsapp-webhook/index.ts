import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================
// whatsapp-webhook — استقبال رسائل واتساب الواردة من Hatif.io + الرد الآلي
// v5 (2026-09-01): استبدال مستقبل Evolution القديم بويبهوك هاتف الرسمي.
// v6 (2026-09-01): موزّع — هاتف يقبل رابط ويبهوك واحداً والمستخدم عنده نظامان
//   (هذا النظام + crm-iflas)، فنحن نقطة الاستقبال ونمرر الحمولة الخام حرفياً
//   للنظام الآخر (whatsapp_config/forward_webhook_url) قبل معالجتنا.
// v7 (2026-09-01): توجيه بالملكية — الرقم المسجل دائناً في crm-iflas رسالته
//   لذلك النظام (تمرير فقط، لا صندوق ولا رد آلي عندنا)؛ وغير المسجل عميلُ
//   محاماة يتبنّاه نظامنا. الفحص عبر RPC سرّي هناك (phone_is_creditor)،
//   وإعداده في whatsapp_config/iflas_check. تعذُّر الفحص = نسجّل بلا رد
//   (لا نخاطر بتحية محاماة تصل دائن إفلاس).
//
// التسجيل في لوحة هاتف: الإعدادات ← API Connect ← رابط Webhook الواتساب:
//   https://<project>.supabase.co/functions/v1/whatsapp-webhook?secret=<السر>
// السر في lookup_values (whatsapp_config/webhook_secret) — نمط sms-inbox.
//
// السلوك:
//  • وارد فقط (direction=Inbound) — يُسجل في sms_log بحالة incoming
//    فيظهر في صفحة /inbox أسوة برسائل SMS الواردة.
//  • رد آلي بنص قالب wa_auto_reply (يحرَّر من الإعدادات ← القوالب —
//    نسخة الواتساب وإلا النصية) — مرة واحدة لكل رقم كل ٢٤ ساعة.
//  • الرد نص حر مسموح دائماً هنا: العميل بدأ فنافذة الـ٢٤ ساعة مفتوحة.
// =============================================================

const HATIF_BASE = "https://api.voxa.sa";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

interface HatifConfig { client_id: string; client_secret: string; channel_id?: string }

async function lookupValue(type: string, label: string): Promise<string | null> {
  const { data } = await supabase
    .from("lookup_values").select("value").eq("type", type).eq("label", label).maybeSingle();
  return (data?.value as string | undefined) ?? null;
}

async function readConfig(): Promise<HatifConfig | null> {
  const raw = await lookupValue("whatsapp_config", "hatif");
  if (raw) {
    try {
      const c = JSON.parse(raw);
      if (c.client_id && c.client_secret) return c as HatifConfig;
    } catch (_) { /* تالفة */ }
  }
  return null;
}

let tokenCache: { token: string; exp: number } | null = null;
async function getToken(cfg: HatifConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.exp > now + 60_000) return tokenCache.token;
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
  if (!data.access_token) throw new Error(`hatif login failed (${res.status})`);
  tokenCache = { token: data.access_token, exp: now + (Number(data.expires_in) || 3600) * 1000 };
  return data.access_token;
}

// وصف بشري لغير النصي — يظهر في /inbox
function describe(messageType: string, body: string | null, mediaUrl: string | null): string {
  if (body && body.trim()) return body.trim();
  const label: Record<string, string> = {
    Image: "📷 صورة", Video: "🎥 مقطع", Audio: "🎙️ رسالة صوتية",
    Document: "📎 مستند", Location: "📍 موقع", Sticker: "ملصق", Contact: "بطاقة جهة اتصال",
  };
  const l = label[messageType] ?? "رسالة";
  return mediaUrl ? `${l}: ${mediaUrl}` : l;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // بوابة السر — نفس نمط sms-inbox
  const secret = new URL(req.url).searchParams.get("secret") ?? "";
  const expected = await lookupValue("whatsapp_config", "webhook_secret");
  if (!expected || secret !== expected) return json({ error: "unauthorized" }, 401);

  const raw = await req.text();
  let ev: Record<string, unknown>;
  try { ev = JSON.parse(raw); } catch { return json({ error: "bad json" }, 400); }

  // التمرير لنظام crm-iflas — نفس الحمولة الخام كأن هاتف أرسلها له مباشرة.
  // لا ننتظر رده ولا يفشلنا فشله (كلٌّ يعالج لنفسه).
  try {
    const fwd = await lookupValue("whatsapp_config", "forward_webhook_url");
    if (fwd && fwd.startsWith("http")) {
      const sig = req.headers.get("X-Voxa-Signature");
      fetch(fwd, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sig ? { "X-Voxa-Signature": sig } : {}),
        },
        body: raw,
        signal: AbortSignal.timeout(8000),
      }).catch(() => {/* فشل النظام الآخر شأنه — لا يعطل معالجتنا */});
    }
  } catch (_) { /* التمرير ثانوي */ }

  const direction = String(ev.direction ?? "");
  const messageType = String(ev.messageType ?? "");
  // نتجاهل الصادر وإشعارات التعديل/الحذف — همنا الوارد الحقيقي فقط
  if (direction !== "Inbound") return json({ ok: true, skipped: "outbound" });
  if (messageType === "MessageEdited" || messageType === "MessageDeleted" || messageType === "Unsupported")
    return json({ ok: true, skipped: messageType });

  const cfg = await readConfig();
  if (!cfg) return json({ error: "no hatif config" }, 500);

  // الحمولة تحمل معرف جهة الاتصال لا رقمها — نجلبه
  let phone = "";
  let name = "واتساب وارد";
  try {
    const token = await getToken(cfg);
    const res = await fetch(`${HATIF_BASE}/v1/contacts/${ev.contactId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const c = await res.json().catch(() => ({}));
    phone = String(c.phone ?? c.phoneNumber ?? "").replace(/\D/g, "");
    if (c.name) name = String(c.name);
  } catch (_) { /* بلا رقم نسجل الوارد ولا نرد */ }

  // توجيه بالملكية: دائن إفلاس؟ رسالته لنظام crm-iflas (مُرّرت له فوق) — نسكت
  // null = تعذّر الفحص: نسجل الوارد عندنا احتياطاً لكن بلا رد آلي
  let isCreditor: boolean | null = null;
  if (phone) {
    try {
      const rawCfg = await lookupValue("whatsapp_config", "iflas_check");
      if (rawCfg) {
        const ic = JSON.parse(rawCfg);
        const res = await fetch(`${ic.url}/rest/v1/rpc/phone_is_creditor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: ic.anon_key,
            Authorization: `Bearer ${ic.anon_key}`,
          },
          body: JSON.stringify({ p_phone: phone, p_secret: ic.secret }),
          signal: AbortSignal.timeout(6000),
        });
        if (res.ok) isCreditor = (await res.json()) === true;
      }
    } catch (_) { /* يبقى null */ }
  }
  if (isCreditor === true) return json({ ok: true, routed: "crm-iflas" });

  const text = describe(messageType, (ev.body as string) ?? null, (ev.mediaUrl as string) ?? null);

  // منع التكرار عند إعادة إرسال الويبهوك: نفس الرقم ونفس النص خلال دقيقتين
  try {
    const twoMinAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: dup } = await supabase
      .from("sms_log").select("id").eq("status", "incoming")
      .eq("phone", phone || "unknown").eq("message", text)
      .gte("created_at", twoMinAgo).limit(1);
    if (dup && dup.length) return json({ ok: true, skipped: "duplicate" });
  } catch (_) { /* الفحص ثانوي */ }

  // ١) تسجيل الوارد — يظهر في /inbox
  await supabase.from("sms_log").insert({
    recipient_name: name,
    phone: phone || "unknown",
    message: text,
    status: "incoming",
    sent_by: "whatsapp",
  });

  // ٢) الرد الآلي — مرة كل ٢٤ ساعة لكل رقم (وفقط حين تأكدنا أنه ليس دائناً)
  let replied = false;
  if (phone && isCreditor === false) {
    const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const { data: recent } = await supabase
      .from("sms_log").select("id").eq("phone", phone)
      .eq("sent_by", "wa-auto-reply").gte("created_at", dayAgo).limit(1);

    if (!recent || recent.length === 0) {
      const { data: tpl } = await supabase
        .from("message_templates")
        .select("body, body_whatsapp, is_active")
        .eq("key", "wa_auto_reply").maybeSingle();
      const replyText = (tpl?.body_whatsapp as string) || (tpl?.body as string) || "";

      if (tpl?.is_active !== false && replyText.trim()) {
        let ok = false;
        try {
          const token = await getToken(cfg);
          const res = await fetch(`${HATIF_BASE}/v1/whatsapp/service-account/sendText`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              ChannelId: cfg.channel_id,
              ToNumber: phone,
              Text: replyText,
            }),
          });
          ok = res.ok;
        } catch (_) { ok = false; }
        await supabase.from("sms_log").insert({
          recipient_name: name,
          phone,
          message: replyText,
          status: ok ? "sent" : "failed",
          sent_by: "wa-auto-reply",
        });
        replied = ok;
      }
    }
  }

  return json({ ok: true, replied });
});
