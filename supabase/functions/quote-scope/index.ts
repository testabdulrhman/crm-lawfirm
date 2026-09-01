// صياغة «نطاق العمل» في عرض السعر (طلب المستخدم 2026-09-01: «ودي يكون مدعوم
// بالذكاء يحلله ويرتبه بالشكل المناسب») — الموظف يكتب أفكاراً سريعة والدالة
// تعيدها بنوداً مصاغة بلغة المكتب ومرتّبة بتسلسل العمل الطبيعي.
//
// أسلوب المكتب مأخوذ من عرض «جوهرة العراب» المعتمد: بند واحد لكل مرحلة،
// يبدأ بمصدر (دراسة/إعداد/تقديم/متابعة)، ينتهي بنقطة، بلا وعود بنتيجة.
//
// تقرأ ولا تكتب: الموظف يراجع الصياغة قبل إدراجها في العرض — الصياغة
// الآلية تخطئ ولا يصح أن تدخل مستنداً يُرسل لعميل دون إقرار بشري.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-sonnet-5"; // صياغة قانونية عربية — الدقة تسبق الكلفة
const MAX_TOKENS = 2000;

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
      .from("lookup_values").select("value")
      .eq("type", "ai_config").limit(1).maybeSingle();
    if (data?.value) {
      const cfg = JSON.parse(data.value as string);
      if (cfg.assistant_model) return String(cfg.assistant_model);
    }
  } catch (_) { /* الافتراضي */ }
  return FALLBACK_MODEL;
}

const SYSTEM = `أنت مساعد صياغة في شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس (السعودية).
مهمتك: تحويل ملاحظات المحامي السريعة إلى بنود «نطاق العمل» في عرض أتعاب رسمي.

أسلوب المكتب المعتمد (احتذِ به حرفياً):
• دراسة الوضع المالي والنظامي للشركة ومراجعة المستندات والقوائم اللازمة للطلب.
• إعداد طلب افتتاح إجراء إعادة التنظيم المالي واستيفاء متطلباته النظامية كافة.
• تقديم الطلب لدى المحكمة التجارية المختصة واستكمال ما يَرِد عليه من ملاحظات أو متطلبات.
• متابعة الطلب حتى صدور قرار المحكمة بشأن افتتاح الإجراء.

قواعد ملزمة:
1. رتّب البنود بتسلسل العمل الطبيعي: دراسة ومراجعة ← إعداد ← تقديم ← متابعة.
2. كل بند جملة واحدة تبدأ بمصدر (دراسة، مراجعة، إعداد، صياغة، تقديم، حضور، متابعة، تمثيل) وتنتهي بنقطة.
3. من ٣ إلى ٦ بنود. ادمج المتقارب ولا تكرر.
4. عربية فصيحة مهنية، بلا مبالغة ولا حشو ولا رموز ولا ترقيم في نص البند.
5. **لا تعد بنتيجة**: قل «متابعة الدعوى حتى صدور الحكم» لا «كسب الدعوى». ولا تذكر مبالغ ولا مدداً زمنية.
6. لا تخترع خدمات لم يذكرها المحامي ولا يقتضيها موضوع العرض اقتضاءً مهنياً بيّناً.
7. إن كانت الملاحظات فارغة، اشتق البنود من موضوع العرض وحده بأقل قدر من الافتراض.`;

const TOOL = {
  name: "scope_items",
  description: "بنود نطاق العمل المصاغة، مرتبة",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: { type: "string" },
        description: "بنود نطاق العمل — كل بند جملة كاملة منتهية بنقطة",
      },
    },
    required: ["items"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح الذكاء غير مضبوط — راجع مدير النظام" }, 500);

    const { notes, title, context } = await req.json().catch(() => ({}));
    if (!title || !String(title).trim())
      return json({ error: "عنوان العرض مطلوب لصياغة نطاق العمل" }, 400);

    const ctx: string[] = [];
    if (context?.request_type) ctx.push(`نوع الطلب: ${context.request_type}`);
    if (context?.court_name) ctx.push(`المحكمة: ${context.court_name}`);
    if (context?.opponent_name) ctx.push(`الخصم: ${context.opponent_name}`);
    if (context?.description) ctx.push(`وصف الطلب: ${context.description}`);

    const USER = [
      `موضوع العرض: ${String(title).trim()}`,
      ctx.length ? ctx.join("\n") : "",
      String(notes ?? "").trim()
        ? `ملاحظات المحامي (قد تكون مختصرة أو غير مرتبة):\n${String(notes).trim()}`
        : "لا توجد ملاحظات — اشتق البنود من موضوع العرض.",
      "اكتب بنود نطاق العمل عبر الأداة.",
    ].filter(Boolean).join("\n\n");

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
        tools: [TOOL],
        tool_choice: { type: "tool", name: "scope_items" }, // إلزام الأداة — لا نص حر
        messages: [{ role: "user", content: USER }],
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      return json({ error: "تعذّرت صياغة نطاق العمل", detail: JSON.stringify(data).slice(0, 300) }, 502);

    const block = (data.content ?? []).find((b: { type: string }) => b.type === "tool_use");
    const items: string[] = Array.isArray(block?.input?.items) ? block.input.items : [];
    const clean = items.map((s) => String(s).trim().replace(/^[•\-\d.\s]+/, "")).filter(Boolean);
    if (!clean.length) return json({ error: "لم تُنتج صياغة — أعد المحاولة" }, 502);

    return json({ items: clean });
  } catch (e) {
    return json({ error: "خطأ غير متوقّع", detail: String((e as Error)?.message || e) }, 500);
  }
});
