// قراءة هوية الموظف وتعبئة رقم الهوية وتاريخ الميلاد منها (طلب المدير 2026-09-28: «تاريخ الميلاد
// ورقم الهوية للموظف تتعبئ تلقائياً من مستندات الموظف»).
//
// يناديها ترقر member_documents عند رفع «الهوية الوطنية» من الويب أو الآيفون (سرّ في app_secrets)،
// أو المدير/الموظف نفسه بجلسته. **تملأ الفارغ وحده** — ما سُجّل من قبل لا يُطمس: إن خالفته الهوية،
// أو بدا أن الهوية لشخص آخر، لا يُكتب شيء ويُبلَّغ المدير ليحسم.
// الهجري يُحوَّل هنا بأم القرى لا بتقدير النموذج (درس office-doc-extract).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 4000;

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-doc-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** هجري (أم القرى) ← ميلادي: تقدير ثم بحث يوماً بيوم يطابقه تقويم ICU */
function hijriToGregorian(h: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(h.trim());
  if (!m) return null;
  const [hy, hm, hd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (hm < 1 || hm > 12 || hd < 1 || hd > 30) return null;
  const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
  const approx = Date.UTC(622, 6, 16) + ((hy - 1) * 354.367 + (hm - 1) * 29.53 + (hd - 1)) * 864e5;
  for (let off = -45; off <= 45; off++) {
    const t = new Date(approx + off * 864e5);
    const parts = Object.fromEntries(fmt.formatToParts(t).map((p) => [p.type, p.value]));
    if (Number(parts.year) === hy && Number(parts.month) === hm && Number(parts.day) === hd) {
      return t.toISOString().slice(0, 10);
    }
  }
  return null;
}

/** رقم الهوية/الإقامة السعودي: ١٠ أرقام يبدأ بـ1 أو 2، وخانة تحقق (لون) */
function validSaudiId(id: string): boolean {
  if (!/^[12]\d{9}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let d = Number(id[i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const toLatin = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const ymd = (iso: string) => iso.replaceAll("-", "/");

async function getModel(): Promise<string> {
  try {
    const { data } = await admin.from("lookup_values").select("value").eq("type", "ai_config").limit(1).maybeSingle();
    if (data?.value) {
      const cfg = JSON.parse(data.value as string);
      if (cfg.assistant_model) return String(cfg.assistant_model);
    }
  } catch (_) { /* الافتراضي */ }
  return FALLBACK_MODEL;
}

const TOOL = {
  name: "record_id_card",
  description: "سجّل بيانات بطاقة الهوية كما وردت فيها حرفياً.",
  input_schema: {
    type: "object",
    properties: {
      is_id_card: { type: "boolean", description: "هل المستند بطاقة هوية وطنية أو إقامة فعلاً؟" },
      id_number: { type: ["string", "null"], description: "رقم الهوية/السجل المدني/الإقامة (١٠ أرقام) كما ورد، أو null" },
      name_on_card: { type: ["string", "null"], description: "الاسم كما في البطاقة" },
      date_of_birth: { type: ["string", "null"], description: "تاريخ الميلاد الميلادي **إن ورد ميلادياً** YYYY-MM-DD، وإلا null (لا تحوّل الهجري بنفسك)" },
      date_of_birth_hijri: { type: ["string", "null"], description: "تاريخ الميلاد الهجري كما ورد YYYY-MM-DD (مثل 1419-01-26)، أو null" },
      same_person: { type: "boolean", description: "هل الاسم في البطاقة لنفس الموظف المذكور (يكفي تطابق الاسم الأول واسم العائلة)؟" },
    },
    required: ["is_id_card", "same_person"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح Anthropic غير مُعدّ على الخادم." }, 500);

  const body = await req.json().catch(() => ({}));
  const docId = String(body?.document_id ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return json({ error: "معرّف المرفق غير صالح" }, 400);

  const { data: doc } = await admin
    .from("member_documents")
    .select("id, member_id, doc_type, file_path, uploaded_by")
    .eq("id", docId)
    .maybeSingle();
  if (!doc) return json({ error: "المرفق غير موجود" }, 404);
  if (doc.doc_type !== "national_id") return json({ error: "ليس مرفق هوية" }, 400);

  // ===== من المتصل؟ ترقر القاعدة بسرّه، أو المدير، أو الموظف لمرفقه =====
  const { data: sec } = await admin.from("app_secrets").select("value").eq("key", "MEMBER_DOC_SECRET").maybeSingle();
  const fromTrigger = !!sec?.value && req.headers.get("x-doc-secret") === sec.value;
  if (!fromTrigger) {
    const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "سجّل الدخول أولاً" }, 401);
    const { data: me } = await admin
      .from("team_members")
      .select("id, is_director, is_active, is_reviewer")
      .eq("auth_id", u.user.id)
      .maybeSingle();
    if (!me || me.is_active === false || me.is_reviewer || (!me.is_director && me.id !== doc.member_id)) {
      return json({ error: "غير مصرّح" }, 403);
    }
  }

  const { data: member } = await admin
    .from("team_members")
    .select("id, name, id_number, date_of_birth")
    .eq("id", doc.member_id)
    .maybeSingle();
  if (!member) return json({ error: "الموظف غير موجود" }, 404);

  const dl = await admin.storage.from("staff-docs").download(doc.file_path);
  if (dl.error || !dl.data) return json({ error: "تعذّر تنزيل الهوية من المخزن" }, 400);
  const buf = new Uint8Array(await dl.data.arrayBuffer());
  if (buf.length === 0 || buf.length > 10 * 1024 * 1024) return json({ error: "الملف فارغ أو أكبر من 10 م.ب" }, 400);

  const lower = doc.file_path.toLowerCase();
  const mediaType = lower.endsWith(".pdf")
    ? "application/pdf"
    : lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
          ? "image/jpeg"
          : null;
  if (!mediaType) return json({ ok: true, skipped: "نوع ملف لا يُقرأ (PDF أو صورة فقط)" });

  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  const block = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: mediaType, data: b64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };

  let out: Record<string, unknown>;
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: await getModel(),
        max_tokens: MAX_TOKENS,
        system: "أنت موظف موارد بشرية دقيق. تقرأ بطاقة الهوية وتسجّل ما فيها حرفياً بلا تخمين.",
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{
          role: "user",
          content: [block, {
            type: "text",
            text: `هذه بطاقة هوية الموظف «${member.name}». سجّل رقمها وتاريخ الميلاد. ما لم يُقرأ بوضوح = null. ` +
              `التاريخ الهجري في حقله الهجري كما ورد ولا تحوّله.`,
          }],
        }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: `تعذّرت القراءة: ${data?.error?.message ?? res.status}` }, 502);
    out = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use")?.input ?? null;
    if (!out) return json({ error: "لم يُرجع الذكاء بيانات" }, 502);
  } catch (e) {
    return json({ error: `تعذّرت القراءة: ${String((e as Error)?.message ?? e)}` }, 500);
  }

  // ===== تحقق مما قرأه النموذج قبل أي كتابة =====
  const rawId = out.id_number ? toLatin(String(out.id_number)).replace(/\D/g, "") : "";
  const idNumber = validSaudiId(rawId) ? rawId : null;
  let dob: string | null = null;
  const h = out.date_of_birth_hijri ? toLatin(String(out.date_of_birth_hijri)) : "";
  if (h) dob = hijriToGregorian(h);
  if (!dob && out.date_of_birth && /^\d{4}-\d{2}-\d{2}$/.test(toLatin(String(out.date_of_birth)))) {
    dob = toLatin(String(out.date_of_birth));
  }
  // عمر معقول لموظف: بين ١٥ و٩٠ سنة
  if (dob) {
    const age = (Date.now() - Date.parse(dob)) / (365.25 * 864e5);
    if (!(age >= 15 && age <= 90)) dob = null;
  }

  const problems: string[] = [];
  if (!out.is_id_card) problems.push("المرفق لا يبدو بطاقة هوية");
  else if (!out.same_person) problems.push(`الاسم في البطاقة («${out.name_on_card ?? "؟"}») لا يطابق اسم الموظف`);

  const patch: Record<string, string> = {};
  const filled: string[] = [];
  if (problems.length === 0) {
    if (idNumber) {
      if (!member.id_number) {
        patch.id_number = idNumber;
        filled.push(`رقم الهوية ${idNumber}`);
      } else if (member.id_number !== idNumber) {
        problems.push(`رقم الهوية في البطاقة ${idNumber} والمسجّل ${member.id_number}`);
      }
    }
    if (dob) {
      if (!member.date_of_birth) {
        patch.date_of_birth = dob;
        filled.push(`تاريخ الميلاد ${ymd(dob)}`);
      } else if (member.date_of_birth !== dob) {
        problems.push(
          `تاريخ الميلاد في البطاقة ${ymd(dob)}${h ? ` (${ymd(h)} هـ)` : ""} والمسجّل ${ymd(member.date_of_birth)}`
        );
      }
    }
  }

  if (Object.keys(patch).length) {
    const { error } = await admin.from("team_members").update(patch).eq("id", member.id);
    if (error) return json({ error: `تعذّر الحفظ: ${error.message}` }, 500);
  }

  // التعارض يحسمه المدير — لا يُطمس المسجّل بصمت
  if (problems.length) {
    const { data: directors } = await admin.from("team_members").select("id").eq("is_director", true).eq("is_active", true);
    const rows = (directors ?? []).map((d) => ({
      type: "member_doc",
      title: `🪪 هوية ${member.name} تحتاج نظرتك`,
      message: problems.join(" · ") + " — لم يُغيَّر شيء.",
      recipient_id: d.id,
    }));
    if (rows.length) await admin.from("notifications").insert(rows);
  }

  return json({ ok: true, filled, problems, read: { id_number: idNumber, date_of_birth: dob, date_of_birth_hijri: h || null } });
});
