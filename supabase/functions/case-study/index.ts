// دالة «دراسة القضية» — تجمع ملف القضية وتقرأ مستنداته وتكتب الدراسة وفق منهجية الشركة
// v6: التوليد في الخلفية (EdgeRuntime.waitUntil) — الرد فوري والواجهة تتابع الصف حتى يكتمل
// (حد بوابة Supabase 150 ثانية لا يكفي لنماذج opus مع مخرجات طويلة)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-opus-5";
const FIRM_NAME = "شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

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
      if (cfg.study_model) return String(cfg.study_model);
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
      if (u.includes(".pdf")) mediaType = "application/pdf";
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

/* ===================== دراسة القضية ===================== */

const STUDY_SYSTEM = `أنت مستشار قانوني خبير في ${FIRM_NAME}، متمرّس في دراسة القضايا وفق القضاء السعودي والأنظمة السعودية.
تكتب دراسات قضايا احترافية بمنهجية الشركة المعتمدة. أسلوبك: عربية فصحى رسمية دقيقة، تحليل متوازن يبين نقاط القوة والضعف («يمكن الطعن بـ… ولكن مما يضعف ذلك…»)، استناد لنصوص الأنظمة بأرقام موادها عند الإمكان، وحياد مهني تام.
قواعد صارمة:
- اعتمد فقط على المعلومات والمستندات المقدمة — لا تختلق وقائع أو تواريخ أو أرقام مواد لست متأكداً منها.
- ما لا يتوفر في الملف اكتب عنه: «غير متوفر في الملف — يُستكمل يدوياً».
- نص عادي فقط (لا Markdown): النقاط بشرطة «- » أول السطر، والأرقام لاتينية، والتواريخ كما وردت.
- كن وافياً موجزاً: المجموع الكلي للدراسة لا يتجاوز نحو 3000 كلمة.
- سلّم الدراسة حصراً عبر استدعاء أداة save_study بأقسامها العشرة كاملة.`;

