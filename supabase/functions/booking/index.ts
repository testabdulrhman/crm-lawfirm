// حجز المواعيد العام — يخدم redwan.sa/appointments (عبر Netlify Function وسيطة)
// وصفحة app.redwan.sa/#/book القديمة.
//
// ⚠️ التوقيت: كل الحسابات بتوقيت الرياض (Asia/Riyadh, UTC+3). لا يُعتمد على
//    توقيت متصفح الزائر ولا على توقيت خادم Netlify ولا على توقيت خادم Deno.
//    appointment_date/appointment_time يُخزَّنان بتوقيت الرياض كما هو قائم.
//
// ⚠️ لا تُعرض بيانات أي موعد قائم إطلاقاً: slots ترجع أوقاتاً مجردة فقط.
//
// النسخة 3 — تتطلب migration 20260808_booking_website_phase1.sql:
//   service_type, meeting_method, client_email, company_name, source,
//   reference_no, idempotency_key, جدول booking_blocked_dates، قيد عدم التداخل.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

interface Service {
  key: string;
  name: string;
  duration: number;
  methods: string[];
  active: boolean;
}

interface BookingConfig {
  days: number[];
  start: string;
  end: string;
  slot_minutes: number;
  max_days_ahead: number;
  min_hours_notice: number;
  duration_minutes: number;
  services: Service[];
}

// الافتراضي يعمل حتى قبل تطبيق الـmigration (الخدمات تأتي من القاعدة بعدها)
const DEFAULTS: BookingConfig = {
  days: [0, 1, 2, 3, 4],
  start: "09:00",
  end: "16:00",
  slot_minutes: 30,
  max_days_ahead: 21,
  min_hours_notice: 3,
  duration_minutes: 30,
  services: [
    { key: "general", name: "استشارة قانونية عامة", duration: 30, methods: ["remote", "onsite"], active: true },
  ],
};

async function getConfig(): Promise<BookingConfig> {
  try {
    const { data } = await admin
      .from("lookup_values")
      .select("value")
      .eq("type", "booking_config")
      .limit(1)
      .maybeSingle();
    if (data?.value) {
      const parsed = JSON.parse(data.value as string);
      const cfg = { ...DEFAULTS, ...parsed };
      // الخدمات المعطّلة لا تُرسل للموقع إطلاقاً
      cfg.services = (cfg.services ?? DEFAULTS.services).filter((s: Service) => s.active !== false);
      return cfg;
    }
  } catch (_) { /* الافتراضي */ }
  return DEFAULTS;
}

// ترويسة المكتب: office_info محجوب عن الزوار بـ RLS (يحوي الآيبان والرقم
// الضريبي والختم) — نمرّر أربعة حقول آمنة فقط.
async function getOfficeBranding() {
  try {
    const { data } = await admin
      .from("office_info")
      .select("office_name, logo_url, phone, address")
      .limit(1)
      .maybeSingle();
    return data ?? null;
  } catch (_) {
    return null;
  }
}

async function getBlockedDates(): Promise<Set<string>> {
  try {
    const { data } = await admin
      .from("booking_blocked_dates")
      .select("blocked_date")
      .gte("blocked_date", riyadhNow().date);
    return new Set((data ?? []).map((r: any) => String(r.blocked_date)));
  } catch (_) {
    // الجدول غير موجود قبل الـmigration — لا نُفشل الحجز بسببه
    return new Set();
  }
}

