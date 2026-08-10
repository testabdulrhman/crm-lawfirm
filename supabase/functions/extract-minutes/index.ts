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

const USER = `استخرج بيانات هذه الجلسة من محضر الجلسة المرفق أدناه.
استخرج رقم هذه الجلسة إن ذُكر كعدد صحيح.
اجعل outcome ملخّصاً دقيقاً موجزاً لما تمّ (لا يتجاوز 120 كلمة).
حدّد الخطوة القادمة من واقع المحضر:
- إن أُجّلت الجلسة لتاريخ لاحق ← next_action="next_session" مع التاريخ.
- إن حُجزت القضية للحكم ← next_action="await_ruling" مع تاريخ النطق.
- إن صدر حكم نهائي ← next_action="case_closed".
- غير ذلك ← next_action="none".
حوّل أي تاريخ هجري إلى ميلادي YYYY-MM-DD. اترك أي قيمة لا تجدها = null.

أرجِع JSON:
{
  "session_number": رقم الجلسة عدداً أو null,
  "outcome": "ملخّص دقيق لما تمّ في الجلسة",
  "next_action": "none | next_session | await_ruling | case_closed",
  "next_session_date": "YYYY-MM-DD أو null",
  "next_session_time": "HH:MM أو null",
  "ruling_due_date": "YYYY-MM-DD أو null",
  "hijri_note": "التواريخ الهجرية كما وردت أو null"
}`;

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
        messages: [{ role: "user", content: [block, { type: "text", text: USER }] }],
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

    return json({ success: true, parsed, usage: data.usage, stop_reason: data.stop_reason });
  } catch (e) {
    return json({ error: `تعذّر تحليل المحضر: ${String((e as Error)?.message || e)}` }, 500);
  }
});
