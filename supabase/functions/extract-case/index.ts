// استخراج بيانات القضية من صحيفة الدعوى أو أي مستند قضائي — يخدم منطقة
// إسقاط الملف في نموذج «قضية جديدة».
//
// الفرق عن extract-contract: هذه تقبل الملف **مباشرة** (base64) لا عبر رابط،
// لأن القضية لم تُنشأ بعد فلا مجلّد لها في التخزين. الرفع قبل الحفظ كان
// سيخلّف ملفات يتيمة كلما تراجع الموظف عن الإنشاء. (ما زالت تقبل doc_url
// أيضاً — للاستخراج من مستند مرفوع مسبقاً في قضية قائمة.)
//
// ⚠️ لا تُنقص MAX_TOKENS: تفكير النموذج يأكل من نفس الميزانية، وسقف ضيّق
//    يقطع الـJSON في منتصفه فيفشل التحليل بصمت (درس v22 في extract-minutes).
//
// الدالة تقرأ ولا تكتب في القاعدة — الواجهة تعرض النتيجة للمراجعة قبل الحفظ،
// فالاستخراج الآلي يخطئ ولا يصح أن يفتح قضية دون إقرار موظف.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-sonnet-5";

const MAX_TOKENS = 8000;
const MAX_BYTES = 10 * 1024 * 1024;

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

function classify(mediaType: string, hint = ""): Doc["kind"] | null {
  const mt = (mediaType || "").split(";")[0].trim().toLowerCase();
  if (mt === "application/pdf") return "pdf";
  if (mt.startsWith("image/")) return "image";
  const u = hint.toLowerCase();
  if (u.endsWith(".pdf")) return "pdf";
  if (/\.(png|jpe?g|webp)$/.test(u)) return "image";
  return null;
}

