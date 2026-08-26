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

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const FIRM_NAME = "شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس";

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

/** إرسال SMS عبر Msegat — الأسرار من البيئة أو lookup_values (نمط النظام) */
async function sendSmsSafe(phone: string, msg: string): Promise<boolean> {
  try {
    let userName = Deno.env.get("MSEGAT_USERNAME") ?? "";
    let apiKey = Deno.env.get("MSEGAT_API_KEY") ?? "";
    let userSender = Deno.env.get("MSEGAT_SENDER") ?? "";
    if (!userName || !apiKey || !userSender) {
      const { data } = await admin
        .from("lookup_values").select("value").eq("type", "sms_config").maybeSingle();
      if (data?.value) {
        const cfg = JSON.parse(data.value as string);
        userName = userName || cfg.userName;
        apiKey = apiKey || cfg.apiKey;
        userSender = userSender || cfg.sender;
      }
    }
    if (!userName || !apiKey || !userSender) return false;
    const res = await fetch("https://www.msegat.com/gw/sendsms.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName, apiKey, userSender,
        numbers: normalizeSaudi(phone), msg, By: "link", msgEncoding: "UTF8",
      }),
    });
    const t = await res.text();
    return t.includes("M0000") || t.includes('"code":"1"') || t.includes("Success");
  } catch (_) {
    return false;
  }
}

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

/* كاش قصير على مستوى الوحدة (60ث): هذه القيم تتغيّر نادراً جداً، وكانت
   تُجلب في كل طلب فتضيف رحلات شبكة على مسار حسّاس للسرعة. */
const TTL_MS = 60_000;
const cache = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, load: () => Promise<T>, ttl = TTL_MS): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.v as T;
  const v = await load();
  cache.set(key, { at: Date.now(), v });
  return v;
}

async function getConfig(): Promise<BookingConfig> {
  return cached("cfg", loadConfig);
}

