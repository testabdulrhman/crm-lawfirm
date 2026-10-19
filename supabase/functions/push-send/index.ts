// إرسال إشعار فوري (APNs) لأجهزة موظف — يخدم غرفة عمل المهام:
// منشن في نقاش، إسناد مهمة، طلب اعتماد، نتيجة اعتماد.
//
// ⚠️ الأسرار من env أو جدول app_secrets المغلق ولا تُكتب في الكود إطلاقاً:
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

// الإعداد: env أولاً ثم app_secrets (جدول مغلق service-only) — نمط
// «config editable بلا إعادة نشر» المعتمد في المشروع، لكن في جدولٍ لا
// يقرؤه الموظفون لأن هذا مفتاح توقيع.
let CFG: Record<string, string> | null = null;
async function cfg(key: string, fallback = ""): Promise<string> {
  const env = Deno.env.get(key);
  if (env) return env;
  if (!CFG) {
    const { data } = await admin.from("app_secrets").select("key, value");
    CFG = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  }
  return CFG[key] ?? fallback;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ai-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** رمز مصادقة APNs (JWT بمفتاح ES256) — صالح ساعة، ونعيد توليده كل مرة. */
async function apnsToken(): Promise<string> {
  const PRIVATE_KEY = await cfg("APNS_PRIVATE_KEY");
  const KEY_ID = await cfg("APNS_KEY_ID");
  const TEAM_ID = await cfg("APNS_TEAM_ID");
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
  host: string,
  topic: string,
  token: string,
  title: string,
  body: string,
  badge: number,
  data: Record<string, unknown>,
  sound: string,
  category: string | null
): Promise<SendResult> {
  try {
    const res = await fetch(`${host}/3/device/${token}`, {
      method: "POST",
      headers: {
        authorization: `bearer ${jwt}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
      },
      body: JSON.stringify({
        aps: {
          alert: { title, body },
          sound,
          badge,
          ...(category ? { category } : {}),
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

  // بوابة السر الداخلي — مفتاح anon عام؛ بدونها يستطيع أي أحد إزعاج
  // الموظفين بإشعارات مزيفة (نفس درس discussion-ai)
  const { data: secretRow } = await admin
    .from("lookup_values").select("value")
    .eq("type", "discussion_ai_config").eq("label", "inbound_secret")
    .limit(1).maybeSingle();
  if (!secretRow?.value || req.headers.get("x-ai-secret") !== secretRow.value) {
    return json({ error: "forbidden" }, 403);
  }

  if (!(await cfg("APNS_KEY_ID")) || !(await cfg("APNS_TEAM_ID")) ||
      !(await cfg("APNS_PRIVATE_KEY"))) {
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
  // صوت المحادثة يختلف عن صوت المهام (طلب المدير 2026-10-18): الترقر يرسل sound بحسب نوع الإشعار.
  // ملف chat.caf داخل التطبيق؛ والنسخة التي لا تحمله تشغّل الصوت الافتراضي (سلوك iOS) فلا يُفقد التنبيه.
  const SOUNDS = new Set(["default", "chat.caf"]);
  const sound = SOUNDS.has(String(body?.sound)) ? String(body.sound) : "default";
  // الرد من الإشعار نفسه (طلب المدير 2026-10-19): category تُظهر زرّ «رد» في الآيفون، وcase_id/parent_id
  // يحدّدان أين يُكتب الرد. قيم بيضاء فقط.
  const UUID = /^[0-9a-f-]{36}$/i;
  const category = body?.category === "DISCUSSION_REPLY" ? "DISCUSSION_REPLY" : null;
  const extra: Record<string, unknown> = {};
  if (category) {
    extra.reply = true;
    if (UUID.test(String(body?.case_id ?? ""))) extra.case_id = String(body.case_id);
    if (UUID.test(String(body?.parent_id ?? ""))) extra.parent_id = String(body.parent_id);
  }
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

  // شارة الأيقونة = عدد غير المقروء الحقيقي لكل مستلم (كانت 1 ثابتة
  // فتبقى عالقة على الأيقونة بعد قراءة كل شيء)
  const unreadByMember = new Map<string, number>();
  await Promise.all(
    memberIds.map(async (m) => {
      const { count } = await admin
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", m)
        .eq("is_read", false);
      unreadByMember.set(m, count ?? 1);
    })
  );

  const jwt = await apnsToken();
  const host =
    (await cfg("APNS_ENV", "sandbox")) === "production"
      ? "https://api.push.apple.com"
      : "https://api.sandbox.push.apple.com";
  const topic = await cfg("APNS_BUNDLE_ID", "sa.redwan.app");
  const results = await Promise.all(
    devices.map((d) =>
      sendOne(
        jwt, host, topic, d.token as string, title, message,
        unreadByMember.get(d.member_id as string) ?? 1,
        { ...(route ? { route } : {}), ...extra },
        sound,
        category
      )
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
