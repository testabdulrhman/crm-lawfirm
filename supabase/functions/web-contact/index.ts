// نموذج «تواصل معنا» في redwan.sa ← طلب وارد في النظام مباشرةً
//
// يحلّ محل formspree.io/f/mqeozjdk. صُمّم **بديلاً حرفياً**: يقبل نفس الحمولة
// التي كان الموقع يرسلها ({name, phone, email, service, message}) ويكتفي
// المرسِل بـres.ok — فالتغيير في الموقع سطر واحد: عنوان الـfetch لا غير.
//
// ⚠️ نقطة عامة بلا مصادقة (verify_jwt=false) — كأي نموذج موقع. فالحماية:
//    تحقّق من الحقول · مصيدة نحل (honeypot) · حدّ إرسال بالجوال · منع التكرار
//    الفوري · قصّ الأطوال قبل الإدراج.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/** 05xxxxxxxx / +9665… / 9665… → 9665XXXXXXXX (نفس منطق دالة الحجز) */
function normalizeSaudi(raw: string): string {
  let n = (raw ?? "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("00966")) n = n.slice(2);
  if (n.startsWith("0")) n = "966" + n.slice(1);
  else if (!n.startsWith("966")) n = "966" + n;
  return n;
}
const isValidSaudiMobile = (n: string): boolean => /^9665\d{8}$/.test(n);
const isValidEmail = (e: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

/** خدمات النموذج في الموقع → تسمية عربية + نوع الطلب في النظام */
const SERVICES: Record<string, { label: string; type: string }> = {
  civil:        { label: "القضايا المدنية والتجارية", type: "case" },
  labor:        { label: "قضايا العمل والعمال",       type: "case" },
  criminal:     { label: "القضايا الجنائية",           type: "case" },
  personal:     { label: "الأحوال الشخصية",            type: "case" },
  realestate:   { label: "النزاعات العقارية",          type: "case" },
  bankruptcy:   { label: "الإفلاس والتصفية",           type: "case" },
  arbitration:  { label: "التحكيم",                    type: "case" },
  consultation: { label: "الاستشارات القانونية",       type: "legal_service" },
  other:        { label: "أخرى",                       type: "case" },
};

const clip = (s: unknown, n: number): string =>
  String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  // مصيدة النحل: حقل لا يراه إنسان. مُلئ ⇒ آلي. نردّ ok كي لا يتعلّم الروبوت.
  if (clip(body.company ?? body.website, 1)) return json({ ok: true });

  const name = clip(body.name, 120);
  const phoneRaw = clip(body.phone, 40);
  const email = clip(body.email, 160).toLowerCase();
  const serviceKey = clip(body.service, 40);
  const message = clip(body.message, 4000);

  if (name.length < 2) return json({ error: "invalid_name", message: "الاسم مطلوب" }, 400);

  const phone = normalizeSaudi(phoneRaw);
  if (!isValidSaudiMobile(phone))
    return json({ error: "invalid_phone", message: "رقم جوال سعودي غير صالح" }, 400);

  if (email && !isValidEmail(email))
    return json({ error: "invalid_email", message: "بريد إلكتروني غير صالح" }, 400);

  const service = SERVICES[serviceKey] ?? null;

  // ===== حدّ الإرسال: ٣ طلبات للجوال الواحد في الساعة =====
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const { count: recent } = await admin
    .from("incoming_requests")
    .select("id", { count: "exact", head: true })
    .eq("client_phone", phone)
    .gte("created_at", hourAgo);
  if ((recent ?? 0) >= 3) {
    // نردّ ok: المرسِل الحقيقي يرى نجاحاً، ولا نُنشئ سجلاً رابعاً.
    return json({ ok: true, throttled: true });
  }

  // ===== منع الضغطة المزدوجة: نفس الجوال ونفس النص خلال ١٠ دقائق =====
  const tenMin = new Date(Date.now() - 600_000).toISOString();
  if (message) {
    const { data: same } = await admin
      .from("incoming_requests")
      .select("id, ref_no")
      .eq("client_phone", phone)
      .gte("created_at", tenMin)
      .ilike("description", `%${message.slice(0, 60)}%`)
      .limit(1)
      .maybeSingle();
    if (same) return json({ ok: true, ref: same.ref_no, duplicate: true });
  }

  // ===== ربط بجهة اتصال قائمة إن كان الرقم معروفاً =====
  let clientId: string | null = null;
  try {
    const { data: c } = await admin
      .from("contacts")
      .select("id")
      .or(`phone.eq.${phone},phone.eq.0${phone.slice(3)}`)
      .limit(1)
      .maybeSingle();
    clientId = c?.id ?? null;
  } catch (_) {
    clientId = null; // الربط تحسين لا شرط
  }

  // ===== الوصف: ما كتبه العميل + ما لا يسع له عمود مستقل =====
  const lines = [
    message || "(بلا تفاصيل)",
    "",
    service ? `الخدمة المطلوبة: ${service.label}` : null,
    email ? `البريد الإلكتروني: ${email}` : null,
    "وصل عبر نموذج التواصل في redwan.sa",
  ].filter(Boolean);

  const { data: created, error } = await admin
    .from("incoming_requests")
    .insert({
      client_name: name,
      client_phone: phone,
      client_id: clientId,
      request_type: service?.type ?? "case",
      description: lines.join("\n"),
      source: "الموقع الإلكتروني",
      created_by: "نموذج الموقع",
    })
    .select("id, ref_no")
    .single();

  if (error) {
    console.error("web-contact insert failed:", error.message);
    return json({ error: "insert_failed", message: error.message }, 500);
  }

  // ===== إشعار المدراء (إدراج notifications = دفع تلقائي إلى الجوّالات) =====
  try {
    const { data: directors } = await admin
      .from("team_members")
      .select("id")
      .eq("is_director", true)
      .eq("is_active", true);
    if (directors?.length) {
      await admin.from("notifications").insert(
        directors.map((d) => ({
          type: "incoming_request",
          title: `طلب جديد من الموقع — ${name}`,
          message: [service?.label, message].filter(Boolean).join(" · ").slice(0, 300),
          recipient_id: d.id,
        })),
      );
    }
  } catch (e) {
    console.error("web-contact notify failed:", (e as Error).message); // لا يُفشل الطلب
  }

  return json({ ok: true, ref: created.ref_no });
});