const toMin = (t: string): number => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const toHHMM = (mins: number): string =>
  `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

function normalizeSaudi(raw: string): string {
  let n = (raw ?? "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("00966")) n = n.slice(2);
  if (n.startsWith("0")) n = "966" + n.slice(1);
  else if (!n.startsWith("966")) n = "966" + n;
  return n;
}

// جوال سعودي صالح: 9665XXXXXXXX (12 رقماً، يبدأ الجوال بـ 5)
const isValidSaudiMobile = (normalized: string): boolean =>
  /^9665\d{8}$/.test(normalized);

const isValidEmail = (e: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

// ⚠️ «الآن» بتوقيت الرياض — الخادم يعمل بـ UTC فنضيف 3 ساعات صراحةً.
function riyadhNow(): { date: string; minutes: number } {
  const now = new Date(Date.now() + 3 * 3600 * 1000);
  return {
    date: now.toISOString().slice(0, 10),
    minutes: now.getUTCHours() * 60 + now.getUTCMinutes(),
  };
}

// تاريخ اليوم + i بتوقيت الرياض
function riyadhDatePlus(days: number): string {
  return new Date(Date.now() + 3 * 3600 * 1000 + days * 86400000)
    .toISOString()
    .slice(0, 10);
}

// رقم مرجعي عشوائي غير تسلسلي: APT-YYMMDD-XXXX
// حروف بلا التباس (لا O/0/I/1) — يُملى على الهاتف بلا خطأ.
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeReference(dateStr: string): string {
  const compact = dateStr.slice(2).replace(/-/g, "");
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((b) => REF_ALPHABET[b % REF_ALPHABET.length])
    .join("");
  return `APT-${compact}-${suffix}`;
}

/** الفترات الشاغرة ليوم محدد، بمدّة الخدمة المطلوبة */
async function slotsFor(
  dateStr: string,
  cfg: BookingConfig,
  durationMinutes: number,
  blocked: Set<string>
): Promise<string[]> {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return [];
  if (!cfg.days.includes(d.getUTCDay())) return [];
  if (blocked.has(dateStr)) return [];

  const now = riyadhNow();
  if (dateStr < now.date || dateStr > riyadhDatePlus(cfg.max_days_ahead)) return [];

  // المشغول فعلاً — الأوقات والمدد فقط، بلا أي بيانات عملاء
  const { data: taken } = await admin
    .from("appointments")
    .select("appointment_time, duration_minutes")
    .eq("appointment_date", dateStr)
    .neq("status", "cancelled");

  const busy = (taken ?? []).map((r: any) => {
    const s = toMin(String(r.appointment_time ?? "00:00").slice(0, 5));
    return { start: s, end: s + (r.duration_minutes ?? 60) };
  });

  const out: string[] = [];
  const startM = toMin(cfg.start);
  const endM = toMin(cfg.end);
  for (let m = startM; m + durationMinutes <= endM; m += cfg.slot_minutes) {
    // تداخل مع أي موعد قائم؟
    if (busy.some((b) => m < b.end && b.start < m + durationMinutes)) continue;
    // مهلة أدنى لليوم نفسه
    if (dateStr === now.date && m < now.minutes + cfg.min_hours_notice * 60) continue;
    out.push(toHHMM(m));
  }
  return out;
}

function resolveService(cfg: BookingConfig, key: string | null): Service | null {
  if (!key) return null;
  return cfg.services.find((s) => s.key === key) ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON غير صالح" }, 400);
  }

  const cfg = await getConfig();

  try {
    // ---------------------------------------------------------------- config
    // الخدمات وطرق الاجتماع وإعدادات الدوام — يستدعيها الموقع أول تحميل
    if (body.action === "config") {
      return json({
        ok: true,
        office: await getOfficeBranding(),
        services: cfg.services.map((s) => ({
          key: s.key,
          name: s.name,
          duration: s.duration,
          methods: s.methods,
        })),
        config: {
          max_days_ahead: cfg.max_days_ahead,
          min_hours_notice: cfg.min_hours_notice,
          timezone: "Asia/Riyadh",
        },
      });
    }

    // ----------------------------------------------------------------- slots
    if (body.action === "slots") {
      const service = resolveService(cfg, body.service ?? null);
      const duration = service?.duration ?? cfg.duration_minutes;
      const blocked = await getBlockedDates();

      if (body.date) {
        return json({
          ok: true,
          date: body.date,
          slots: await slotsFor(String(body.date), cfg, duration, blocked),
          config: { duration_minutes: duration },
        });
      }

      const days: { date: string; count: number }[] = [];
      for (let i = 0; i <= cfg.max_days_ahead; i++) {
        const ds = riyadhDatePlus(i);
        const s = await slotsFor(ds, cfg, duration, blocked);
        if (s.length > 0) days.push({ date: ds, count: s.length });
      }
      return json({
        ok: true,
        days,
        office: await getOfficeBranding(),
        config: { duration_minutes: duration, max_days_ahead: cfg.max_days_ahead },
      });
    }

    // ------------------------------------------------------------------ book
    if (body.action === "book") {
      const name = String(body.name ?? "").trim();
      const phone = normalizeSaudi(String(body.phone ?? ""));
      const email = String(body.email ?? "").trim();
      const company = String(body.company ?? "").trim();
      const date = String(body.date ?? "").trim();
      const time = String(body.time ?? "").trim().slice(0, 5);
      const notes = String(body.notes ?? "").trim();
      const method = String(body.method ?? "").trim();
      const source = String(body.source ?? "").trim() || "website";
      const idemKey = String(body.idempotency_key ?? "").trim();

      // ---- تحقق كامل في الخادم (الواجهة لا يُوثق بها) ----
      if (name.length < 3) return json({ error: "الرجاء كتابة الاسم كاملاً (٣ أحرف على الأقل)" }, 400);
      if (name.length > 120) return json({ error: "الاسم طويل جداً" }, 400);
      if (!isValidSaudiMobile(phone))
        return json({ error: "رقم الجوال غير صحيح — أدخل رقم جوال سعودي يبدأ بـ 05" }, 400);
      if (email && !isValidEmail(email)) return json({ error: "البريد الإلكتروني غير صحيح" }, 400);
      if (email.length > 160) return json({ error: "البريد الإلكتروني طويل جداً" }, 400);
      if (company.length > 160) return json({ error: "اسم المنشأة طويل جداً" }, 400);
      if (notes.length > 1000) return json({ error: "وصف الموضوع طويل — اختصره في ١٠٠٠ حرف" }, 400);
      if (!date || !time) return json({ error: "اختر اليوم والوقت" }, 400);
      if (!body.consent) return json({ error: "الرجاء الموافقة على سياسة الخصوصية" }, 400);

      const service = resolveService(cfg, body.service ?? null);
      if (!service) return json({ error: "اختر نوع الخدمة" }, 400);
      if (!service.methods.includes(method))
        return json({ error: `طريقة الاجتماع غير متاحة لخدمة «${service.name}»` }, 400);

      // ---- إخماد التكرار: نفس المفتاح ⇒ نُعيد الحجز الأول بلا إنشاء ثانٍ ----
      if (idemKey) {
        const { data: prev } = await admin
          .from("appointments")
          .select("id, reference_no, appointment_date, appointment_time")
          .eq("idempotency_key", idemKey)
          .maybeSingle();
        if (prev) {
          return json({
            ok: true,
            duplicate: true,
            id: prev.id,
            reference_no: prev.reference_no,
            date: prev.appointment_date,
            time: String(prev.appointment_time).slice(0, 5),
          });
        }
      }

      // ---- إعادة التحقق من الشغور لحظة الحجز ----
      const blocked = await getBlockedDates();
      const free = await slotsFor(date, cfg, service.duration, blocked);
      if (!free.includes(time)) {
        return json(
          { error: "عذراً، حُجز هذا الوقت للتو. اختر وقتاً آخر من الأوقات المتاحة.", slots: free },
          409
        );
      }

      // ---- ربط بجهة اتصال قائمة (صامتاً — لا نكشف للزائر أن رقمه مسجّل) ----
      let clientId: string | null = null;
      try {
        const tail = phone.slice(-9);
        const { data: c } = await admin
          .from("contacts")
          .select("id, email")
          .ilike("phone", `%${tail}%`)
          .limit(1)
          .maybeSingle();
        clientId = c?.id ?? null;
        // البريد الرسمي مكانه contacts.email — نملأه إن كان فارغاً ولا نستبدله
        if (clientId && email && !c?.email) {
          await admin.from("contacts").update({ email }).eq("id", clientId);
        }
      } catch (_) { /* الربط ثانوي */ }

      // ---- الإدراج: قيد appointments_no_overlap هو الحَكَم النهائي ----
      const reference = makeReference(date);
      const { data: appt, error } = await admin
        .from("appointments")
        .insert({
          client_id: clientId,
          client_name: name,
          client_phone: phone,
          client_email: email || null,
          company_name: company || null,
          appointment_date: date,
          appointment_time: time,
          duration_minutes: service.duration,
          service_type: service.key,
          meeting_method: method,
          notes: notes || null,
          status: "confirmed",
          source,
          reference_no: reference,
          idempotency_key: idemKey || null,
          created_by: "حجز إلكتروني",
        })
        .select("id, reference_no")
        .single();

      if (error) {
        // 23P01 = exclusion_violation (تداخل)، 23505 = unique_violation
        if (error.code === "23P01")
          return json({ error: "عذراً، حُجز هذا الوقت للتو. اختر وقتاً آخر." }, 409);
        if (error.code === "23505" && idemKey) {
          const { data: prev } = await admin
            .from("appointments")
            .select("id, reference_no, appointment_date, appointment_time")
            .eq("idempotency_key", idemKey)
            .maybeSingle();
          if (prev)
            return json({
              ok: true,
              duplicate: true,
              id: prev.id,
              reference_no: prev.reference_no,
              date: prev.appointment_date,
              time: String(prev.appointment_time).slice(0, 5),
            });
        }
        return json({ error: `تعذّر حفظ الموعد: ${error.message}` }, 500);
      }

      // ---- إشعار داخلي للمدراء (ثانوي — لا يُفشل الحجز) ----
      try {
        const { data: directors } = await admin
          .from("team_members")
          .select("id")
          .eq("is_director", true)
          .eq("is_active", true);
        const methodLabel = method === "remote" ? "عن بُعد" : "حضوري";
        for (const d of directors ?? []) {
          await admin.from("notifications").insert({
            recipient_id: d.id,
            type: "appointment_booked",
            title: "حجز موعد جديد من الموقع",
            message: `${name} — ${service.name} (${methodLabel}) — ${date} الساعة ${time} — ${appt?.reference_no}`,
            is_read: false,
            channels: ["app"],
          });
        }
      } catch (_) { /* الإشعار ثانوي */ }

      return json({
        ok: true,
        id: appt?.id,
        reference_no: appt?.reference_no,
        date,
        time,
        duration_minutes: service.duration,
        service_name: service.name,
        method,
      });
    }

    return json({ error: "إجراء غير معروف" }, 400);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
