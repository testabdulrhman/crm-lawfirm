// قراءة مستند المكتب بالذكاء (طلب المدير 2026-09-26: «اقدر ارفع ملف بشكل مباشر والنظام يصنّف
// لي المستند ويدخل البيانات تلقائي»).
//
// تستقبل مسار الملف بعد رفعه (مخزن documents، مجلد office/) وتُرجع: اسم المستند وتصنيفه ورقمه
// وجهة إصداره وتاريخي الإصدار والانتهاء — ومطابقته بمستند مسجّل (شهادة الزكاة المسجّلة بلا ملف
// مثلاً) ليُحدَّث بدل أن يتكرر. **لا تكتب في القاعدة**: الواجهة تعرض النتيجة لتُراجَع ثم تُحفظ.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 6000; // التفكير الداخلي يأكل من الميزانية — لا تُنقصها

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

/** هجري (أم القرى) ← ميلادي بلا تخمين: تقدير ثم بحث يوماً بيوم يطابقه تقويم ICU */
function hijriToGregorian(h: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(h.trim());
  if (!m) return null;
  const [hy, hm, hd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (hm < 1 || hm > 12 || hd < 1 || hd > 30) return null;
  const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
  // ١ محرم ١ هـ ≈ 622-07-16؛ السنة الهجرية ≈ 354.367 يوماً
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

function jwtRole(t: string): string | null {
  try {
    const p = t.split(".")[1];
    return JSON.parse(atob(p.replace(/-/g, "+").replace(/_/g, "/"))).role ?? null;
  } catch {
    return null;
  }
}

const CATEGORIES = ["license", "certificate", "registration", "membership", "contract", "other"] as const;

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
  name: "record_office_document",
  description: "سجّل بيانات مستند المكتب كما وردت فيه.",
  input_schema: {
    type: "object",
    properties: {
      name: { type: "string", description: "اسم المستند الشائع بالعربية، مثل: شهادة الزكاة · شهادة ضريبة القيمة المضافة · السجل التجاري · ترخيص مزاولة أعمال المحاماة" },
      category: { type: "string", enum: [...CATEGORIES], description: "license ترخيص · certificate شهادة · registration سجل/قيد · membership عضوية · contract عقد · other" },
      doc_number: { type: ["string", "null"], description: "رقم الشهادة/الترخيص/السجل كما هو، أو null" },
      issuing_authority: { type: ["string", "null"], description: "الجهة المُصدِرة، مثل: هيئة الزكاة والضريبة والجمارك · وزارة العدل · منشآت" },
      issue_date: { type: ["string", "null"], description: "تاريخ الإصدار الميلادي **إن ورد ميلادياً في المستند** YYYY-MM-DD، وإلا null (لا تحوّل الهجري بنفسك)" },
      expiry_date: { type: ["string", "null"], description: "تاريخ الانتهاء/صالحة حتى الميلادي **إن ورد ميلادياً** YYYY-MM-DD، وإلا null (لا تحوّل الهجري بنفسك)" },
      issue_date_hijri: { type: ["string", "null"], description: "تاريخ الإصدار الهجري كما ورد بصيغة YYYY-MM-DD (مثل 1447-10-19)، أو null إن لم يرد هجرياً" },
      expiry_date_hijri: { type: ["string", "null"], description: "تاريخ الانتهاء الهجري كما ورد بصيغة YYYY-MM-DD، أو null" },
      hijri_note: { type: ["string", "null"], description: "التواريخ الهجرية كما وردت إن وُجدت" },
      summary: { type: "string", description: "سطر واحد: ماذا يثبت هذا المستند ولمن" },
      match_id: { type: ["string", "null"], description: "معرّف المستند المسجّل الذي هذه نسخته (نفس النوع ولو اختلفت الصياغة)، أو null إن كان مستنداً جديداً" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["name", "category", "summary", "confidence"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح Anthropic غير مُعدّ على الخادم." }, 500);

  // ===== من المتصل؟ موظف نشط فقط (لا متعاون خارجي ولا حساب مراجعة) =====
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  // نداء الخادم نفسه: مفتاح بدور service_role — البوابة (verify_jwt) تحققت من توقيعه قبل وصوله هنا
  const internal = jwtRole(token) === "service_role";
  const { data: u } = internal ? { data: null } : await admin.auth.getUser(token);
  if (!internal) {
    if (!u?.user) return json({ error: "سجّل الدخول أولاً" }, 401);
    const { data: me } = await admin
      .from("team_members")
      .select("id, is_active, is_reviewer, member_type")
      .eq("auth_id", u.user.id)
      .maybeSingle();
    if (!me || me.is_active === false || me.is_reviewer || me.member_type === "collaborator") {
      return json({ error: "غير مصرّح" }, 403);
    }
  }

  const body = await req.json().catch(() => ({}));
  const path = String(body?.file_path ?? "").trim();
  if (!path.startsWith("office/")) return json({ error: "مسار الملف غير صالح" }, 400);

  const dl = await admin.storage.from("documents").download(path);
  if (dl.error || !dl.data) return json({ error: "تعذّر تنزيل الملف من المخزن" }, 400);
  const buf = new Uint8Array(await dl.data.arrayBuffer());
  if (buf.length === 0 || buf.length > 10 * 1024 * 1024) return json({ error: "الملف فارغ أو أكبر من 10 م.ب" }, 400);

  const lower = path.toLowerCase();
  const mediaType = lower.endsWith(".pdf")
    ? "application/pdf"
    : lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
        ? "image/webp"
        : lower.endsWith(".jpg") || lower.endsWith(".jpeg")
          ? "image/jpeg"
          : null;
  if (!mediaType) return json({ error: "يُقرأ PDF أو صورة فقط — احفظ الملف PDF وارفعه" }, 400);

  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const b64 = btoa(bin);
  const block = mediaType === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: mediaType, data: b64 } }
    : { type: "image", source: { type: "base64", media_type: mediaType, data: b64 } };

  // المستندات المسجّلة — ليطابق الجديد بنسخته القديمة بدل أن يكررها
  const { data: existing } = await admin
    .from("office_documents")
    .select("id, name, doc_number, issuing_authority")
    .order("created_at");
  const list = (existing ?? [])
    .map((d) => `- ${d.id} | ${d.name}${d.doc_number ? ` | رقم ${d.doc_number}` : ""}${d.issuing_authority ? ` | ${d.issuing_authority}` : ""}`)
    .join("\n");

  const prompt =
    `هذا مستند من مستندات شركة المحاماة نفسها (ترخيص، شهادة حكومية، سجل…). اقرأه وسجّل بياناته.\n\n` +
    `قواعد: لا تخمّن — ما لم يُذكر صراحة = null. التاريخ الهجري يُكتب في حقله الهجري كما ورد ولا تحوّله. ` +
    `«صالحة حتى» أو «تاريخ الانتهاء» = الانتهاء.\n` +
    `تمييز مهم: «شهادة الزكاة» تصدر بعد تقديم الإقرار الزكوي ولها مدة صلاحية؛ و«شهادة التسجيل في ضريبة القيمة ` +
    `المضافة» شهادة قيد برقم ضريبي بلا انتهاء غالباً — هما مستندان مختلفان فلا تخلط بينهما في الاسم ولا المطابقة.\n\n` +
    `المستندات المسجّلة لدى المكتب (المعرّف | الاسم):\n${list || "(لا شيء)"}\n\n` +
    `إن كان هذا المستند نسخة (جديدة أو مجدّدة) من أحدها فضع معرّفه في match_id، وإلا null.`;

  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: await getModel(),
        max_tokens: MAX_TOKENS,
        system: "أنت موظف إداري دقيق في شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس. تقرأ مستندات المكتب الرسمية وتسجّل بياناتها كما وردت حرفياً.",
        tools: [TOOL],
        tool_choice: { type: "tool", name: TOOL.name },
        messages: [{ role: "user", content: [block, { type: "text", text: prompt }] }],
      }),
    });
    const data = await res.json();
    if (!res.ok) return json({ error: `تعذّرت القراءة: ${data?.error?.message ?? res.status}` }, 502);
    const out = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use")?.input;
    if (!out) return json({ error: "لم يُرجع الذكاء بيانات — جرّب مرة أخرى" }, 502);

    // تحقق المطابقة: معرّف من القائمة فعلاً، والتواريخ بصيغة سليمة
    const ids = new Set((existing ?? []).map((d) => d.id));
    if (out.match_id && !ids.has(out.match_id)) out.match_id = null;
    for (const k of ["issue_date", "expiry_date"]) {
      if (out[k] && !/^\d{4}-\d{2}-\d{2}$/.test(out[k])) out[k] = null;
      // الهجري المكتوب هو الأصل — يُحوَّل هنا بأم القرى لا بتقدير النموذج
      const h = out[`${k}_hijri`];
      if (h) {
        const g = hijriToGregorian(String(h));
        if (g) out[k] = g;
      }
    }
    if (!CATEGORIES.includes(out.category)) out.category = "other";
    return json({ ok: true, result: out });
  } catch (e) {
    return json({ error: `تعذّرت القراءة: ${String((e as Error)?.message ?? e)}` }, 500);
  }
});
