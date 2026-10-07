// استخراج بيانات محضر ضبط الجلسة — يخدم زر «تعبئة تلقائية من المحضر».
//
// ⚠️ سبب وجود هذه الدالة منفصلة عن ai-assistant:
//    كان الاستخراج داخل ai-assistant بسقف max_tokens = 2000، والنموذج يستهلك
//    ~1900 منها في التفكير الداخلي، فيُقطع الـJSON في منتصف جملة ويفشل تحليله،
//    فتُرجع الدالة parsed=null وتصمت الواجهة. الحل هنا: سقف واسع + تحليل متسامح
//    + رسالة خطأ صريحة بدل الصمت.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-sonnet-5";

// ⚠️ واسع عمداً: التفكير الداخلي يأكل من نفس الميزانية.
const MAX_TOKENS = 8000;

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

// اسم النموذج من إعدادات القاعدة (نفس مصدر ai-assistant)
async function getModel(): Promise<string> {
  try {
    const { data } = await admin
      .from("lookup_values").select("value").eq("type", "ai_config").limit(1).maybeSingle();
    if (data?.value) {
      const cfg = JSON.parse(data.value as string);
      if (cfg.assistant_model) return String(cfg.assistant_model);
    }
  } catch (_) { /* الافتراضي */ }
  return FALLBACK_MODEL;
}

type Doc = { base64: string; mediaType: string; kind: "pdf" | "image" };

async function fetchDoc(url: string): Promise<Doc | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) return null;
    let binary = "";
    const chunk = 8192;
    for (let i = 0; i < buf.length; i += chunk) binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    const base64 = btoa(binary);

    let mediaType = ct;
    const u = url.toLowerCase();
    if (!mediaType || mediaType === "application/octet-stream") {
      if (u.endsWith(".png")) mediaType = "image/png";
      else if (u.endsWith(".jpg") || u.endsWith(".jpeg")) mediaType = "image/jpeg";
      else if (u.endsWith(".webp")) mediaType = "image/webp";
      else if (u.endsWith(".gif")) mediaType = "image/gif";
      else mediaType = "application/pdf";
    }
    if (mediaType === "application/pdf") return { base64, mediaType, kind: "pdf" };
    if (mediaType.startsWith("image/")) return { base64, mediaType, kind: "image" };
    return null;
  } catch (_) {
    return null;
  }
}

