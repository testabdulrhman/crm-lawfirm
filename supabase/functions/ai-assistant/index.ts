import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================
// ai-assistant — البوابة الموحّدة للذكاء الاصطناعي (Claude API)
// v23: إصلاح create_task (created_by عمود uuid لا اسم نصي — كان يفشل دائماً)
//      + أداة create_session لتسجيل جلسة من إشعار ناجز.
// v22: إصلاح قطع الـJSON — التفكير الداخلي يستهلك من ميزانية max_tokens،
//      فكان السقف 1500/2000 يقطع الجواب في منتصفه فيفشل تحليله بصمت.
// =============================================================

import { EXTRA_TOOLS, runExtraTool, EXTRA_SYSTEM_RULES } from "../_shared/agent-tools.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-sonnet-5";
const FIRM_NAME = "شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// اسم النموذج من إعدادات القاعدة (قابل للتغيير دون إعادة نشر)
async function getAssistantModel(): Promise<string> {
  try {
    const { data } = await admin
      .from("lookup_values")
      .select("value")
      .eq("type", "ai_config")
      .limit(1)
      .maybeSingle();
    if (data?.value) {
      const cfg = JSON.parse(data.value as string);
      if (cfg.assistant_model) return String(cfg.assistant_model);
    }
  } catch (_) { /* الافتراضي */ }
  return FALLBACK_MODEL;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** تحليل JSON متسامح: يتجاوز سياج ```json وأي كلام قبل/بعد الكائن. */
function parseLoose(text: string): any | null {
  const attempts = [text, text.replace(/```json|```/g, "")];
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first !== -1 && last > first) attempts.push(text.slice(first, last + 1));
  for (const a of attempts) {
    try {
      const v = JSON.parse(a.trim());
      if (v && typeof v === "object") return v;
    } catch (_) { /* المحاولة التالية */ }
  }
  return null;
}

type Doc = { base64: string; mediaType: string; kind: "pdf" | "image" | "other" };

async function fetchDocAsBase64(url: string): Promise<Doc | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) return null;
    let binary = "";
    const chunk = 8192;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);
    let mediaType = ct;
    const u = url.toLowerCase();
    if (!mediaType || mediaType === "application/octet-stream") {
      if (u.endsWith(".pdf")) mediaType = "application/pdf";
      else if (u.endsWith(".png")) mediaType = "image/png";
      else if (u.endsWith(".jpg") || u.endsWith(".jpeg")) mediaType = "image/jpeg";
      else if (u.endsWith(".webp")) mediaType = "image/webp";
      else if (u.endsWith(".gif")) mediaType = "image/gif";
      else mediaType = "application/pdf";
    }
    const kind = mediaType === "application/pdf" ? "pdf" : (mediaType.startsWith("image/") ? "image" : "other");
    return { base64, mediaType, kind };
  } catch (_e) {
    return null;
  }
}

function buildDocBlock(doc: Doc): any {
  if (doc.kind === "pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 } };
  if (doc.kind === "image") return { type: "image", source: { type: "base64", media_type: doc.mediaType, data: doc.base64 } };
  return null;
}

/* ===================== إرسال SMS (مشترك) ===================== */

function normalizeSaudi(raw: string): string {
  let n = (raw ?? "").replace(/\D/g, "");
  if (!n) return "";
  if (n.startsWith("00966")) n = n.slice(2);
  if (n.startsWith("0")) n = "966" + n.slice(1);
  else if (!n.startsWith("966")) n = "966" + n;
  return n;
}

async function resolveSmsCreds(): Promise<{ userName: string; apiKey: string; userSender: string } | null> {
  let userName = Deno.env.get("MSEGAT_USERNAME") ?? "";
  let apiKey = Deno.env.get("MSEGAT_API_KEY") ?? "";
  let userSender = Deno.env.get("MSEGAT_SENDER") ?? "";
  if (!userName || !apiKey || !userSender) {
    try {
      const { data } = await admin.from("lookup_values").select("value").eq("type", "sms_config").maybeSingle();
      if (data?.value) {
        const cfg = JSON.parse(data.value as string);
        userName = userName || cfg.userName;
        apiKey = apiKey || cfg.apiKey;
        userSender = userSender || cfg.sender;
      }
    } catch (_) { /* تجاهل */ }
  }
  if (!userName || !apiKey || !userSender) return null;
  return { userName, apiKey, userSender };
}

async function sendSms(numbers: string, msg: string): Promise<boolean> {
  const creds = await resolveSmsCreds();
  if (!creds) return false;
  const res = await fetch("https://www.msegat.com/gw/sendsms.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...creds, numbers, msg, By: "link", msgEncoding: "UTF8" }),
  });
  const text = await res.text();
  return text.includes("M0000") || text.includes('"code":"1"') || text.includes("Success");
}

/* ===================== أدوات الوكيل ===================== */

const AGENT_TOOLS = [
  {
    name: "search_poas",
    description: "البحث في الوكالات برقم الوكالة أو اسم الموكّل. يرجع الرقم، التواريخ، الحالة، اسم الموكّل وجواله (client_phone).",
    input_schema: { type: "object", properties: { query: { type: "string", description: "رقم الوكالة أو جزء من اسم الموكّل" } }, required: ["query"] },
  },
  {
    name: "search_cases",
    description: "البحث في القضايا برقم المكتب (CASE...) أو العنوان أو اسم الموكّل.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "search_contacts",
    description: "البحث في جهات الاتصال بالاسم أو رقم الجوال.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  {
    name: "list_sessions",
    description: "قائمة الجلسات في مدى زمني (مثل الأسبوع القادم). ترجع التاريخ، الوقت، رقم الجلسة، المحكمة، وعنوان القضية ومسؤولها ومعرّف الجلسة (id).",
    input_schema: {
      type: "object",
      properties: {
        from_date: { type: "string", description: "من تاريخ YYYY-MM-DD (افتراضي: اليوم)" },
        to_date: { type: "string", description: "إلى تاريخ YYYY-MM-DD (افتراضي: بعد 7 أيام)" },
      },
    },
  },
  {
    name: "list_tasks",
    description: "قائمة المهام المفتوحة (والمتأخرة)، اختيارياً لموظف معيّن بالاسم.",
    input_schema: {
      type: "object",
      properties: {
        assignee_name: { type: "string", description: "اسم الموظف (اختياري)" },
        overdue_only: { type: "boolean", description: "المتأخرة فقط" },
      },
    },
  },
  {
    name: "list_expiring_poas",
    description: "الوكالات التي تنتهي خلال مدة محددة (أو المنتهية أصلاً).",
    input_schema: {
      type: "object",
      properties: {
        days: { type: "number", description: "خلال كم يوماً (افتراضي 30)" },
        include_expired: { type: "boolean", description: "تضمين المنتهية سابقاً" },
      },
    },
  },
  {
    name: "list_staff_applications",
    description: "قائمة طلبات التوظيف (المتقدمون للوظائف). فلترة بالحالة وبحث اختياري بالاسم أو الجوال. ترجع الاسم، الجوال، الحالة، تاريخ التقديم، هل السيرة الذاتية مرفقة، ورابط الطلب.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "approved", "rejected", "all"], description: "الحالة: pending قيد الدراسة (الافتراضي) / approved معتمد / rejected مرفوض / all الكل" },
        query: { type: "string", description: "بحث بالاسم أو الجوال (اختياري)" },
      },
    },
  },
  {
    name: "list_applicant_analyses",
    description: "ترتيب ومقارنة المتقدمين للوظائف حسب نتائج تحليل الذكاء الاصطناعي المحفوظة: مؤشر الملاءمة (1-10)، المعدل الدراسي GPA، الخبرة، الوظيفة المقترحة، التوصية. استخدمها لأسئلة «من أفضل المتقدمين؟» أو «أعلى المعدلات». النتائج مرتّبة بالمؤشر تنازلياً، وتظهر أيضاً من لم يُحلّل بعد (analyzed=false) فاذكرهم للمستخدم.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pending", "approved", "rejected", "all"], description: "حالة الطلبات (افتراضي pending)" },
      },
    },
  },
  {
    name: "save_attachment",
    description: "حفظ الملف الذي أرفقه الموظف في هذه المحادثة داخل النظام. استخدمها فقط عندما يوجد مرفق فعلي (سيُذكر لك في السياق). خياران: target=case_document لحفظه في مستندات القضية، أو target=session_minutes لحفظه كمحضر ضبط جلسة (وعندها يُقرأ الملف ويُستخرج منه ما تمّ في الجلسة ويُحدّث تلقائياً). حدّد القضية برقم المكتب، وللجلسة يمكن تمرير session_id من list_sessions وإلا تُختار أحدث جلسة غير مغلقة.",
    input_schema: {
      type: "object",
      properties: {
        target: { type: "string", enum: ["case_document", "session_minutes"], description: "وجهة الحفظ" },
        case_office_num: { type: "string", description: "رقم مكتب القضية مثل CASE26045" },
        session_id: { type: "string", description: "معرّف الجلسة (اختياري)" },
        name: { type: "string", description: "اسم المستند كما يظهر في النظام (اختياري)" },
      },
      required: ["target", "case_office_num"],
    },
  },
  {
    name: "create_session",
    description: "إنشاء جلسة جديدة في قضية. استخدمها عندما يطلب الموظف تسجيل جلسة أو موعد جلسة وصله من ناجز أو المحكمة. التاريخ ميلادي YYYY-MM-DD — إن أعطاك الموظف تاريخاً هجرياً فحوّله أولاً واذكر التحويل في ردّك. تُنشأ الجلسة بحالة «قادمة» وتُزامَن مع تقويم Google تلقائياً من النظام.",
    input_schema: {
      type: "object",
      properties: {
        case_office_num: { type: "string", description: "رقم مكتب القضية مثل CASE26039" },
        session_date: { type: "string", description: "تاريخ الجلسة ميلادي YYYY-MM-DD" },
        session_time: { type: "string", description: "وقت الجلسة HH:MM بنظام 24 ساعة (اختياري)" },
        title: { type: "string", description: "عنوان الجلسة (اختياري — يُولَّد من رقمها)" },
        court: { type: "string", description: "اسم المحكمة (اختياري — يُؤخذ من القضية)" },
        preparation: { type: "string", description: "ما يجب تحضيره قبلها (اختياري)" },
      },
      required: ["case_office_num", "session_date"],
    },
  },
  {
    name: "send_sms",
    description: "إرسال رسالة SMS لرقم جوال سعودي. استخدمها فقط بعد تأكّدك من الرقم والنص.",
    input_schema: {
      type: "object",
      properties: {
        phone: { type: "string", description: "رقم الجوال" },
        message: { type: "string", description: "نص الرسالة العربي الرسمي" },
        recipient_name: { type: "string", description: "اسم المستلم (للسجل)" },
      },
      required: ["phone", "message", "recipient_name"],
    },
  },
  {
    name: "create_task",
    description: "إنشاء مهمة في النظام (اختيارياً مرتبطة بقضية أو مُسندة لموظف بالاسم).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        due_date: { type: "string", description: "YYYY-MM-DD أو فارغ" },
        priority: { type: "string", enum: ["low", "med", "high"] },
        assignee_name: { type: "string", description: "اسم الموظف (اختياري)" },
        case_office_num: { type: "string", description: "رقم مكتب القضية CASE... (اختياري)" },
      },
      required: ["title"],
    },
  },
  // الأدوات الموسّعة (إضافة وتعديل) — مشتركة مع ذكاء النقاش
  ...EXTRA_TOOLS,
];

/** اسم الموظف → معرّفه في team_members (أو null). يُحفظ لتفادي استعلام متكرر. */
const memberIdCache = new Map<string, string | null>();
async function resolveMemberId(name: string): Promise<string | null> {
  const key = (name ?? "").trim();
  if (!key) return null;
  if (memberIdCache.has(key)) return memberIdCache.get(key)!;
  let id: string | null = null;
  try {
    const { data } = await admin
      .from("team_members")
      .select("id")
      .ilike("name", `%${key}%`)
      .eq("is_active", true)
      .limit(1);
    id = data?.[0]?.id ?? null;
  } catch (_) { /* يبقى null */ }
  memberIdCache.set(key, id);
  return id;
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoPlusDays(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

async function runAgentTool(name: string, input: any, userName: string, actions: string[], attachment: any = null): Promise<string> {
  try {
    // الأدوات الموسّعة أولاً — تُرجع null إن لم تكن منها
    const extra = await runExtraTool(name, input, userName, actions);
    if (extra !== null) return extra;

    if (name === "search_poas") {
      const q = String(input.query ?? "").trim();
      // لا يوجد FK مباشر بين الوكالات وجهات الاتصال — نجلب الجوال بخطوة ثانية
      const { data, error } = await admin
        .from("powers_of_attorney")
        .select("id, poa_number, poa_date, expiry_date, status, client_id, client_name, agent_name")
        .or(`poa_number.ilike.%${q}%,client_name.ilike.%${q}%,agent_name.ilike.%${q}%`)
        .is("deleted_at", null)
        .limit(5);
      if (error) return JSON.stringify({ error: error.message });
      const rows = (data ?? []) as any[];
      const ids = rows.map((r) => r.client_id).filter(Boolean);
      const phones: Record<string, string | null> = {};
      if (ids.length) {
        const { data: cts } = await admin.from("contacts").select("id, phone").in("id", ids);
        for (const c of (cts ?? []) as any[]) phones[c.id] = c.phone;
      }
      return JSON.stringify(rows.map((r) => ({ ...r, client_phone: r.client_id ? phones[r.client_id] ?? null : null })));
    }
    if (name === "search_cases") {
      const q = String(input.query ?? "").trim();
      const { data, error } = await admin
        .from("cases")
        .select("id, office_num, title, status, court, contact:contacts(name, phone), assignee:team_members(name)")
        .or(`office_num.ilike.%${q}%,title.ilike.%${q}%,court_num.ilike.%${q}%`)
        .limit(5);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify(data ?? []);
    }
    if (name === "search_contacts") {
      const q = String(input.query ?? "").trim();
      const { data, error } = await admin
        .from("contacts")
        .select("id, name, phone, phone2, category, city")
        .or(`name.ilike.%${q}%,phone.ilike.%${q}%,phone2.ilike.%${q}%`)
        .limit(5);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify(data ?? []);
    }
    if (name === "list_sessions") {
      const from = String(input.from_date || isoToday());
      const to = String(input.to_date || isoPlusDays(7));
      const { data, error } = await admin
        .from("sessions")
        .select("id, session_number, title, session_date, session_time, court, status, closed_at, case:cases!sessions_case_id_fkey(office_num, title, assignee:team_members(name))")
        .gte("session_date", from)
        .lte("session_date", to)
        .order("session_date", { ascending: true })
        .order("session_time", { ascending: true })
        .limit(30);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify({ from, to, sessions: data ?? [] });
    }
    if (name === "list_tasks") {
      let q = admin
        .from("tasks")
        // ⚠️ tasks فيه عمودان يشيران إلى team_members (assignee_id و created_by)
        //    فلا بد من تسمية القيد صراحةً وإلا رفضت PostgREST الاستعلام (PGRST201)
        .select("id, title, due_date, priority, is_urgent, status, assignee:team_members!tasks_assignee_id_fkey(name), case:cases(office_num, title)")
        .eq("status", "todo")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(30);
      if (input.overdue_only) q = q.lt("due_date", isoToday());
      const { data, error } = await q;
      if (error) return JSON.stringify({ error: error.message });
      let rows = (data ?? []) as any[];
      if (input.assignee_name) {
        const needle = String(input.assignee_name).trim();
        rows = rows.filter((t) => (t.assignee?.name ?? "").includes(needle));
      }
      return JSON.stringify(rows);
    }
    if (name === "list_expiring_poas") {
      const days = Number.isFinite(Number(input.days)) && Number(input.days) > 0 ? Number(input.days) : 30;
      const from = input.include_expired ? "1900-01-01" : isoToday();
      const { data, error } = await admin
        .from("powers_of_attorney")
        .select("id, poa_number, expiry_date, status, client_id, client_name")
        .gte("expiry_date", from)
        .lte("expiry_date", isoPlusDays(days))
        .is("deleted_at", null)
        .order("expiry_date", { ascending: true })
        .limit(30);
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify(data ?? []);
    }
    if (name === "list_staff_applications") {
      const status = String(input.status || "pending");
      let q = admin
        .from("staff_applications")
        .select("id, full_name, phone, email, status, created_at, cv_url, qualifications")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(30);
      if (status !== "all") q = q.eq("status", status);
      const needle = String(input.query ?? "").trim();
      if (needle) q = q.or(`full_name.ilike.%${needle}%,phone.ilike.%${needle}%`);
      const { data, error } = await q;
      if (error) return JSON.stringify({ error: error.message });
      return JSON.stringify((data ?? []).map((r: any) => ({
        id: r.id,
        full_name: r.full_name,
        phone: r.phone,
        email: r.email,
        status: r.status,
        created_at: r.created_at,
        has_cv: !!r.cv_url,
        qualifications: r.qualifications,
        link: `https://app.redwan.sa/#/staff-applications/${r.id}`,
      })));
    }
    if (name === "list_applicant_analyses") {
      const status = String(input.status || "pending");
      let q = admin
        .from("staff_applications")
        .select("id, full_name, phone, status, created_at, cv_url")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (status !== "all") q = q.eq("status", status);
      const { data: apps, error } = await q;
      if (error) return JSON.stringify({ error: error.message });
      const ids = (apps ?? []).map((a: any) => a.id);
      const byApp: Record<string, any> = {};
      if (ids.length) {
        const { data: ans } = await admin
          .from("staff_application_analysis")
          .select("*")
          .in("application_id", ids);
        for (const a of (ans ?? []) as any[]) byApp[a.application_id] = a;
      }
      const rows = (apps ?? [])
        .map((a: any) => {
          const an = byApp[a.id];
          return {
            full_name: a.full_name,
            phone: a.phone,
            status: a.status,
            has_cv: !!a.cv_url,
            analyzed: !!an,
            fit_score: an?.fit_score ?? null,
            gpa: an?.gpa ?? null,
            experience_years: an?.experience_years ?? null,
            suggested_role: an?.suggested_role ?? null,
            recommendation: an?.recommendation ?? null,
            analyzed_at: an?.analyzed_at ?? null,
            link: `https://app.redwan.sa/#/staff-applications/${a.id}`,
          };
        })
        .sort((x: any, y: any) => (y.fit_score ?? -1) - (x.fit_score ?? -1));
      return JSON.stringify(rows);
    }
    if (name === "save_attachment") {
      if (!attachment?.url) {
        return JSON.stringify({ ok: false, error: "لا يوجد ملف مرفق في هذه الرسالة — اطلب من الموظف إرفاقه بزر المشبك." });
      }
      const officeNum = String(input.case_office_num ?? "").trim();
      const { data: cs } = await admin.from("cases").select("id, title").ilike("office_num", `%${officeNum}%`).limit(1);
      const caseRow = cs?.[0];
      if (!caseRow) return JSON.stringify({ ok: false, error: `لم أجد قضية برقم ${officeNum}` });

      const docName = String(input.name ?? attachment.name ?? "مستند");

      if (input.target === "session_minutes") {
        let sessionId = input.session_id ? String(input.session_id) : null;
        if (!sessionId) {
          const { data: ss } = await admin.from("sessions").select("id").eq("case_id", caseRow.id).is("closed_at", null).order("session_date", { ascending: false }).limit(1);
          sessionId = ss?.[0]?.id ?? null;
        }
        if (!sessionId) return JSON.stringify({ ok: false, error: "لا توجد جلسة مفتوحة في هذه القضية — حدّد جلسة أو أنشئها أولاً." });

        const { error: upErr } = await admin.from("sessions").update({ minutes_url: attachment.url }).eq("id", sessionId);
        if (upErr) return JSON.stringify({ ok: false, error: upErr.message });

        await admin.from("documents").insert({
          case_id: caseRow.id, name: docName, file_url: attachment.url,
          file_type: attachment.type ?? null,
          description: "محضر ضبط جلسة — أُرفق عبر المساعد الذكي",
          uploaded_by_name: userName,
        });

        let extracted: any = null;
        let extractNote = "";
        const doc = await fetchDocAsBase64(attachment.url);
        if (doc) {
          const block = buildDocBlock(doc);
          const { system, user } = buildPrompt("extract_session_minutes", { has_doc: true });
          const model = await getAssistantModel();
          const r = await fetch(ANTHROPIC_URL, {
            method: "POST",
            headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            // ⚠️ 8000 لا 2000: التفكير الداخلي يستهلك من نفس الميزانية، فكان
            //    الجواب يُقطع في منتصفه ويفشل تحليله بصمت.
            body: JSON.stringify({ model, max_tokens: 8000, system, messages: [{ role: "user", content: block ? [block, { type: "text", text: user }] : user }] }),
          });
          const d = await r.json();
          if (r.ok) {
            const txt = (d.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
            extracted = parseLoose(txt);
            if (!extracted) extractNote = d?.stop_reason === "max_tokens" ? "المحضر طويل ولم يكتمل تحليله" : "تعذّر فهم نتيجة التحليل";
          } else {
            extractNote = "تعذّر الاتصال بخدمة التحليل";
          }
        } else {
          extractNote = "تعذّرت قراءة الملف (PDF أو صورة أقل من 10 ميغابايت)";
        }
        if (extracted?.outcome) {
          const patch: any = { outcome: extracted.outcome };
          if (extracted.next_action) patch.next_action = extracted.next_action;
          if (extracted.ruling_due_date) patch.ruling_due_date = extracted.ruling_due_date;
          if (extracted.session_number) patch.session_number = extracted.session_number;
          await admin.from("sessions").update(patch).eq("id", sessionId);
        }
        actions.push(`حُفظ ضبط الجلسة في قضية ${caseRow.title}`);
        return JSON.stringify({ ok: true, case_title: caseRow.title, session_id: sessionId, extracted, extract_note: extractNote || undefined });
      }

      const { error } = await admin.from("documents").insert({
        case_id: caseRow.id, name: docName, file_url: attachment.url,
        file_type: attachment.type ?? null,
        description: "أُرفق عبر المساعد الذكي",
        uploaded_by_name: userName,
      });
      if (error) return JSON.stringify({ ok: false, error: error.message });
      actions.push(`أُضيف «${docName}» لمستندات قضية ${caseRow.title}`);
      return JSON.stringify({ ok: true, case_title: caseRow.title });
    }
    if (name === "create_session") {
      const officeNum = String(input.case_office_num ?? "").trim();
      const { data: cs } = await admin.from("cases").select("id, title, court").ilike("office_num", `%${officeNum}%`).limit(1);
      const caseRow = cs?.[0];
      if (!caseRow) return JSON.stringify({ ok: false, error: `لم أجد قضية برقم ${officeNum}` });

      const date = String(input.session_date ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return JSON.stringify({ ok: false, error: "تاريخ الجلسة يجب أن يكون ميلادياً بصيغة YYYY-MM-DD" });
      const rawTime = String(input.session_time ?? "").trim();
      const time = /^\d{1,2}:\d{2}/.test(rawTime) ? rawTime.slice(0, 5).padStart(5, "0") : null;

      // رقم الجلسة التالي في القضية
      const { data: prev } = await admin
        .from("sessions").select("session_number")
        .eq("case_id", caseRow.id)
        .order("session_number", { ascending: false, nullsFirst: false })
        .limit(1);
      const nextNum = (prev?.[0]?.session_number ?? 0) + 1;

      const { data: created, error } = await admin.from("sessions").insert({
        case_id: caseRow.id,
        title: String(input.title ?? "").trim() || `جلسة رقم ${String(nextNum).padStart(2, "0")}`,
        session_number: nextNum,
        session_date: date,
        session_time: time,
        court: String(input.court ?? "").trim() || caseRow.court || null,
        preparation: String(input.preparation ?? "").trim() || null,
        status: "قادمة",
      }).select("id, title, session_number").single();
      if (error) return JSON.stringify({ ok: false, error: error.message });

      actions.push(`أُنشئت جلسة في قضية ${caseRow.title} بتاريخ ${date}`);
      // ⚠️ لا مزامنة تقويم من هنا: أسرار Google في دالة calendar-sync وحدها،
      //    والجلسة ستظهر في التطبيق بمؤشّر «ليست في التقويم — أضِفها».
      return JSON.stringify({
        ok: true, session_id: created?.id, session_number: created?.session_number,
        case_title: caseRow.title, date, time,
        note: "أُنشئت الجلسة. لإضافتها لتقويم Google اضغط «ليست في التقويم — أضِفها» في تبويب الجلسات.",
      });
    }
    if (name === "send_sms") {
      const numbers = normalizeSaudi(String(input.phone ?? ""));
      if (!numbers || numbers.length < 12) return JSON.stringify({ ok: false, error: "رقم غير صالح" });
      const message = String(input.message ?? "").trim();
      if (!message) return JSON.stringify({ ok: false, error: "نص فارغ" });
      const ok = await sendSms(numbers, message);
      try {
        await admin.from("sms_log").insert({
          recipient_name: String(input.recipient_name ?? "عميل"),
          phone: numbers,
          message,
          status: ok ? "sent" : "failed",
          sent_by: `${userName} (مساعد ذكي)`,
        });
      } catch (_) { /* تجاهل */ }
      if (ok) actions.push(`أُرسلت SMS إلى ${input.recipient_name} (${numbers})`);
      return JSON.stringify({ ok });
    }
    if (name === "create_task") {
      // ⚠️ created_by و assignee_id عمودا uuid يشيران إلى team_members —
      //    وضع الاسم نصاً فيهما يُرجع 22P02 (invalid input syntax for type uuid).
      const creatorId = await resolveMemberId(userName);
      // بلا اسم موظف: تُسند لطالبها بدل أن تبقى بلا مسؤول
      const assigneeId = input.assignee_name
        ? await resolveMemberId(String(input.assignee_name))
        : creatorId;
      if (input.assignee_name && !assigneeId)
        return JSON.stringify({ ok: false, error: `لم أجد موظفاً باسم «${input.assignee_name}»` });

      let caseId: string | null = null;
      if (input.case_office_num) {
        const { data: cs } = await admin.from("cases").select("id").ilike("office_num", `%${input.case_office_num}%`).limit(1);
        caseId = cs?.[0]?.id ?? null;
        if (!caseId) return JSON.stringify({ ok: false, error: `لم أجد قضية برقم ${input.case_office_num}` });
      }
      const { error } = await admin.from("tasks").insert({
        title: String(input.title ?? "").trim(),
        status: "todo",
        priority: input.priority || "med",
        due_date: input.due_date || null,
        assignee_id: assigneeId,
        case_id: caseId,
        created_by: creatorId,
      });
      if (error) return JSON.stringify({ ok: false, error: error.message });
      actions.push(`أُنشئت مهمة: ${input.title}`);
      return JSON.stringify({ ok: true, assigned_to: input.assignee_name || userName });
    }
    return JSON.stringify({ error: "أداة غير معروفة" });
  } catch (e) {
    return JSON.stringify({ error: String((e as Error)?.message || e) });
  }
}