async function fetchDoc(url: string): Promise<Doc | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) return null;

    let binary = "";
    const chunk = 8192;
    for (let i = 0; i < buf.length; i += chunk) {
      binary += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const kind = classify(ct, url);
    if (!kind) return null;
    const mediaType = kind === "pdf" ? "application/pdf" : (ct.split(";")[0].trim() || "image/jpeg");
    return { base64: btoa(binary), mediaType, kind };
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
  "دقيق في قراءة صحف الدعاوى والمستندات القضائية. استخرج ما هو منصوص عليه حرفيّاً " +
  "في المستند المرفق دون تخمين أو استنتاج. أي بيان غير مذكور صراحةً اتركه null. " +
  "أجب بالعربية فقط وبصيغة JSON خام دون أي نص أو شرح أو سياج قبله أو بعده.";

// أنواع القضايا كما هي في النظام — نلزم النموذج بها ليطابق قائمة الاختيار،
// وإلا رجع تصنيفاً حرّاً لا يقبله الحقل.
// ⚠️ يجب أن تطابق CASE_TYPES في src/lib/caseLabels.ts حرفاً بحرف. أي قيمة
//    خارجها لن يقبلها حقل الاختيار في الواجهة فتضيع بصمت.
const CASE_TYPES = [
  "جزائي", "عامة", "تجاري", "أحوال شخصية", "عمالي", "إداري", "إفلاس",
];

const USER = `استخرج بيانات القضية من المستند المرفق (صحيفة دعوى أو لائحة أو قرار أو مذكرة).

قواعد ملزِمة:
- لا تخترع بياناً غير مذكور. ما لا تجده = null.
- حوّل أي تاريخ هجري إلى ميلادي بصيغة YYYY-MM-DD.
- client_name = **موكّلنا**: الطرف الذي تمثّله شركة المحاماة. إن لم يتّضح من
  المستند أيّ الطرفين موكّلنا، اتركه null ولا تخمّن.
  **لا تضع اسم شركة المحاماة نفسها موكّلاً أبداً.**
- opponent_name = الطرف المقابل (المدّعى عليه إن كان موكّلنا مدّعياً، والعكس).
- type يجب أن يكون **واحداً من هذه حرفيّاً**: ${CASE_TYPES.join(" · ")}.
  إن لم ينطبق أيٌّ منها اتركه null — لا تخترع تصنيفاً جديداً.
- court = اسم المحكمة كما ورد (مثل «المحكمة التجارية بالرياض»).
- court_division = الدائرة إن ذُكرت (مثل «الدائرة الثالثة»).
- court_num = رقم الدعوى أو القضية لدى المحكمة، أرقاماً لاتينية بلا مسافات.
- title = عنوان موجز للقضية في ٨ كلمات فأقل يصلح اسماً في النظام، يجمع
  الموضوع والطرف المقابل (مثل «مطالبة مالية — الشركة الوطنية»). لا تنسخ
  ديباجة المستند.
- subject = ملخّص موضوع الدعوى وطلباتها في ١٢٠ كلمة فأقل.

أرجِع JSON بهذا الشكل تماماً:
{
  "title": "عنوان موجز أو null",
  "type": "أحد الأنواع المذكورة أو null",
  "client_name": "اسم موكّلنا أو null",
  "opponent_name": "اسم الطرف المقابل أو null",
  "court": "اسم المحكمة أو null",
  "court_division": "الدائرة أو null",
  "court_num": "رقم الدعوى أو null",
  "filing_date": "YYYY-MM-DD تاريخ القيد أو null",
  "next_session_date": "YYYY-MM-DD موعد الجلسة القادمة إن ذُكر أو null",
  "subject": "ملخّص الموضوع والطلبات",
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

  // مصدران: ملف مُرسَل مباشرة (قضية جديدة) أو رابط مستند مرفوع (قضية قائمة)
  let doc: Doc | null = null;
  const b64 = String(body?.doc_base64 ?? "").trim();
  const docUrl = String(body?.doc_url ?? "").trim();

  if (b64) {
    const kind = classify(String(body?.media_type ?? ""), String(body?.file_name ?? ""));
    if (!kind) {
      return json(
        { error: "نوع الملف غير مدعوم — ارفع PDF أو صورة. ملفات Word غير مقروءة؛ احفظها PDF." },
        400
      );
    }
    // base64 يزيد الحجم نحو الثلث — نقيس الأصل لا النص
    if ((b64.length * 3) / 4 > MAX_BYTES) {
      return json({ error: "الملف أكبر من ١٠ ميغابايت — ارفع الصفحات المهمة فقط." }, 400);
    }
    doc = {
      base64: b64,
      mediaType: kind === "pdf" ? "application/pdf" : String(body?.media_type ?? "image/jpeg"),
      kind,
    };
  } else if (docUrl) {
    doc = await fetchDoc(docUrl);
  } else {
    return json({ error: "لم يصل أي ملف للتحليل" }, 400);
  }

  if (!doc) {
    return json(
      {
        error:
          "تعذّر قراءة الملف — يجب أن يكون PDF أو صورة وأقل من ١٠ ميغابايت. " +
          "ملفات Word غير مدعومة للقراءة؛ احفظ المستند PDF وارفعه.",
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
            ? "المستند طويل ولم يكتمل التحليل. جرّب رفع الصفحات الأولى فقط."
            : "قُرئ المستند لكن تعذّر فهم النتيجة. أعد المحاولة أو أدخل البيانات يدوياً.",
          stop_reason: data?.stop_reason ?? null,
          raw_preview: text.slice(0, 300),
        },
        422
      );
    }

    // النوع خارج القائمة يُهمَل بدل أن يكسر حقل الاختيار في الواجهة
    const type =
      typeof parsed.type === "string" && CASE_TYPES.includes(parsed.type.trim())
        ? parsed.type.trim()
        : null;

    const date = (v: unknown) =>
      typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

    return json({
      success: true,
      parsed: {
        ...parsed,
        type,
        filing_date: date(parsed.filing_date),
        next_session_date: date(parsed.next_session_date),
      },
      usage: data.usage,
      stop_reason: data.stop_reason,
    });
  } catch (e) {
    return json({ error: `تعذّر تحليل المستند: ${String((e as Error)?.message || e)}` }, 500);
  }
});