/** تحليل متسامح: يتجاوز سياج ```json وأي كلام قبل/بعد الكائن. */
function parseLoose(text: string): any | null {
  const attempts = [
    text,
    text.replace(/```json|```/g, ""),
  ];
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

const SYSTEM =
  "أنت مساعد قانوني لشركة محاماة سعودية، دقيق في قراءة محاضر الجلسات. " +
  "استخرج ما تمّ في الجلسة من المحضر المرفق حرفيّاً دون تخمين. " +
  "أجب بالعربية فقط وبصيغة JSON خام دون أي نص أو شرح أو سياج قبله أو بعده.";

// ⚠️ 2026-10-07 (طلب المدير: «اشوف الملخص مرة قصير إذا سجل المحضر»): كان outcome «ملخّصاً موجزاً لا يتجاوز
// 120 كلمة» فجاء متوسطه ٤٦ كلمة وضاع فيه ما قدّمه كل طرف وما قررته الدائرة والمطلوب منا. صار المحضر يُفكَّك
// أقساماً بلا سقف (outcome يُركَّب منها هنا)، وملخّص قصير منفصل للتقرير والقوائم، و«المطلوب منا» قائمة بمواعيدها
// تصير مهام. (الحضور مستبعد بقرار المدير: «مالها داعي».)
function userPrompt(ctx: { client?: string | null; matter?: string | null }) {
  const who = ctx.client
    ? `موكّلنا (طرفنا) هو: «${ctx.client}»${ctx.matter ? ` في «${ctx.matter}»` : ""}. «طرفنا» = موكّلنا ووكيله (المكتب)، و«الخصم» = الطرف الآخر.`
    : `«طرفنا» = الطرف الذي يمثّله المكتب (الوكيل الحاضر عن موكّلنا)، و«الخصم» = الطرف الآخر.`;
  return `استخرج بيانات هذه الجلسة من محضر الجلسة المرفق أدناه. ${who}

القواعد:
- انقل ما ورد في المحضر كاملاً وبدقة ولا تختصر مضمونه — كل طلب أو دفع أو مستند أو قرار يُذكر. لا تضف شيئاً ليس في المحضر.
- كل قسم نقاط قصيرة واضحة (كل نقطة جملة)، بلا مقدمات. القسم الذي لا يرد له شيء في المحضر = [].
- لا تذكر الحضور والغياب.
- «المطلوب منا»: كل ما كلّفت به الدائرةُ طرفَنا أو يلزمنا فعله قبل الموعد القادم (تقديم مذكرة، إحضار مستند، رد على طلب، سداد…)، مع موعده إن ذُكر أو كان هو موعد الجلسة القادمة.
- التواريخ: انقل التاريخ الهجري كما ورد في حقل *_hijri (مثل 1448/04/23) ولا تحوّله بنفسك — يحوّله النظام بتقويم أم القرى. وإن ورد التاريخ ميلادياً فضعه في الحقل الميلادي YYYY-MM-DD. اترك أي قيمة لا تجدها = null.
- حدّد الخطوة القادمة: أُجّلت لتاريخ ← next_session، حُجزت للحكم ← await_ruling، صدر حكم نهائي ← case_closed، غير ذلك ← none.

أرجِع JSON:
{
  "session_number": رقم الجلسة عدداً أو null,
  "summary": "ما انتهت إليه الجلسة في جملة أو جملتين لا تتجاوزان 40 كلمة — للعرض السريع وتقرير العميل، بلا أسماء الخصوم الكاملة ولا أرقام المواد",
  "our_submissions": ["ما قدّمه طرفنا أو طلبه أو دفع به"],
  "opponent_submissions": ["ما قدّمه الخصم أو طلبه أو دفع به"],
  "court_decisions": ["ما قررته الدائرة أو طلبته أو أمرت به"],
  "our_obligations": [{"task": "المطلوب منا بصيغة أمر قصيرة", "due_date": "YYYY-MM-DD أو null", "due_date_hijri": "كما ورد أو null"}],
  "postponement_reason": "سبب التأجيل كما ورد أو null",
  "next_action": "none | next_session | await_ruling | case_closed",
  "next_session_date": "YYYY-MM-DD أو null",
  "next_session_date_hijri": "كما ورد أو null",
  "next_session_time": "HH:MM أو null",
  "ruling_due_date": "YYYY-MM-DD أو null",
  "ruling_due_date_hijri": "كما ورد أو null",
  "hijri_note": "التواريخ الهجرية كما وردت أو null"
}`;
}

/**
 * هجري كما قرأه النموذج («1448/04/23 هـ»، «٢٣/٠٤/١٤٤٨») ← ميلادي بتقويم أم القرى. النموذج يقرأ الهجري
 * صحيحاً ويخطئ في تحويله بيوم (بلاغ المدير 2026-10-07 في الصك)، فالتحويل هنا لا عنده. null = لا يُفهم.
 */
function hijriTextToISO(text: unknown): string | null {
  if (!text) return null;
  const latin = String(text).replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)));
  const n = (latin.match(/\d+/g) ?? []).map(Number);
  if (n.length < 3) return null;
  let y: number, m: number, d: number;
  if (n[0] >= 1300 && n[0] <= 1600) [y, m, d] = [n[0], n[1], n[2]];
  else if (n[2] >= 1300 && n[2] <= 1600) [d, m, y] = [n[0], n[1], n[2]];
  else return null;
  if (m < 1 || m > 12 || d < 1 || d > 30) return null;
  const fmt = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { year: "numeric", month: "numeric", day: "numeric", timeZone: "UTC" });
  const approx = Date.UTC(622, 6, 16) + ((y - 1) * 354.367 + (m - 1) * 29.53 + (d - 1)) * 864e5;
  for (let off = -45; off <= 45; off++) {
    const t = new Date(approx + off * 864e5);
    const p = Object.fromEntries(fmt.formatToParts(t).map((x) => [x.type, x.value]));
    if (Number(p.year) === y && Number(p.month) === m && Number(p.day) === d) return t.toISOString().slice(0, 10);
  }
  return null;
}

/** الميلادي: من الهجري المقروء إن وُجد، وإلا ميلادي المحضر نفسه */
const pickDate = (greg: unknown, hijri: unknown): string | null =>
  hijriTextToISO(hijri) ?? (/^\d{4}-\d{2}-\d{2}$/.test(String(greg ?? "")) ? String(greg) : null);

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x ?? "").trim()).filter(Boolean) : [];

const ymd = (d: string) => d.replaceAll("-", "/");