const AGENT_SYSTEM = `أنت المساعد الذكي لنظام ${FIRM_NAME}. تساعد الموظفين بالبحث في بيانات النظام وتنفيذ إجراءات.
قواعد:
- ابحث بالأدوات قبل الإجابة، ولا تختلق بيانات. للأسئلة الزمنية (الأسبوع القادم/اليوم/الشهر) استخدم list_sessions أو list_tasks أو list_expiring_poas بالتواريخ المناسبة. لطلبات التوظيف استخدم list_staff_applications، ولأسئلة المفاضلة بين المتقدمين (الأفضل/المعدلات/الترتيب) استخدم list_applicant_analyses — وإن وجدت متقدمين غير محلّلين (analyzed=false) فنبّه بسطر واحد قصير أن تحليلهم متاح من صفحة طلبات التوظيف (زر تحليل الكل).
- إذا طلب الموظف صراحةً إرسال رسالة (مثل «أرسل له…») فأرسلها مباشرة بعد إيجاد الرقم الصحيح. إن كان الطلب غامضاً اعرض مسودة الرسالة واطلب تأكيداً.
- المرفقات: إن أرفق الموظف ملفاً وطلب حفظه في قضية، استخدم save_attachment. إن ذكر أنه «ضبط جلسة» أو «محضر» فاجعل target=session_minutes، وإلا case_document. إن لم يذكر القضية فاسأله عن رقمها أو ابحث بـ search_cases إن ذكر اسماً. بعد الحفظ اذكر ملخّص ما استُخرج من المحضر (outcome) في سطرين، وإن رجع extract_note فاذكر سببه بصراحة في سطر واحد.
- رسائل العملاء: عربية فصحى رسمية موجزة، تُختم بالاسم الرسمي الكامل: «${FIRM_NAME}» (لا تختصره أبداً).
- الجلسات: إن وصل الموظف إشعار جلسة من ناجز أو المحكمة وطلب تسجيله، استخدم create_session. التواريخ في إشعارات ناجز هجرية غالباً — حوّلها إلى ميلادي واذكر التحويل صراحةً في ردّك ليتحقق منه الموظف.\n- إن تعدّدت النتائج المطابقة فاسأل أيّها المقصود قبل أي إجراء.
- بعد التنفيذ اذكر بوضوح ما فعلته (لمن أُرسل، وما نص الرسالة).
${EXTRA_SYSTEM_RULES}

تنسيق الرد (مهم جداً — الواجهة تعرض نصّاً خاماً ولا تفهم Markdown):
- اكتب نصّاً عربيّاً عادياً فقط. ممنوع منعاً تامّاً: علامات # للعناوين، والنجمتين ** للتعريض، والشرطات --- كفواصل، والجداول بالأنابيب | ، وأي رموز تنسيق أخرى.
- للقوائم: سطر لكل عنصر يبدأ بـ «• »، وافصل الحقول داخل السطر بـ « — ».
  مثال: • الأحد 26 يوليو، 10:35 ص — المحكمة العمالية — قضية فلان (CASE26045) — المسؤول: فلان
- لا تضع أسطراً فارغة زائدة؛ سطر تمهيدي قصير ثم القائمة مباشرة.
- الأرقام بالصيغة اللاتينية (1 2 3) لا العربية الهندية.
- ردودك قصيرة ومباشرة (اللوحة ضيقة)؛ واستخدم الإيموجي بحدّ أدنى.

اقتراحات المتابعة (مهم):
أنهِ كل رد بسطر أخير منفصل بالصيغة التالية حرفيّاً يحتوي 2 إلى 4 اقتراحات لما قد يطلبه الموظف بعد ردّك:
@@SUGGEST@@ ["اقتراح أول","اقتراح ثانٰ"]
قواعد الاقتراحات: مكتوبة بلسان الموظف (أمر أو سؤال مباشر مثل «أرسل له تذكيراً» أو «اعرض جلسات الأسبوع القادم»)، قصيرة (دون ـ 60 حرفاً)، محددة ومرتبطة بسياق الحوار وبالأسماء/الأرقام التي ذُكرت، وقابلة للتنفيذ بأدواتك. لا تشر إلى هذا السطر في نص ردّك إطلاقاً (لا يُعرض للموظف كنص). إن كنت تسأل الموظف سؤالاً للتوضيح فاجعل الاقتراحات هي الإجابات المحتملة.`;

