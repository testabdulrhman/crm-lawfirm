// استخراج بيانات العقد وبنوده ودفعاته من ملفاته — يخدم «عقد جديد» (يعبّئ النموذج من الملفات)
// وزر «استخراج البيانات من ملف العقد» في صفحة العقد.
//
// 2026-10-22 (طلب المدير: «العقد يكون عندي نسختين pdf + وورد… ودي الذكاء يستخرج البيانات ويعبي المعلومات»):
//   - يقبل عدة ملفات للعقد نفسه (doc_urls) ومنها Word (يُقرأ نصاً) — كان PDF/صورة واحدة فقط.
//   - يستخرج حقول تحليل الـ١١٢ عقداً (2026-10-14): طريقة الأتعاب والضريبة والأطراف والمراحل والبنود والدفعات.
//   - المخرَج عبر أداة إلزامية (tool_use) بدل نص JSON يُحلَّل — لا انقطاع ولا سياج.
//
// الدالة تقرأ فقط ولا تكتب في القاعدة — الواجهة تعرض النتيجة للمراجعة قبل الحفظ.
import { staffOrService } from "../_shared/staffGuard.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { HIJRI_RULE, pickDate } from "../_shared/hijri.ts";
import { docxText } from "../_shared/docx.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-sonnet-5";
const MAX_TOKENS = 16000; // التفكير يأكل من الميزانية نفسها — لا تُنقصه
const MAX_BYTES = 15 * 1024 * 1024;

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

function b64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(s);
}

const storagePath = (url: string) => url.match(/\/storage\/v1\/object\/(?:public|sign)\/documents\/([^?]+)/)?.[1];

/** ملف من مخزن المستندات (بمفتاح الخادم) أو من رابطه — كتلة يقرؤها النموذج */
// deno-lint-ignore no-explicit-any
async function loadDoc(url: string): Promise<{ block: any; kind: string } | { error: string }> {
  const name = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "ملف");
  let bytes: Uint8Array | null = null;
  let type = "";
  const path = storagePath(url);
  if (path) {
    const { data } = await admin.storage.from("documents").download(decodeURIComponent(path));
    if (data) { bytes = new Uint8Array(await data.arrayBuffer()); type = (data.type || "").toLowerCase(); }
  }
  if (!bytes) {
    const res = await fetch(url).catch(() => null);
    if (!res?.ok) return { error: `تعذّر تنزيل «${name}»` };
    bytes = new Uint8Array(await res.arrayBuffer());
    type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  }
  return await toBlock(name, bytes, `${type} ${url.toLowerCase()}`);
}

/** كتلة الملف بحسب نوعه: Word نصاً، وPDF وثيقة، والصورة صورة */
// deno-lint-ignore no-explicit-any
async function toBlock(name: string, bytes: Uint8Array, low: string): Promise<{ block: any; kind: string } | { error: string }> {
  if (bytes.length > MAX_BYTES) return { error: `«${name}» أكبر من ١٥ م.ب` };
  if (/wordprocessingml|\.docx\b/.test(low)) {
    const text = (await docxText(bytes)).trim();
    if (!text) return { error: `«${name}» بلا نص` };
    return { kind: "word", block: { type: "document", source: { type: "text", media_type: "text/plain", data: text.slice(0, 200_000) }, title: `نسخة Word: ${name}` } };
  }
  if (/\.doc\b|msword/.test(low)) return { error: `«${name}» بصيغة Word القديمة (.doc) — احفظه .docx` };
  if (/pdf/.test(low)) {
    return { kind: "pdf", block: { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(bytes) }, title: `نسخة PDF: ${name}` } };
  }
  const img = /png/.test(low) ? "image/png" : /webp/.test(low) ? "image/webp" : /jpe?g/.test(low) ? "image/jpeg" : null;
  if (img) return { kind: "image", block: { type: "image", source: { type: "base64", media_type: img, data: b64(bytes) } } };
  return { error: `«${name}» بصيغة لا تُقرأ — PDF أو Word أو صورة` };
}

