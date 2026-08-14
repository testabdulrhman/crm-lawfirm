// إرسال إشعار فوري (APNs) لأجهزة موظف — يخدم غرفة عمل المهام:
// منشن في نقاش، إسناد مهمة، طلب اعتماد، نتيجة اعتماد.
//
// ⚠️ الأسرار من Supabase Secrets ولا تُكتب في الكود إطلاقاً:
//    APNS_KEY_ID · APNS_TEAM_ID · APNS_BUNDLE_ID · APNS_PRIVATE_KEY (نص .p8)
//    APNS_ENV = sandbox | production   (التطوير sandbox، التوزيع production)
//
// التصميم: الدالة لا تفشل العملية الأصلية أبداً — الإشعار داخل النظام محفوظ
// مسبقاً، وهذه طبقة فوقه. لكنها **تسجّل** سبب الفشل في notifications.push_error
// بدل الصمت (درس فشل الرسائل الصامت في اعتمادات الصادر).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "sa.redwan.crm";
const PRIVATE_KEY = Deno.env.get("APNS_PRIVATE_KEY") ?? "";
const APNS_HOST =
  (Deno.env.get("APNS_ENV") ?? "sandbox") === "production"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** رمز مصادقة APNs (JWT بمفتاح ES256) — صالح ساعة، ونعيد توليده كل مرة. */
async function apnsToken(): Promise<string> {
  // مفتاح .p8 نصّاً → CryptoKey
  const pem = PRIVATE_KEY.replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  return create(
    { alg: "ES256", typ: "JWT", kid: KEY_ID },
    { iss: TEAM_ID, iat: getNumericDate(0) },
    key
  );
}

interface SendResult {
  token: string;
  ok: boolean;
  status?: number;
  reason?: string;
}

async function sendOne(
  jwt: string,
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<SendResult> {
  try {
    const res = await fetch(`${APNS_HOST}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": BUNDLE_ID,
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      body: JSON.stringify({
        aps: {
          alert: { title, body },
          sound: "default",
          badge: 1,
        },
        ...data, // route/taskId — يفتحها التطبيق عند الضغط
      }),
    });
    if (res.ok) return { token, ok: true, status: res.status };
    let reason = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (j?.reason) reason = j.reason;
    } catch (_) { /* النص الافتراضي */ }
    return { token, ok: false, status: res.status, reason };
  } catch (e) {
    return { token, ok: false, reason: String((e as Error)?.message || e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  if (!KEY_ID || !TEAM_ID || !PRIVATE_KEY) {
    // إعداد ناقص — نُبلغ صراحةً بدل الصمت، والإشعار داخل النظام قائم أصلاً
    return json(
      { error: "إعدادات APNs غير مكتملة على الخادم (APNS_KEY_ID/TEAM_ID/PRIVATE_KEY)." },
      500
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "طلب غير صالح" }, 400);
  }

  const memberIds: string[] = Array.isArray(body?.member_ids)
    ? body.member_ids.filter(Boolean)
    : [];
  const title = String(body?.title ?? "").trim();
  const message = String(body?.message ?? "").trim();
  const route = body?.route ? String(body.route) : null;
  const notificationIds: string[] = Array.isArray(body?.notification_ids)
    ? body.notification_ids
    : [];

  if (memberIds.length === 0 || !title) {
    return json({ error: "member_ids وtitle مطلوبان" }, 400);
  }

  // أجهزة المستلمين
  const { data: devices, error } = await admin
    .from("push_devices")
    .select("token, member_id")
    .in("member_id", memberIds);
  if (error) return json({ error: `تعذّرت قراءة الأجهزة: ${error.message}` }, 500);
  if (!devices || devices.length === 0) {
    return json({ success: true, sent: 0, note: "لا أجهزة مسجَّلة لهؤلاء" });
  }

  const jwt = await apnsToken();
  const results = await Promise.all(
    devices.map((d) =>
      sendOne(jwt, d.token as string, title, message, route ? { route } : {})
    )
  );

  const sent = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);

  // رموز ميتة (التطبيق أُزيل) — تُحذف فلا تتراكم
  const dead = failed
    .filter((r) => r.reason === "BadDeviceToken" || r.reason === "Unregistered")
    .map((r) => r.token);
  if (dead.length > 0) {
    await admin.from("push_devices").delete().in("token", dead);
  }

  // أثر الإرسال على الإشعار نفسه — لا فشل صامت
  if (notificationIds.length > 0) {
    await admin
      .from("notifications")
      .update({
        push_sent_at: sent > 0 ? new Date().toISOString() : null,
        push_error:
          sent === 0 && failed.length > 0
            ? failed.map((f) => f.reason).join(" · ").slice(0, 300)
            : null,
      })
      .in("id", notificationIds);
  }

  return json({
    success: true,
    sent,
    failed: failed.length,
    dead_removed: dead.length,
    reasons: failed.map((f) => f.reason).filter(Boolean).slice(0, 5),
  });
});