// استخراج سطر الاقتراحات وفصله عن النص المعروض
function splitSuggestions(raw: string): { text: string; suggestions: string[] } {
  const marker = raw.lastIndexOf("@@SUGGEST@@");
  if (marker === -1) return { text: raw.trim(), suggestions: [] };
  const text = raw.slice(0, marker).trim();
  const tail = raw.slice(marker + "@@SUGGEST@@".length).trim();
  let suggestions: string[] = [];
  try {
    const start = tail.indexOf("[");
    const end = tail.lastIndexOf("]");
    if (start !== -1 && end > start) {
      const arr = JSON.parse(tail.slice(start, end + 1));
      if (Array.isArray(arr)) {
        suggestions = arr
          .filter((s) => typeof s === "string")
          .map((s) => String(s).trim())
          .filter((s) => s.length > 0 && s.length <= 90)
          .slice(0, 4);
      }
    }
  } catch (_) { /* بلا اقتراحات */ }
  return { text, suggestions };
}

// شبكة أمان: إزالة أي رموز Markdown تسرّبت رغم التعليمات
function stripMarkdown(raw: string): string {
  const out: string[] = [];
  for (let line of raw.split("\n")) {
    const t = line.trim();
    if (/^([-*_])\1{2,}$/.test(t.replace(/\s/g, ""))) continue;
    if (/^\|[\s:|-]*\|$/.test(t)) continue;
    if (t.startsWith("|") && t.endsWith("|") && t.length > 2) {
      const cells = t.slice(1, -1).split("|").map((c) => c.trim()).filter((c) => c !== "");
      line = cells.length ? "• " + cells.join(" — ") : "";
      if (!line) continue;
    }
    line = line.replace(/^\s*#{1,6}\s*/, "");
    line = line.replace(/\*\*(.+?)\*\*/g, "$1").replace(/__(.+?)__/g, "$1");
    line = line.replace(/^(\s*)[-*]\s+/, "$1• ");
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

async function runAgent(payload: any): Promise<Response> {
  const userName = String(payload?.user_name || "موظف");
  const attachment = payload?.attachment ?? null;
  const history = Array.isArray(payload?.messages) ? payload.messages : [];
  const messages: any[] = history.slice(-12).map((m: any) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content ?? "") }));
  if (messages.length === 0) return json({ error: "لا توجد رسالة" }, 400);

  const model = await getAssistantModel();
  const actions: string[] = [];
  let finalText = "";

  const attachNote = attachment?.url
    ? `\nأرفق الموظف ملفاً في رسالته الأخيرة اسمه: «${attachment.name}». إن طلب حفظه فاستخدم أداة save_attachment بعد تحديد القضية (اسأله عن رقمها إن لم يذكره).`
    : "";

  for (let iter = 0; iter < 8; iter++) {
    const aiRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model, max_tokens: 4000, system: `${AGENT_SYSTEM}\nالموظف الحالي: ${userName}. تاريخ اليوم: ${isoToday()}.${attachNote}`, tools: AGENT_TOOLS, messages }),
    });
    const data = await aiRes.json();
    if (!aiRes.ok) return json({ error: "خطأ من مزوّد الذكاء الاصطناعي", detail: data?.error?.message }, 502);

    const content = data.content || [];
    const toolUses = content.filter((b: any) => b.type === "tool_use");
    finalText = content.filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();

    if (data.stop_reason !== "tool_use" || toolUses.length === 0) break;

    messages.push({ role: "assistant", content });
    const results: any[] = [];
    for (const tu of toolUses) {
      const out = await runAgentTool(tu.name, tu.input ?? {}, userName, actions, attachment);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
    }
    messages.push({ role: "user", content: results });
  }

  const { text, suggestions } = splitSuggestions(finalText);
  return json({ success: true, text: stripMarkdown(text) || "تم.", actions, suggestions });
}