const SYSTEM =
  "أنت مساعد قانوني لشركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس، " +
  "دقيق في قراءة العقود. استخرج ما هو منصوص عليه في العقد المرفق دون تخمين. " +
  "أي بند غير مذكور صراحةً اتركه null. أجب بأداة save_contract وحدها.";

const USER = `استخرج بيانات هذا العقد.
قد يُرفق العقد بأكثر من نسخة (Word وPDF) — هي عقد واحد: اقرأها معاً؛ نص Word أدق في الحروف والأرقام،
وPDF قد يحمل التوقيع والتواريخ والمبالغ المكتوبة باليد — فإن اختلفتا فالموقّع (PDF) هو المعتمد.

قواعد ملزِمة:
- لا تخترع بنداً غير مذكور. ما لا تجده = null (وللقوائم = []).
${HIJRI_RULE}
- المبالغ أرقاماً بلا فواصل ولا كلمة «ريال».
- client_name = **الموكّل**: الطرف المتعاقد مع شركة المحاماة (قد يكون الطرف الأول أو الثاني).
  **لا تضع اسم شركة المحاماة ولا محاميها موكّلاً أبداً.** وclient_phone وclient_id_number إن وردا له.
- type: case (ترافع وقضايا) | collection (تحصيل ديون) | consultation (استشارات) | bankruptcy (إجراءات إفلاس)
  | subscription (اشتراك سنوي) | other.
- first_party = صفة طرف المكتب في العقد: company (الشركة) | lawyer (المحامي باسمه) | trustee (أمين الإفلاس).
- fee_model: fixed مقطوع | percentage نسبة | mixed مقطوع ونسبة | periodic شهري/سنوي | other.
  وfee_percentage النسبة رقماً، وpercentage_base ما تُحسب منه («مما يُحصَّل»، «من قيمة الحكم»).
- vat_mode: included شاملة الضريبة | excluded غير شاملة (تضاف) | exempt معفاة | unspecified لم تُذكر.
- client_side صفة الموكّل في النزاع من: مدعٍ، مدعى عليه، متهم، مجنيّ عليه، طالب تنفيذ، منفَّذ ضده، مدين (إفلاس)، دائن، غير قضائي.
- stages_covered من: «ما قبل التقاضي / صلح»، «ابتدائي»، «استئناف»، «عليا»، «تنفيذ» — المذكورة صراحةً فقط.
- installments = دفعات الأتعاب بترتيبها. trigger: on_signing (عند التوقيع) | date (بتاريخ) | event (عند حدث).
  ولحدث: event_kind من first_ruling (الحكم الابتدائي) | final_ruling (الحكم النهائي/القطعي) | case_end (انتهاء القضية)
  | procedure_opening (افتتاح الإجراء) | plan_approval (تصديق المقترح) | other مع event_label.
  amount المبلغ أو percent نسبتها من الإجمالي — ما ورد منهما.
- obligations = الالتزامات ذات **تاريخ محدّد** فقط (تجديد، مهلة إشعار، تسليم، انتهاء سريان) — لا الدفعات (مكانها installments).
- summary ملخّص دقيق لا يتجاوز 120 كلمة.`;

const S = (d: string) => ({ type: ["string", "null"], description: d });
const N = (d: string) => ({ type: ["number", "null"], description: d });
const B = (d: string) => ({ type: ["boolean", "null"], description: d });