/** نتيجة الجلسة كاملةً بأقسامها — ما يُحفظ في sessions.outcome ويظهر في الملف */
function composeOutcome(p: any): string {
  const parts: string[] = [];
  const sec = (title: string, items: string[]) => {
    if (items.length) parts.push(`${title}:\n${items.map((x) => `• ${x}`).join("\n")}`);
  };
  sec("ما قدّمه طرفنا", list(p.our_submissions));
  sec("ما قدّمه الخصم", list(p.opponent_submissions));
  sec("قرار الدائرة", list(p.court_decisions));
  const obligations = (Array.isArray(p.our_obligations) ? p.our_obligations : [])
    .map((o: any) => {
      const t = String(o?.task ?? "").trim();
      if (!t) return "";
      const d = /^\d{4}-\d{2}-\d{2}$/.test(String(o?.due_date ?? "")) ? ` (بحلول ${ymd(o.due_date)})` : "";
      return t + d;
    })
    .filter(Boolean);
  sec("المطلوب منا", obligations);
  const reason = String(p.postponement_reason ?? "").trim();
  if (reason && reason !== "null") parts.push(`سبب التأجيل: ${reason}`);
  return parts.join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح Anthropic غير مُعدّ على الخادم." }, 500);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "طلب غير صالح" }, 400);
  }

  const docUrl = String(body?.doc_url ?? "").trim();
  const ctx = {
    client: body?.client_name ? String(body.client_name).slice(0, 200) : null,
    matter: body?.case_title ? String(body.case_title).slice(0, 200) : null,
  };
  if (!docUrl) return json({ error: "لم يُحدَّد ملف المحضر" }, 400);

  const doc = await fetchDoc(docUrl);
  if (!doc)
    return json(
      { error: "تعذّر قراءة الملف — تأكّد أنه PDF أو صورة وأن حجمه أقل من 10 ميغابايت." },
      400
    );

  const block =
    doc.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.base64 } }
      : { type: "image", source: { type: "base64", media_type: doc.mediaType, data: doc.base64 } };

  try {
    const model = await getModel();
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM,
        messages: [{ role: "user", content: [block, { type: "text", text: userPrompt(ctx) }] }],
      }),
    });

    const data = await res.json();
    if (!res.ok)
      return json({ error: `خطأ من مزوّد الذكاء الاصطناعي: ${data?.error?.message ?? "غير معروف"}` }, 502);

    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    const parsed = parseLoose(text);

    // ⚠️ لا نصمت عند الفشل: نُرجع سبباً يظهر للموظف بدل زر لا يفعل شيئاً.
    if (!parsed) {
      const truncated = data?.stop_reason === "max_tokens";
      return json(
        {
          error: truncated
            ? "المحضر طويل ولم يكتمل التحليل. جرّب صفحات أقل أو أعد المحاولة."
            : "قُرئ المحضر لكن تعذّر فهم النتيجة. أعد المحاولة أو املأ الحقول يدوياً.",
          stop_reason: data?.stop_reason ?? null,
          raw_preview: text.slice(0, 300),
        },
        422
      );
    }

    // التواريخ بأم القرى من الهجري المقروء (لا من تحويل النموذج)
    parsed.next_session_date = pickDate(parsed.next_session_date, parsed.next_session_date_hijri);
    parsed.ruling_due_date = pickDate(parsed.ruling_due_date, parsed.ruling_due_date_hijri);
    if (Array.isArray(parsed.our_obligations)) {
      parsed.our_obligations = parsed.our_obligations.map((o: any) => ({ ...o, due_date: pickDate(o?.due_date, o?.due_date_hijri) }));
    }
    // outcome = الأقسام كاملة (يُحفظ في الجلسة)، وsummary للتقرير والقوائم. وإن لم تأتِ أقسام فالملخّص وحده.
    const full = composeOutcome(parsed);
    const summary = String(parsed.summary ?? "").trim();
    parsed.outcome = full ? (summary ? `${summary}\n\n${full}` : full) : summary;
    parsed.our_obligations = (Array.isArray(parsed.our_obligations) ? parsed.our_obligations : [])
      .map((o: any) => ({
        task: String(o?.task ?? "").trim(),
        due_date: /^\d{4}-\d{2}-\d{2}$/.test(String(o?.due_date ?? "")) ? o.due_date : null,
      }))
      .filter((o: any) => o.task);
    return json({ success: true, parsed, usage: data.usage, stop_reason: data.stop_reason });
  } catch (e) {
    return json({ error: `تعذّر تحليل المحضر: ${String((e as Error)?.message || e)}` }, 500);
  }
});