async function loadConfig(): Promise<BookingConfig> {
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
async function loadOfficeBranding() {
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

async function loadBlockedDates(): Promise<Set<string>> {
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

// الرقم المرجعي: APT-{YY}{NNN} — مثال APT-26001
// ⚠️ التوليد في القاعدة (next_booking_reference) لا هنا: الزيادة ذرّية فلا
//    يتكرر الرقم عند حجزين متزامنين. السنة تُحسب بتوقيت الرياض.
async function nextReference(): Promise<string> {
  const { data, error } = await admin.rpc("next_booking_reference");
  if (error || !data) {
    throw new Error(`تعذّر توليد الرقم المرجعي: ${error?.message ?? "لا قيمة"}`);
  }
  return String(data);
}

/** المواعيد المحجوزة في مدى تواريخ — استعلام واحد بدل واحد لكل يوم */
async function busyByDate(
  fromDate: string,
  toDate: string
): Promise<Map<string, { start: number; end: number }[]>> {
  const map = new Map<string, { start: number; end: number }[]>();
  const { data } = await admin
    .from("appointments")
    .select("appointment_date, appointment_time, duration_minutes")
    .gte("appointment_date", fromDate)
    .lte("appointment_date", toDate)
    .neq("status", "cancelled");
  for (const r of (data ?? []) as any[]) {
    const d = String(r.appointment_date);
    const st = toMin(String(r.appointment_time ?? "00:00").slice(0, 5));
    const arr = map.get(d) ?? [];
    arr.push({ start: st, end: st + (r.duration_minutes ?? 60) });
    map.set(d, arr);
  }
  return map;
}

/** الفترات الشاغرة ليوم محدد، بمدّة الخدمة المطلوبة */
async function slotsFor(
  dateStr: string,
  cfg: BookingConfig,
  durationMinutes: number,
  blocked: Set<string>,
  /** خريطة المشغول لكل التواريخ — تُجلب مرة واحدة لكل الأيام */
  prefetched?: Map<string, { start: number; end: number }[]>
): Promise<string[]> {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (isNaN(d.getTime())) return [];
  if (!cfg.days.includes(d.getUTCDay())) return [];
  if (blocked.has(dateStr)) return [];

  const now = riyadhNow();
  if (dateStr < now.date || dateStr > riyadhDatePlus(cfg.max_days_ahead)) return [];

  // المشغول فعلاً — من خريطة مجلوبة مسبقاً إن وُجدت، وإلا استعلام لليوم وحده.
  // ⚠️ كان يستعلم لكل يوم داخل حلقة متسلسلة (٢٢ رحلة للقاعدة) فاستغرق
  //    عرض المواعيد ٣–٩ ثوانٍ — بلاغ المستخدم 2026-08-26.
  let busy: { start: number; end: number }[];
  if (prefetched) {
    busy = prefetched.get(dateStr) ?? [];
  } else {
    const { data: taken } = await admin
      .from("appointments")
      .select("appointment_time, duration_minutes")
      .eq("appointment_date", dateStr)
      .neq("status", "cancelled");
    busy = (taken ?? []).map((r: any) => {
      const s = toMin(String(r.appointment_time ?? "00:00").slice(0, 5));
      return { start: s, end: s + (r.duration_minutes ?? 60) };
    });
  }

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

const getOfficeBranding = () => cached("office", loadOfficeBranding);
const getBlockedDates = () => cached("blocked", loadBlockedDates);

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

      // نظرة الأيام تُحسب مرة كل 30ث لكل مدّة خدمة: تُعرض للتصفّح فقط،
      // والتحقق الحقيقي من الشغور يقع لحظة الحجز (فرع book يعيد الفحص).
      const _t0 = Date.now();
      const [days, office] = await Promise.all([
        cached(`days:${duration}`, async () => {
          const prefetched = await busyByDate(
            riyadhDatePlus(0),
            riyadhDatePlus(cfg.max_days_ahead),
          );
          const acc: { date: string; count: number }[] = [];
          for (let i = 0; i <= cfg.max_days_ahead; i++) {
            const ds = riyadhDatePlus(i);
            const sl = await slotsFor(ds, cfg, duration, blocked, prefetched);
            if (sl.length > 0) acc.push({ date: ds, count: sl.length });
          }
          return acc;
        }),
        getOfficeBranding(),
      ]);
      return json({
        ok: true,
        _ms: { total: Date.now() - _t0 },
        days,
        office,
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
      const reference = await nextReference();
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

      // ---- موعد عن بُعد: رابط Google Meet ثم إرساله للعميل ----
      // (طلب المستخدم 2026-08-26). ثانوي بالكامل: فشله لا يُفشل الحجز،
      // والموعد يبقى قائماً ويمكن توليد الرابط لاحقاً من صفحة الموعد.
      let meetLink: string | null = null;
      if (method === "remote" && appt?.id) {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/calendar-sync`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_KEY}`,
            },
            body: JSON.stringify({
              action: "add-appointment",
              appointment: {
                id: appt.id,
                client_name: name,
                client_phone: phone,
                notes: notes || null,
                appointment_date: date,
                appointment_time: time,
                duration_minutes: service.duration,
                meeting_method: method,
              },
            }),
          });
          const j = await r.json();
          meetLink = j?.meetLink ?? null;
          if (appt?.id && (meetLink || j?.eventId)) {
            await admin
              .from("appointments")
              .update({
                meeting_link: meetLink,
                gcal_event_id: j?.eventId ?? null,
                meeting_link_sent_at: meetLink ? new Date().toISOString() : null,
              })
              .eq("id", appt.id);
          }
          // إرسال الرابط للعميل برسالة نصية
          if (meetLink && phone) {
            const msg =
              `تم تأكيد موعدكم عن بُعد يوم ${date} الساعة ${time}.\n` +
              `رابط الاجتماع: ${meetLink}\n` +
              `الرقم المرجعي: ${appt?.reference_no ?? ""}\n` +
              FIRM_NAME;
            const ok = await sendSmsSafe(phone, msg);
            await admin.from("sms_log").insert({
              recipient_name: name,
              phone: normalizeSaudi(phone),
              message: msg,
              status: ok ? "sent" : "failed",
              sent_by: "حجز إلكتروني (رابط الاجتماع)",
            });
          }
        } catch (_) { /* الرابط ثانوي — الموعد محفوظ */ }
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
        meeting_link: meetLink,
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