const TOOL = {
  name: "save_contract",
  description: "بيانات العقد المستخرجة",
  input_schema: {
    type: "object",
    properties: {
      title: S("عنوان العقد"),
      type: { type: ["string", "null"], enum: ["case", "collection", "consultation", "bankruptcy", "subscription", "other", null] },
      client_name: S("اسم الموكّل"),
      client_phone: S("جوال الموكّل إن ورد"),
      client_id_number: S("هوية/سجل الموكّل إن ورد"),
      signed_date: S("YYYY-MM-DD"), signed_date_hijri: S("كما ورد"),
      start_date: S("YYYY-MM-DD"), start_date_hijri: S("كما ورد"),
      end_date: S("YYYY-MM-DD"), end_date_hijri: S("كما ورد"),
      fees_total: N("إجمالي الأتعاب"),
      payment_terms: S("طريقة الدفع بإيجاز"),
      scope: S("نطاق العمل"),
      auto_renew: B("تجديد تلقائي"),
      notice_period_days: N("مهلة الإشعار بالإنهاء بالأيام"),
      fee_model: { type: ["string", "null"], enum: ["fixed", "percentage", "mixed", "periodic", "other", null] },
      fee_percentage: N("النسبة ٪"),
      percentage_base: S("أساس النسبة"),
      vat_mode: { type: ["string", "null"], enum: ["included", "excluded", "exempt", "unspecified", null] },
      first_party: { type: ["string", "null"], enum: ["company", "lawyer", "trustee", null] },
      client_side: S("صفة الموكّل"),
      client_rep_name: S("ممثل الموكّل إن كان شركة"),
      client_rep_capacity: S("صفة الممثل"),
      beneficiary_name: S("المستفيد إن كان غير الموكّل"),
      beneficiary_relation: S("صلته بالموكّل"),
      opponent_name: S("الخصم"),
      stages_covered: { type: "array", items: { type: "string" } },
      ends_on: S("ينتهي العقد بـ"),
      dispute_venue: S("جهة الاختصاص عند النزاع"),
      expenses_on_client: B("المصاريف والخبراء على الموكّل"),
      poa_required: B("إصدار وكالة مطلوب"),
      fees_due_on_settlement: B("الأتعاب كاملة عند الصلح أو العزل"),
      advance_refundable: B("المقدّم قابل للاسترداد"),
      installments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            trigger: { type: "string", enum: ["on_signing", "date", "event"] },
            due_date: S("YYYY-MM-DD"), due_date_hijri: S("كما ورد"),
            event_kind: { type: ["string", "null"], enum: ["first_ruling", "final_ruling", "case_end", "procedure_opening", "plan_approval", "other", null] },
            event_label: S("وصف الحدث"),
            amount: N("المبلغ"), percent: N("النسبة من الإجمالي"),
          },
          required: ["label", "trigger"],
        },
      },
      summary: S("ملخّص العقد"),
      obligations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            due_date: S("YYYY-MM-DD"), due_date_hijri: S("كما ورد"),
            type: { type: "string", enum: ["payment", "renewal", "notice", "delivery", "expiry", "other"] },
            notes: S("تفصيل أو رقم البند"),
          },
          required: ["title", "type"],
        },
      },
      hijri_note: S("التواريخ الهجرية كما وردت"),
    },
    required: ["title", "client_name", "installments", "obligations", "stages_covered"],
  },
};

