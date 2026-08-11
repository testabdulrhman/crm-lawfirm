// استخراج بيانات العقد والتزاماته من ملفه — يخدم زر «استخراج البيانات من ملف العقد».
//
// نفس نمط extract-minutes عمداً: سقف tokens واسع + تحليل متسامح + خطأ صريح.
// ⚠️ لا تُنقص MAX_TOKENS: التفكير الداخلي للنموذج يأكل من نفس الميزانية، وسقف
//    ضيّق يقطع الـJSON في منتصفه فيفشل التحليل بصمت (الدرس المستفاد في v22).
//
// الدالة تقرأ فقط ولا تكتب في القاعدة — الواجهة تعرض النتيجة للمراجعة قبل الحفظ،
// لأن الاستخراج الآلي يخطئ ولا يصح أن يُنشئ التزامات دون إقرار موظف.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-sonnet-5";

const MAX_TOKENS = 12000; // العقود أطول من المحاضر

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
  new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function getModel(): Promise<string> {
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
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const base64 = btoa(binary);

    let mediaType = ct;
    const u = url.toLowerCase();
    if (!mediaType || mediaType === "application/octet-stream") {
      if (u.endsWith(".png")) mediaType = "image/png";
      else if (u.endsWith(".jpg") || u.endsWith(".jpeg")) mediaType = "image/jpeg";
      else if (u.endsWith(".webp")) mediaType = "image/webp";
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

const SYSTEM =
  "أنت مساعد قانوني لشركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس، " +
  "دقيق في قراءة العقود. استخرج ما هو منصوص عليه حرفيّاً في العقد المرفق دون تخمين أو استنتاج. " +
  "أي بند غير مذكور صراحةً اتركه null. " +
  "أجب بالعربية فقط وبصيغة JSON خام دون أي نص أو شرح أو سياج قبله أو بعده.";

const USER = `استخرج بيانات هذا العقد من الملف المرفق.

قواعد ملزِمة:
- لا تخترع بنداً غير مذكور. ما لا تجده = null (وللقوائم = []).
- حوّل أي تاريخ هجري إلى ميلادي بصيغة YYYY-MM-DD.
- المبالغ أرقاماً بلا فواصل ولا كلمة «ريال».
- في obligations ضع الالتزامات ذات **تاريخ محدّد** فقط (دفعة مستحقة، تجديد،
  مهلة إشعار، تسليم، انتهاء سريان). لا تضع التزامات عامة بلا تاريخ.
- اجعل summary ملخّصاً دقيقاً لا يتجاوز 120 كلمة.
- client_name = **الموكّل**: الطرف المتعاقد مع شركة المحاماة. قد يكون الطرف الأول
  أو الثاني حسب صياغة العقد. **لا تضع اسم شركة المحاماة نفسها موكّلاً أبداً.**
- type = تصنيف موجز للعقد في ٣ كلمات فأقل (مثل: «اتفاقية أتعاب» · «تحصيل ديون»)،
  لا نسخ عنوان العقد كاملاً.

أرجِع JSON بهذا الشكل تماماً:
{
  "title": "عنوان العقد أو null",
  "type": "تصنيف موجز أو null",
  "client_name": "اسم الموكّل أو null",
  "signed_date": "YYYY-MM-DD أو null",
  "start_date": "YYYY-MM-DD أو null",
  "end_date": "YYYY-MM-DD أو null",
  "fees_total": رقم أو null,
  "payment_terms": "طريقة/جدولة الدفع أو null",
  "scope": "نطاق العمل أو null",
  "auto_renew": true أو false أو null,
  "notice_period_days": عدد أيام مهلة الإشعار بالإنهاء أو null,
  "summary": "ملخّص العقد",
  "obligations": [
    {
      "title": "وصف الالتزام موجزاً",
      "due_date": "YYYY-MM-DD",
      "type": "payment | renewal | notice | delivery | expiry | other",
      "notes": "تفصيل أو رقم البند أو null"
    }
  ],
  "hijri_note": "التواريخ الهجرية كما وردت أو null"
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ANTHROPIC_API_KEY) {
    return json({ error: "مفتاح Anthropic غير مُعدّ على الخادم." }, 500);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "طلب غير صالح" }, 400);
  }

  const docUrl = String(body?.doc_url ?? "").trim();
  if (!docUrl) return json({ error: "لا يوجد ملف مرفوع لهذا العقد" }, 400);

  const doc = await fetchDoc(docUrl);
  if (!doc) {
    return json(
      {
        error:
          "تعذّر قراءة ملف العقد — يجب أن يكون PDF أو صورة وأقل من 10 ميغابايت. " +
          "ملفات Word غير مدعومة للقراءة؛ احفظ العقد PDF وارفعه.",
      },
      400
    );
  }

  const block =
    doc.kind === "pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: doc.base64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: doc.mediaType, data: doc.base64 },
        };

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
    if (!res.ok) {
      return json(
        { error: `خطأ من مزوّد الذكاء الاصطناعي: ${data?.error?.message ?? "غير معروف"}` },
        502
      );
    }

    const text = (data.content || [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n")
      .trim();

    const parsed = parseLoose(text);

    // لا نصمت عند الفشل — نُرجع سبباً يقرؤه الموظف بدل زر لا يفعل شيئاً
    if (!parsed) {
      const truncated = data?.stop_reason === "max_tokens";
      return json(
        {
          error: truncated
            ? "العقد طويل ولم يكتمل التحليل. جرّب رفع الصفحات المهمة فقط."
            : "قُرئ العقد لكن تعذّر فهم النتيجة. أعد المحاولة أو أدخل البيانات يدوياً.",
          stop_reason: data?.stop_reason ?? null,
          raw_preview: text.slice(0, 300),
        },
        422
      );
    }

    // تنظيف: الالتزامات بلا عنوان أو بلا تاريخ صالح لا تُعرض
    const obligations = Array.isArray(parsed.obligations)
      ? parsed.obligations.filter(
          (o: any) =>
            o &&
            typeof o.title === "string" &&
            o.title.trim() !== "" &&
            typeof o.due_date === "string" &&
            /^\d{4}-\d{2}-\d{2}$/.test(o.due_date)
        )
      : [];

    return json({
      success: true,
      parsed: { ...parsed, obligations },
      usage: data.usage,
      stop_reason: data.stop_reason,
    });
  } catch (e) {
    return json({ error: `تعذّر تحليل العقد: ${String((e as Error)?.message || e)}` }, 500);
  }
});