/* ===================== المهام النصية ===================== */

function buildPrompt(task: string, payload: any): { system: string; user: string; maxTokens: number } {
  switch (task) {
    case "analyze_applicant":
      return {
        system: "أنت مساعد موارد بشرية لشركة محاماة سعودية. حلّل طلب التوظيف بموضوعية وإيجاز، واستفد من السيرة الذاتية إن وُجدت. أجب بالعربية فقط وبصيغة JSON دون أي نص إضافي.",
        user: `حلّل هذا المتقدّم لوظيفة في شركة محاماة:\n\nالاسم: ${payload.full_name || "غير مذكور"}\nالمؤهل: ${payload.qualifications || "غير مذكور"}\nالبريد: ${payload.email || "غير مذكور"}\n${payload.has_cv ? "السيرة الذاتية مرفقة أدناه — اقرأها وحلّلها." : "لا توجد سيرة ذاتية مرفقة."}\n\nأرجِع JSON بالحقول التالية:\n{\n  \"summary\": \"ملخّص موجز للمتقدّم (سطران-ثلاثة)\",\n  \"suggested_role\": \"الوظيفة الأنسب (محامٰ/باحث قانوني/إداري/محاسب/أخرى)\",\n  \"strengths\": [\"نقاط القوة\"],\n  \"concerns\": [\"ملاحظات أو نقاط تحتاج توضيح\"],\n  \"gpa\": \"المعدل الدراسي كما ورد في السيرة مع مقياسه (مثال: 4.5 من 5 أو 88%) أو غير مذكور\",\n  \"experience_years\": \"سنوات الخبرة التقريبية إن وُجدت في السيرة (أو غير مذكور)\",\n  \"fit_score\": رقم من 1 إلى 10,\n  \"recommendation\": \"توصية موجزة (مقابلة/اعتذار/تحت الدراسة)\"\n}`,
        maxTokens: 6000,
      };

    case "extract_ruling":
      return {
        system: "أنت مساعد قانوني لشركة محاماة سعودية، دقيق في قراءة الأحكام والصكوك. استخرج بيانات الحكم من المستند المرفق حرفيّاً دون تخمين. أجب بالعربية فقط وبصيغة JSON دون أي نص إضافي.",
        user: `استخرج بيانات هذا الحكم القضائي / الصك من المستند المرفق أدناه.\nإن كان التاريخ هجريّاً فحوّله إلى ميلادي بصيغة YYYY-MM-DD قدر الإمكان، وأبقِ الهجري كما هو في حقل منفصل.\nاترك أي قيمة لا تجدها = null.\n\nأرجِع JSON بالحقول التالية:\n{\n  \"title\": \"عنوان مختصر للحكم\",\n  \"ruling_number\": \"رقم الحكم/الصك كما هو\",\n  \"ruling_date\": \"تاريخ الحكم ميلادي YYYY-MM-DD\",\n  \"ruling_date_hijri\": \"تاريخ الحكم الهجري كما هو مكتوب\",\n  \"court_name\": \"اسم المحكمة المُصدِرة\",\n  \"result\": \"منطوق / نتيجة الحكم\",\n  \"summary\": \"ملخّص موجز للوقائع والأسباب\"\n}`,
        maxTokens: 8000,
      };

    case "extract_session_minutes":
      return {
        system: "أنت مساعد قانوني لشركة محاماة سعودية، دقيق في قراءة محاضر الجلسات. استخرج ما تمّ في الجلسة من المحضر المرفق حرفيّاً دون تخمين. أجب بالعربية فقط وبصيغة JSON دون أي نص إضافي.",
        user: `استخرج بيانات هذه الجلسة من محضر الجلسة المرفق أدناه.\nاستخرج رقم هذه الجلسة إن ذُكر كعدد صحيح.\nاجعل outcome ملخّصاً دقيقاً موجزاً لما تمّ (لا يتجاوز 120 كلمة).\nحدّد الخطوة القادمة من واقع المحضر:\n- إن أُجّلت الجلسة لتاريخ لاحق ← next_action=\"next_session\" مع التاريخ.\n- إن حُجزت القضية للحكم ← next_action=\"await_ruling\" مع تاريخ النطق.\n- إن صدر حكم نهائي ← next_action=\"case_closed\".\n- غير ذلك ← next_action=\"none\".\nحوّل أي تاريخ هجري إلى ميلادي YYYY-MM-DD. اترك أي قيمة لا تجدها = null.\n\nأرجِع JSON:\n{\n  \"session_number\": رقم الجلسة عدداً أو null,\n  \"outcome\": \"ملخّص دقيق لما تمّ في الجلسة\",\n  \"next_action\": \"none | next_session | await_ruling | case_closed\",\n  \"next_session_date\": \"YYYY-MM-DD أو null\",\n  \"next_session_time\": \"HH:MM أو null\",\n  \"ruling_due_date\": \"YYYY-MM-DD أو null\",\n  \"hijri_note\": \"التواريخ الهجرية كما وردت أو null\"\n}`,
        maxTokens: 8000,
      };

    case "summarize_document":
      return {
        system: "أنت مساعد قانوني لشركة محاماة سعودية. لخّص المستندات بدقة وإيجاز بالعربية، مع إبراز النقاط القانونية المهمة.",
        user: `لخّص المستند التالي، وأبرِز أهم النقاط والالتزامات والتواريخ والمبالغ إن وجدت:\n\n${payload.text || ""}`,
        maxTokens: 4000,
      };

    case "draft":
      return {
        system: "أنت مساعد صياغة قانونية لشركة محاماة سعودية. اكتب بلغة عربية فصحى رسمية واضحة، مناسبة للسياق القضائي السعودي.",
        user: payload.instruction || "",
        maxTokens: 6000,
      };

    case "chat":
      return {
        system: payload.system || "أنت مساعد ذكي لشركة محاماة سعودية. أجب بالعربية بإيجاز ودقة.",
        user: payload.message || "",
        maxTokens: 4000,
      };

    default:
      return { system: "أنت مساعد مفيد.", user: payload.message || payload.text || "", maxTokens: 2048 };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  if (!ANTHROPIC_API_KEY) {
    return json({ error: "مفتاح Anthropic غير مُعدّ.", missing_key: true }, 500);
  }

  try {
    const body = await req.json();
    const { task, payload } = body ?? {};
    if (!task) return json({ error: "task مطلوب" }, 400);

    if (task === "agent") return await runAgent(payload ?? {});

    const p = payload ?? {};
    let doc: Doc | null = null;
    if (task === "analyze_applicant" && p.cv_url) {
      doc = await fetchDocAsBase64(p.cv_url);
      p.has_cv = !!doc;
    }
    if ((task === "extract_ruling" || task === "extract_session_minutes") && p.doc_url) {
      doc = await fetchDocAsBase64(p.doc_url);
      p.has_doc = !!doc;
    }

    const { system, user, maxTokens } = buildPrompt(task, p);
    if (!user || !String(user).trim()) return json({ error: "لا يوجد محتوى للمعالجة" }, 400);

    const block = doc ? buildDocBlock(doc) : null;
    const messageContent: any = block ? [block, { type: "text", text: user }] : user;

    const model = await getAssistantModel();
    const aiRes = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: messageContent }],
      }),
    });

    const data = await aiRes.json();
    if (!aiRes.ok) {
      return json({ error: "خطأ من مزوّد الذكاء الاصطناعي", detail: data?.error?.message || JSON.stringify(data) }, 502);
    }

    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();

    let parsed = null;
    if (task === "analyze_applicant" || task === "extract_ruling" || task === "extract_session_minutes") {
      parsed = parseLoose(text);
    }

    if (task === "analyze_applicant" && parsed && p.application_id) {
      try {
        const gpaVal = parsed.gpa && !String(parsed.gpa).includes("غير مذكور") ? String(parsed.gpa) : null;
        await admin.from("staff_application_analysis").upsert({
          application_id: String(p.application_id),
          fit_score: Number(parsed.fit_score) || null,
          gpa: gpaVal,
          experience_years: parsed.experience_years ? String(parsed.experience_years) : null,
          suggested_role: parsed.suggested_role ?? null,
          summary: parsed.summary ?? null,
          recommendation: parsed.recommendation ?? null,
          used_cv: !!doc,
          analyzed_at: new Date().toISOString(),
          analyzed_by: p.analyzed_by ? String(p.analyzed_by) : null,
        }, { onConflict: "application_id" });
      } catch (_) { /* الحفظ ثانوي */ }
    }

    return json({ success: true, text, parsed, stop_reason: data.stop_reason, used_cv: task === "analyze_applicant" ? !!doc : undefined, used_doc: !!doc, usage: data.usage });
  } catch (e) {
    return json({ error: "حدث خطأ غير متوقّع", detail: String((e as Error)?.message || e) }, 500);
  }
});