const STAGES = new Set(["ما قبل التقاضي / صلح", "ابتدائي", "استئناف", "عليا", "تنفيذ"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  // موظف نشط فقط — كان مفتاح anon العام يكفي لاستهلاك الذكاء على حساب المكتب (فحص 2026-10-19)
  if (!(await staffOrService(req))) return json({ error: "لموظف نشط فقط" }, 401);
  if (!ANTHROPIC_API_KEY) {
    return json({ error: "مفتاح Anthropic غير مُعدّ على الخادم." }, 500);
  }

  // deno-lint-ignore no-explicit-any
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "طلب غير صالح" }, 400);
  }

  const urls: string[] = (Array.isArray(body?.doc_urls) ? body.doc_urls : [body?.doc_url])
    .map((u: unknown) => String(u ?? "").trim()).filter(Boolean).slice(0, 4);
  if (!urls.length) return json({ error: "لا يوجد ملف مرفوع لهذا العقد" }, 400);

  const loaded = await Promise.all(urls.map(loadDoc));
  // deno-lint-ignore no-explicit-any
  const blocks = loaded.filter((d): d is { block: any; kind: string } => "block" in d).map((d) => d.block);
  const skipped = loaded.filter((d): d is { error: string } => "error" in d).map((d) => d.error);
  if (!blocks.length) return json({ error: skipped.join(" · ") || "تعذّرت قراءة ملفات العقد" }, 400);

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
        tools: [TOOL],
        tool_choice: { type: "tool", name: "save_contract" },
        messages: [{ role: "user", content: [...blocks, { type: "text", text: USER }] }],
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return json(
        { error: `خطأ من مزوّد الذكاء الاصطناعي: ${data?.error?.message ?? "غير معروف"}` },
        502
      );
    }

    // deno-lint-ignore no-explicit-any
    const parsed = (data.content || []).find((b: any) => b.type === "tool_use")?.input;
    if (!parsed) {
      return json(
        {
          error: data?.stop_reason === "max_tokens"
            ? "العقد طويل ولم يكتمل التحليل. جرّب رفع الصفحات المهمة فقط."
            : "قُرئ العقد لكن تعذّر فهم النتيجة. أعد المحاولة أو أدخل البيانات يدوياً.",
          stop_reason: data?.stop_reason ?? null,
        },
        422
      );
    }

    // التواريخ بأم القرى من الهجري المقروء — لا من تحويل النموذج (2026-10-07)
    parsed.signed_date = pickDate(parsed.signed_date, parsed.signed_date_hijri);
    parsed.start_date = pickDate(parsed.start_date, parsed.start_date_hijri);
    parsed.end_date = pickDate(parsed.end_date, parsed.end_date_hijri);
    const isDate = (v: unknown) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    // deno-lint-ignore no-explicit-any
    const obligations = (Array.isArray(parsed.obligations) ? parsed.obligations : []).map((o: any) => ({
      ...o, due_date: pickDate(o?.due_date, o?.due_date_hijri),
      // deno-lint-ignore no-explicit-any
    })).filter((o: any) => typeof o?.title === "string" && o.title.trim() && isDate(o.due_date));
    // deno-lint-ignore no-explicit-any
    const installments = (Array.isArray(parsed.installments) ? parsed.installments : []).map((i: any) => {
      const due = pickDate(i?.due_date, i?.due_date_hijri);
      const trigger = i?.trigger === "date" && !isDate(due) ? "event" : i?.trigger;
      return {
        label: String(i?.label ?? "").trim() || "دفعة",
        trigger: ["on_signing", "date", "event"].includes(trigger) ? trigger : "event",
        due_date: trigger === "date" ? due : null,
        event_kind: trigger === "event" ? (i?.event_kind ?? "other") : null,
        event_label: trigger === "event" ? (i?.event_label ?? null) : null,
        amount: typeof i?.amount === "number" && i.amount > 0 ? i.amount : null,
        percent: typeof i?.percent === "number" && i.percent > 0 && i.percent <= 100 ? i.percent : null,
      };
    });
    const stages = (Array.isArray(parsed.stages_covered) ? parsed.stages_covered : []).filter((s: string) => STAGES.has(s));
    // الأسماء كما تُنقل من نص العقد قد تحمل شَرطة القائمة أو جدولة أو نقطتين («-\tشركة…» — 2026-10-27)
    const clean = (v: unknown) => typeof v === "string" ? v.replace(/^[\s\-–—:•*.،]+|[\s\-–—:•*.،]+$/g, "").trim() || null : v;
    for (const k of ["title", "client_name", "client_rep_name", "client_rep_capacity", "beneficiary_name", "opponent_name"]) {
      parsed[k] = clean(parsed[k]);
    }

    return json({
      success: true,
      parsed: { ...parsed, obligations, installments, stages_covered: stages },
      skipped,
      usage: data.usage,
      stop_reason: data.stop_reason,
    });
  } catch (e) {
    return json({ error: `تعذّر تحليل العقد: ${String((e as Error)?.message || e)}` }, 500);
  }
});