async function generateStudy(caseId: string, userName: string | null): Promise<void> {
  const { data: c, error: caseErr } = await admin
    .from("cases")
    .select("*, contact:contacts(name, phone), assignee:team_members(name)")
    .eq("id", caseId)
    .single();
  if (caseErr || !c) throw new Error("القضية غير موجودة");

  const [parties, sessions, rulings, memos, notes, docs] = await Promise.all([
    admin.from("case_parties").select("role, party_side, name, id_number, nationality, notes").eq("case_id", caseId),
    admin.from("sessions").select("session_number, title, session_date, court, status, outcome, next_action, ruling_due_date").eq("case_id", caseId).order("session_date", { ascending: true }),
    admin.from("rulings").select("title, ruling_number, ruling_date, court_name, result, summary, is_dropped").eq("case_id", caseId).order("ruling_date", { ascending: true }),
    admin.from("memos").select("title, description, party_side, memo_type, is_submitted, submit_date").eq("case_id", caseId).order("created_at", { ascending: true }),
    // ⚠️ كان يقرأ جدول notes — وقد أُلغي حين انتقلت الملاحظات إلى النقاشات
    //    (ترحيل 20260821_notes_into_discussions)، فظلّ القسم فارغاً بصمت.
    //    النقاش هو الملاحظات الداخلية اليوم، وهو مصدر أصيل للوقائع
    //    (طلب المستخدم 2026-08-25: يُعتبر عند الدراسة).
    admin.from("case_comments")
      .select("body, kind, created_at, author:team_members(short_name, name)")
      .eq("case_id", caseId).is("deleted_at", null).neq("kind", "system")
      .order("created_at", { ascending: true }).limit(150),
    admin.from("documents").select("name, description, file_url, file_type, file_size, created_at").eq("case_id", caseId).is("deleted_at", null).order("created_at", { ascending: false }),
  ]);

  const docList = (docs.data ?? []) as any[];

  const blocks: any[] = [];
  const readDocs: string[] = [];
  for (const d of docList) {
    if (blocks.length >= 3) break;
    const isPdf = (d.file_type || "").includes("pdf") || (d.file_url || "").toLowerCase().includes(".pdf");
    if (!isPdf || !d.file_url) continue;
    if (d.file_size && d.file_size > 5 * 1024 * 1024) continue;
    const doc = await fetchDocAsBase64(d.file_url);
    if (doc?.kind === "pdf") {
      const b = buildDocBlock(doc);
      if (b) {
        blocks.push(b);
        readDocs.push(String(d.name || "مستند"));
      }
    }
  }

  const caseInfo = {
    العنوان: c.title,
    رقم_المكتب: c.office_num,
    رقم_المحكمة: c.court_num,
    النوع: c.type,
    الحالة: c.status,
    المحكمة: c.court,
    الدائرة: c.court_division,
    تاريخ_الفتح: c.open_date,
    الموكل: c.contact?.name ?? null,
    المسؤول: c.assignee?.name ?? null,
    الوصف: c.description ?? null,
  };

  const user = `ادرس هذه القضية واكتب «دراسة القضية» الكاملة وفق منهجية الشركة، ثم سلّمها عبر أداة save_study.

إرشادات الأقسام:
- basics: بيانات القضية سطراً سطراً (المدعي، المدعى عليه، رقم القضية، المحكمة والدائرة، الموضوع، تصنيف الدعوى).
- timeline: كل سطر «- التاريخ: الحدث» من الأقدم للأحدث.
- facts: تبدأ بـ«يمكن تلخيص وقائع القضية على النحو الآتي:» ثم نقاط.
- requests: طلبات المدعي نقاطاً.
- plaintiff_grounds: كل سند سطر «- السند … — الحالة: (قوي/متوسط/ضعيف) — السبب: …».
- defendant_defenses: بنفس صيغة الأسانيد.
- references_list: المستندات والمصادر التي بُنيت عليها الدراسة.
- legal_opinion: تحليل الإشكالات الرئيسة مع نقاط القوة والضعف والاستناد للأنظمة.
- suitability: للقضية الجديدة مدى ملاءمة القبول، وللجارية/المنتهية الموقف والتوصية.
- attachments_list: مستندات الملف نقاطاً مع بيان ما قُرئ وما يُوصى بطلبه.

بيانات القضية من النظام:
${JSON.stringify(caseInfo, null, 1)}

الأطراف:
${JSON.stringify(parties.data ?? [], null, 1)}

الجلسات (بالترتيب الزمني، مع نتيجة كل جلسة):
${JSON.stringify(sessions.data ?? [], null, 1)}

الأحكام:
${JSON.stringify(rulings.data ?? [], null, 1)}

المذكرات واللوائح:
${JSON.stringify(memos.data ?? [], null, 1)}

نقاش الملف بين المحامين (ملاحظات داخلية — مصدر أصيل للوقائع والقرارات، اقرأه بعناية):
${JSON.stringify((notes.data ?? []).map((n: any) => ({
    التاريخ: String(n.created_at ?? "").slice(0, 10),
    الكاتب: n.kind === "ai" ? "الذكاء" : (n.author?.short_name ?? n.author?.name ?? "موظف"),
    النص: n.body,
  })), null, 1)}

قائمة مستندات الملف (${docList.length}):
${JSON.stringify(docList.map((d: any) => ({ الاسم: d.name, الوصف: d.description })), null, 1)}

${blocks.length > 0 ? `المستندات المرفقة أعلاه (${readDocs.join("، ")}) هي مستندات القضية الفعلية — اقرأها بعناية واستخرج منها الوقائع والأسانيد والدفوع.` : "لا مستندات PDF مقروءة — اعتمد على بيانات النظام فقط ونبّه في الأقسام الناقصة."}`;

  const content: any = blocks.length > 0 ? [...blocks, { type: "text", text: user }] : user;

  const S = { type: "string" };
  const STUDY_TOOL = {
    name: "save_study",
    description: "حفظ دراسة القضية المكتملة بأقسامها العشرة",
    input_schema: {
      type: "object",
      properties: {
        basics: S, timeline: S, facts: S, requests: S,
        plaintiff_grounds: S, defendant_defenses: S, references_list: S,
        legal_opinion: S, suitability: S, attachments_list: S,
      },
      required: ["basics", "timeline", "facts", "requests", "plaintiff_grounds", "defendant_defenses", "references_list", "legal_opinion", "suitability", "attachments_list"],
    },
  };
  const model = await getModel();
  const aiRes = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 16000,
      system: STUDY_SYSTEM,
      tools: [STUDY_TOOL],
      tool_choice: { type: "tool", name: "save_study" },
      messages: [{ role: "user", content }],
    }),
  });
  const data = await aiRes.json();
  if (!aiRes.ok) throw new Error(`مزوّد الذكاء: ${data?.error?.message || aiRes.status}`);

  const toolUse = (data.content || []).find((b: any) => b.type === "tool_use");
  const parsed: any = toolUse?.input;
  if (!parsed || !parsed.basics || !parsed.legal_opinion || !parsed.suitability || !parsed.attachments_list) {
    throw new Error(`دراسة غير مكتملة (stop: ${data.stop_reason})`);
  }

  const row = {
    case_id: caseId,
    basics: parsed.basics ?? null,
    timeline: parsed.timeline ?? null,
    facts: parsed.facts ?? null,
    requests: parsed.requests ?? null,
    plaintiff_grounds: parsed.plaintiff_grounds ?? null,
    defendant_defenses: parsed.defendant_defenses ?? null,
    references_list: parsed.references_list ?? null,
    legal_opinion: parsed.legal_opinion ?? null,
    suitability: parsed.suitability ?? null,
    attachments_list: parsed.attachments_list ?? null,
    status: "draft",
    generated_at: new Date().toISOString(),
    generated_by: `${model} — قرأ ${readDocs.length} مستند`,
    updated_at: new Date().toISOString(),
    updated_by: userName,
  };
  const { error: saveErr } = await admin
    .from("case_studies")
    .upsert(row, { onConflict: "case_id" });
  if (saveErr) throw new Error(`تعذّر حفظ الدراسة: ${saveErr.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح Anthropic غير مُعدّ." }, 500);
  try {
    const body = await req.json();
    const caseId = String(body?.case_id || "");
    if (!caseId) return json({ error: "case_id مطلوب" }, 400);
    const userName = body?.user_name ? String(body.user_name) : null;

    // تحقق سريع أن القضية موجودة قبل بدء الخلفية
    const { data: exists } = await admin.from("cases").select("id").eq("id", caseId).maybeSingle();
    if (!exists) return json({ error: "القضية غير موجودة" }, 404);

    const work = generateStudy(caseId, userName).catch((e) => {
      console.error("case-study background error:", e?.message || e);
    });
    // التوليد يكمل في الخلفية بعد الرد الفوري — الواجهة تتابع الصف
    // deno-lint-ignore no-explicit-any
    const er: any = (globalThis as any).EdgeRuntime;
    if (er?.waitUntil) er.waitUntil(work);

    return json({ ok: true, started: true }, 202);
  } catch (e) {
    return json({ error: "حدث خطأ غير متوقّع", detail: String((e as Error)?.message || e) }, 500);
  }
});
