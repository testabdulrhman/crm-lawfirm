// دالة «دراسة القضية» — تجمع ملف القضية وتقرأ مستنداته وتكتب الدراسة وفق منهجية الشركة
// v6: التوليد في الخلفية (EdgeRuntime.waitUntil) — الرد فوري والواجهة تتابع الصف حتى يكتمل
// (حد بوابة Supabase 150 ثانية لا يكفي لنماذج opus مع مخرجات طويلة)
// v8 (2026-09-02) — الدراسة كائن حي لا لقطة (طلب المستخدم «ابي كل هذه المميزات»):
//   • نسخ: كل توليد يحفظ السابقة في case_study_versions أولاً — لا يضيع تحرير محامٍ
//   • ما الذي تغيّر: قسم يقارن بالنسخة السابقة وأحداث الملف منذها
//   • سوابق المكتب: قضايا المكتب المنتهية المشابهة وكيف انتهت — ذاكرة مؤسسية
//   • الأسانيد النظامية: مرحلة بحث أولى في المصادر الرسمية (web_search محصور
//     بنطاقات رسمية) ثم تُسند الدراسة للمواد بأرقامها
//   • مخرجات تنفيذية: مقترحات (مهام/مخاطر/أسئلة للموكّل) يعتمدها المحامي بضغطة
//   • mode=stale (cron ليلي): يجدّد الدراسات التي علّمتها أحداث الملف قديمة
// v11 (2026-09-03) — إصلاح «يشتغل فترة بعدين يوقف» على الملفات الكبيرة
//   (بلاغ المستخدم على CASE25008: ٧٣ مستنداً و٤ جلسات، والسجل قال
//    stop: max_tokens). السقف كان 16000 رمزاً يتقاسمها تفكير النموذج
//   ونصّ الدراسة، فتُقطع الأداة في منتصفها ويسقط كل شيء بلا حفظ:
//   • بثّ (stream) مع سقف 32000 — البثّ شرط عملي لأي مخرَج طويل
//   • تعليمات طول صريحة لكل قسم كي لا يسترسل النموذج أصلاً
//   • تقليص سياق السوابق (٢٥ → ١٢ وملخّصات أقصر) لتخفيف زمن القراءة
//   • تسجيل الفشل في error_logs ليظهر سببه للمحامي بدل «استغرق وقتاً أطول»
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cachedText, logCacheUsage } from "../_shared/prompt-cache.ts";
import { docxText } from "../_shared/docx.ts";
import { riyadhToday } from "../_shared/riyadh.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-opus-5-5";
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ── مستندات الملف كلها (2026-10-17): كانت أحدث ٣ ملفات PDF وحدها، فتسقط صحيفة الدعوى (الأقدم) في الملفات
//    الطويلة، ولا يُقرأ Word ولا صورة. الآن: الأهم أولاً (التصنيف وإلا الاسم)، والأقدم أولاً داخل الدرجة، حتى
//    سقوف الطلب الواحد — حجم الطلب ٣٢ م.ب وعدد صفحات PDF ٦٠٠ — وما لا يتسع يُذكر بسببه في docs_coverage.
const DOC_BYTES_BUDGET = 20 * 1024 * 1024;   // خام؛ يتضخم ثلثاً بترميز base64 فيبقى دون ٣٢ م.ب
const DOC_PAGES_BUDGET = 450;                // تحت حدّ ٦٠٠ صفحة بهامش للصور ونص الطلب
const DOC_TEXT_BUDGET = 300_000;             // نصوص Word
const PDF_MAX_BYTES = 15 * 1024 * 1024;
const IMG_MAX_BYTES = 3_500_000;             // حدّ الصورة ٥ م.ب بعد الترميز
const IMG_MAX_COUNT = 15;

/** درجة أهمية المستند للدراسة: ٠ أهم — من التصنيف (classify-doc) وإلا من الاسم */
function docRank(d: { name?: string; category?: string; description?: string }): number {
  const t = `${d.category ?? ""} ${d.name ?? ""} ${d.description ?? ""}`;
  if (/صحيفة|دعوى|لائحة اعتراض|لائحة|استئناف|اعتراض/.test(t)) return 0;
  if (/حكم|صك|قرار/.test(t)) return 1;
  if (/مذكرة|رد |جواب|دفوع/.test(t)) return 2;
  if (/محضر|ضبط|جلسة/.test(t)) return 3;
  if (/عقد|اتفاق|وكالة|إقرار|تقرير|خبير|خطاب/.test(t)) return 4;
  if (/فاتورة|سند|هوية|سجل/.test(t)) return 6;
  return 5;
}

/** صفحات PDF تقديراً — يعدّ كائنات /Type /Page؛ وإن لم تُعدّ (مضغوطة) فمن الحجم */
function pdfPages(u8: Uint8Array): number {
  const head = new TextDecoder("latin1").decode(u8);
  const n = (head.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  return n > 0 ? n : Math.max(1, Math.round(u8.length / 90_000));
}

const docStoragePath = (url: string) => url.match(/\/storage\/v1\/object\/(?:public|sign)\/documents\/([^?]+)/)?.[1];

async function downloadDoc(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const path = docStoragePath(url);
  if (path) {
    const { data, error } = await admin.storage.from("documents").download(decodeURIComponent(path));
    if (!error && data) return { bytes: new Uint8Array(await data.arrayBuffer()), type: (data.type || "").toLowerCase() };
  }
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: (res.headers.get("content-type") || "").split(";")[0].toLowerCase() };
}

function toB64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(s);
}

type DocCoverage = { total: number; read: { name: string; kind: string }[]; skipped: { name: string; reason: string }[] };

// deno-lint-ignore no-explicit-any
async function loadCaseDocs(docList: any[]): Promise<{ blocks: any[]; coverage: DocCoverage }> {
  const ordered = [...docList].sort((a, b) =>
    docRank(a) - docRank(b) || String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  const blocks: any[] = [];
  const coverage: DocCoverage = { total: docList.length, read: [], skipped: [] };
  let bytes = 0, pages = 0, chars = 0, images = 0;
  for (const d of ordered) {
    const name = String(d.name || "مستند");
    const low = `${d.file_type ?? ""} ${d.file_url ?? ""} ${name}`.toLowerCase();
    const kind = /pdf/.test(low) ? "pdf" : /wordprocessingml|\.docx\b/.test(low) ? "word"
      : /image\/|\.(jpe?g|png|webp|gif)\b/.test(low) ? "image" : /\.doc\b|msword/.test(low) ? "doc" : "other";
    if (!d.file_url) { coverage.skipped.push({ name, reason: "بلا ملف" }); continue; }
    if (kind === "doc" || kind === "other") { coverage.skipped.push({ name, reason: kind === "doc" ? "صيغة Word قديمة (.doc)" : "صيغة لا تُقرأ" }); continue; }
    if (d.file_size && kind === "pdf" && d.file_size > PDF_MAX_BYTES) { coverage.skipped.push({ name, reason: "أكبر من ١٥ م.ب" }); continue; }
    if (kind === "image" && images >= IMG_MAX_COUNT) { coverage.skipped.push({ name, reason: "تجاوز عدد الصور" }); continue; }
    if (bytes >= DOC_BYTES_BUDGET || pages >= DOC_PAGES_BUDGET) { coverage.skipped.push({ name, reason: "لم يتسع له حجم القراءة" }); continue; }
    const f = await downloadDoc(d.file_url).catch(() => null);
    if (!f) { coverage.skipped.push({ name, reason: "تعذّر تنزيله" }); continue; }
    try {
      if (kind === "word") {
        const text = (await docxText(f.bytes)).trim();
        if (!text) { coverage.skipped.push({ name, reason: "بلا نص" }); continue; }
        if (chars + text.length > DOC_TEXT_BUDGET) { coverage.skipped.push({ name, reason: "لم يتسع له حجم القراءة" }); continue; }
        chars += text.length;
        blocks.push({ type: "document", source: { type: "text", media_type: "text/plain", data: text }, title: name });
      } else if (kind === "image") {
        if (f.bytes.length > IMG_MAX_BYTES || bytes + f.bytes.length > DOC_BYTES_BUDGET) { coverage.skipped.push({ name, reason: "صورة كبيرة" }); continue; }
        const mt = ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(f.type) ? f.type : "image/jpeg";
        blocks.push({ type: "text", text: `صورة من مستندات الملف: «${name}»` });
        blocks.push({ type: "image", source: { type: "base64", media_type: mt, data: toB64(f.bytes) } });
        bytes += f.bytes.length; images++;
      } else {
        const pg = pdfPages(f.bytes);
        if (bytes + f.bytes.length > DOC_BYTES_BUDGET || pages + pg > DOC_PAGES_BUDGET) { coverage.skipped.push({ name, reason: "لم يتسع له حجم القراءة" }); continue; }
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: toB64(f.bytes) }, title: name });
        bytes += f.bytes.length; pages += pg;
      }
      coverage.read.push({ name, kind });
    } catch {
      coverage.skipped.push({ name, reason: "تعذّرت قراءته" });
    }
  }
  return { blocks, coverage };
}

/** يسجّل فشل التوليد ليعرضه تبويب الدراسة بدل رسالة المهلة العامة */
async function logFailure(caseId: string, message: string): Promise<void> {
  try {
    await admin.from("error_logs").insert({
      error_type: "case_study",
      source: "case-study",
      url: caseId,
      message: message.slice(0, 500),
    });
  } catch (_) { /* التسجيل ثانوي — لا يبتلع الخطأ الأصلي */ }
}

/* ===================== نداء الذكاء بالبثّ ===================== */

/**
 * يستدعي النموذج ببثّ SSE ويجمّع مدخلات أداة save_study قطعةً قطعة.
 * البثّ ليس ترفاً: المخرَج الطويل بلا بثّ يصطدم بمهلة HTTP، والسقف الواسع
 * (32000) يمنع قطع الأداة في منتصفها — وهو ما كان يُسقط دراسات الملفات الكبيرة.
 */
async function streamStudy(
  model: string,
  content: unknown,
  tool: unknown,
  forceTool = true
): Promise<{ parsed: any; stopReason: string | null }> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: 32000,
      stream: true,
      // التخزين المؤقت: أداة save_study (~١٩٠٠ توكن) والتعليمات (~٣٧٠) ثابتة بين الدراسات (فوق حد ٥١٢ لـ
      // Opus 5.5)، فنقطة تخزين على آخر الثابت؛ ومحتوى الملف ومستنداته بعدها في messages
      system: [cachedText(STUDY_SYSTEM)],
      tools: [tool],
      // الإجبار على الأداة لا تدعمه كل النماذج (Opus 5.5 يرفضه بـ400 — سجل الأخطاء 2026-10-07)؛
      // فإن رُفض يُعاد الطلب اختيارياً، والتعليمات تشترط التسليم عبر الأداة
      tool_choice: forceTool ? { type: "tool", name: "save_study" } : { type: "auto" },
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    if (forceTool && res.status === 400 && t.includes("tool_choice")) {
      return streamStudy(model, content, tool, false);
    }
    throw new Error(`مزوّد الذكاء (${res.status}): ${t.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let toolJson = "";
  let inTool = false;
  let stopReason: string | null = null;
  let inTokens = 0, outTokens = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";                 // السطر الأخير قد يكون ناقصاً
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      let ev: any;
      try { ev = JSON.parse(raw); } catch { continue; }
      switch (ev.type) {
        case "message_start":
          inTokens = ev.message?.usage?.input_tokens ?? 0;
          logCacheUsage("case-study", ev.message?.usage);
          break;
        case "content_block_start":
          if (ev.content_block?.type === "tool_use") inTool = true;
          break;
        case "content_block_delta":
          if (inTool && ev.delta?.type === "input_json_delta") toolJson += ev.delta.partial_json ?? "";
          break;
        case "content_block_stop":
          inTool = false;
          break;
        case "message_delta":
          if (ev.delta?.stop_reason) stopReason = ev.delta.stop_reason;
          if (ev.usage?.output_tokens) outTokens = ev.usage.output_tokens;
          break;
        case "error":
          throw new Error(`مزوّد الذكاء: ${ev.error?.message ?? "خطأ أثناء البثّ"}`);
      }
    }
  }

  console.log(`case-study stream: in=${inTokens} out=${outTokens} stop=${stopReason} json=${toolJson.length}`);
  let parsed: any = null;
  try { parsed = JSON.parse(toolJson); } catch { /* مقطوع → parsed يبقى null */ }
  return { parsed, stopReason };
}

/* ===================== دراسة القضية ===================== */

// إرشادا الملخصين — مشتركان بين الدراسة الكاملة ووضع «الملخصان وحدهما»
const GUIDE_SUMMARIES = `- oral_brief: «لو قال القاضي: اترك المذكرة وعلّمني وش ردّك» — من ٣ إلى ٥ نقاط قصيرة تُقال شفهياً في دقيقة، بلسان محامي موكّلنا أمام القاضي، الأقوى أولاً: ماذا نطلب (أو ندفع)، وسنده الأساسي، وردّنا على أهم ما يتمسك به الخصم. جمل قصيرة تُحفظ، بلا ذكر لنقاط ضعفنا.
- client_summary: ملخص يُرسل للموكّل كما هو إن سأل عن قضيته — بلغة بسيطة واضحة بلا مصطلحات معقدة، ٨٠–١٥٠ كلمة، يخاطبه بـ«حضرتكم»: أين وصلت القضية، وآخر ما تم، والخطوة القادمة وموعدها إن وُجد، والمتوقع بحذر مهني بلا وعود. لا يذكر استراتيجيتنا الداخلية ولا تقييمنا لنقاط الضعف ولا أسماء الموظفين.`;

const STUDY_SYSTEM = `أنت مستشار قانوني خبير في ${FIRM_NAME}، متمرّس في دراسة القضايا وفق القضاء السعودي والأنظمة السعودية.
تكتب دراسات قضايا احترافية بمنهجية الشركة المعتمدة. أسلوبك: عربية فصحى رسمية دقيقة، تحليل متوازن يبين نقاط القوة والضعف («يمكن الطعن بـ… ولكن مما يضعف ذلك…»)، استناد لنصوص الأنظمة بأرقام موادها عند الإمكان، وحياد مهني تام.
قواعد صارمة:
- اعتمد فقط على المعلومات والمستندات المقدمة — لا تختلق وقائع أو تواريخ أو أرقام مواد لست متأكداً منها.
- ما لا يتوفر في الملف اكتب عنه: «غير متوفر في الملف — يُستكمل يدوياً».
- نص عادي فقط (لا Markdown): النقاط بشرطة «- » أول السطر، والأرقام لاتينية، والتواريخ كما وردت.
- كن وافياً موجزاً: المجموع الكلي للدراسة لا يتجاوز 2200 كلمة، ولا يتجاوز أي قسم 250 كلمة
  (عدا الرأي القانوني: 450 كلمة). الإيجاز شرط مهني هنا لا اختصاراً للجهد — المحامي
  يقرأ الدراسة قبل الجلسة، والاسترسال يدفن الفكرة المهمة.
- سلّم الدراسة حصراً عبر استدعاء أداة save_study بأقسامها العشرة كاملة.`;

async function generateStudy(caseId: string, userName: string | null, reason?: string): Promise<void> {
  const { data: c, error: caseErr } = await admin
    .from("cases")
    // تلميح المفتاح صراحةً: لو تعددت مسارات الضمّ يرفض PostgREST بصمت وكانت
    // الرسالة تُخفي السبب («القضية غير موجودة» بينما الفحص الأولي وجدها)
    .select("*, contact:contacts!cases_contact_id_fkey(name, phone), assignee:team_members!cases_assignee_id_fkey(name)")
    .eq("id", caseId)
    .single();
  if (caseErr || !c) throw new Error(`تعذّر قراءة القضية: ${caseErr?.message ?? "غير موجودة"}`);

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
    admin.from("documents").select("name, description, category, file_url, file_type, file_size, created_at").eq("case_id", caseId).is("deleted_at", null).order("created_at", { ascending: true }),
  ]);

  const docList = (docs.data ?? []) as any[];
  const { blocks, coverage } = await loadCaseDocs(docList);
  const readDocs = coverage.read.map((r) => r.name);

  // ── النسخة السابقة (لقسم «ما الذي تغيّر» وللحفظ في السجل)
  const { data: prev } = await admin.from("case_studies").select("*").eq("case_id", caseId).maybeSingle();
  const prevSince = prev?.generated_at ?? null;
  const { data: sinceEvents } = prevSince
    ? await admin.from("matter_events").select("kind, sentence, created_at").eq("matter_id", caseId)
        .gt("created_at", prevSince).order("created_at", { ascending: true }).limit(40)
    : { data: [] as any[] };

  // ── سوابق المكتب: قضايا منتهية من النوع نفسه — ٢٢٧ قضية = مكتبة سوابق خاصة
  const { data: precedentRows } = await admin
    .from("cases")
    .select("id, title, subject, type, status, close_date, rulings(result, summary, ruling_date)")
    .eq("kind", "case").is("deleted_at", null).neq("id", caseId)
    .eq("type", c.type ?? "").in("status", ["muntahia", "closed", "منتهية"])
    .order("close_date", { ascending: false }).limit(12);
  const precedentsCtx = (precedentRows ?? []).map((p: any) => ({
    العنوان: p.title, الموضوع: (p.subject ?? "").slice(0, 200),
    الأحكام: (p.rulings ?? []).slice(0, 2).map((r: any) => `${r.ruling_date ?? ""}: ${r.result ?? ""} — ${(r.summary ?? "").slice(0, 120)}`),
  }));

  // ── الأسانيد النظامية: بحث في المصادر الرسمية فقط (مرحلة أولى، اختيارية)
  let statutesResearch = "";
  try {
    const rq = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 3000,
        system: "أنت باحث قانوني سعودي. تبحث في المصادر الرسمية فقط وتقتبس أرقام المواد بدقة. لا تختلق مادة لم تجدها.",
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5,
                  allowed_domains: ["laws.boe.gov.sa", "moj.gov.sa", "bankruptcy.gov.sa", "ncar.gov.sa"] }],
        messages: [{ role: "user", content: `قضية سعودية من نوع «${c.type ?? ""}»، موضوعها: ${(c.subject ?? c.title ?? "").slice(0, 600)}.
ابحث في المصادر الرسمية عن المواد النظامية الأكثر صلة (مرافعات شرعية، إثبات، إفلاس، تنفيذ، عمل… حسب الموضوع) واكتب قائمة مختصرة:
- اسم النظام — رقم المادة — نصها أو مضمونها بدقة — علاقتها بالقضية.
لا تزد على ٨ مواد. إن لم تجد نصاً موثوقاً لمادة فلا تذكرها.` }],
      }),
    });
    const rd = await rq.json();
    if (rq.ok) statutesResearch = (rd.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
  } catch (_) { /* البحث اختياري — الدراسة تكمل بدونه */ }

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
- what_changed: ${prev ? "قارن بالدراسة السابقة وأحداث الملف منذها (أدناه): ما الجديد وما أثره على الرأي والتوصية. إن لم يتغير شيء جوهري قل ذلك صراحة." : "هذه أول دراسة — اكتب: «أول دراسة للملف»."}
- precedents: من «سوابق المكتب» أدناه فقط: القضايا المشابهة فعلاً وكيف انتهت وما يُستفاد منها هنا. إن لم يكن بينها مشابه قل: «لا سوابق مشابهة في ملفات المكتب».
- statutes: الأسانيد النظامية من «نتائج البحث الرسمي» أدناه — اسم النظام ورقم المادة وعلاقتها. لا تذكر مادة لم ترد في البحث أو لست متأكداً منها.
${GUIDE_SUMMARIES}
- proposals: مقترحات تنفيذية يعتمدها المحامي بضغطة — من ٣ إلى ٨: مهام ملموسة (أدلة تُجمع، شهود، خبير، مذكرة تُعد، طلب يُقدَّم)، ومخاطر بمهلها (due_in_days عدد الأيام من اليوم)، وأسئلة تُطرح على الموكّل. كل مقترح عنوان قصير + تفصيل سطرين.

${prev ? `الدراسة السابقة (النسخة ${prev.version ?? 1}، ${String(prev.generated_at ?? "").slice(0,10)}) — الرأي والتوصية فيها:
${(prev.legal_opinion ?? "").slice(0, 1500)}
${(prev.suitability ?? "").slice(0, 600)}

أحداث الملف منذ تلك الدراسة:
${JSON.stringify((sinceEvents ?? []).map((e: any) => ({ التاريخ: String(e.created_at).slice(0,10), النوع: e.kind, الحدث: e.sentence })), null, 1)}
` : ""}
سوابق المكتب (قضايا منتهية من النوع نفسه — ${precedentsCtx.length}):
${JSON.stringify(precedentsCtx, null, 1)}

نتائج البحث الرسمي في الأنظمة:
${statutesResearch || "(تعذّر البحث أو لا نتائج — اكتب في statutes: «لم تُتَح مصادر رسمية في هذه الدورة؛ يُستكمل يدوياً»)"}

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

${blocks.length > 0 ? `المستندات المرفقة أعلاه (${readDocs.length} من ${docList.length}: ${readDocs.join("، ")}) هي مستندات القضية الفعلية — اقرأها كلها بعناية واستخرج منها الوقائع والأسانيد والدفوع، وصحيفة الدعوى واللوائح أولاً.${coverage.skipped.length ? `\nلم تُقرأ (اذكرها في attachments_list بسببها): ${coverage.skipped.map((x) => `${x.name} (${x.reason})`).join("، ")}` : ""}` : "لا مستندات مقروءة — اعتمد على بيانات النظام فقط ونبّه في الأقسام الناقصة."}`;

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
        what_changed: S, precedents: S, statutes: S,
        oral_brief: S, client_summary: S,
        proposals: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["task", "risk", "question"] },
              title: S, detail: S,
              due_in_days: { type: "integer" },
              priority: { type: "string", enum: ["عالية", "متوسطة", "منخفضة"] },
            },
            required: ["kind", "title", "detail"],
          },
        },
      },
      required: ["basics", "timeline", "facts", "requests", "plaintiff_grounds", "defendant_defenses", "references_list", "legal_opinion", "suitability", "attachments_list", "what_changed", "precedents", "statutes", "oral_brief", "client_summary", "proposals"],
    },
  };
  const model = await getModel();
  const { parsed, stopReason } = await streamStudy(model, content, STUDY_TOOL);
  if (!parsed || !parsed.basics || !parsed.legal_opinion || !parsed.suitability || !parsed.attachments_list) {
    // stop=max_tokens يعني أن النموذج قُطع في منتصف الأداة — رسالة صريحة
    // لا «دراسة غير مكتملة» المبهمة التي لا تدل المحامي على شيء
    throw new Error(
      stopReason === "max_tokens"
        ? "الدراسة تجاوزت سقف الطول فقُطعت — الملف كبير؛ أعد المحاولة أو قلّل مستندات الملف الداخلة في القراءة."
        : `دراسة غير مكتملة (توقّف: ${stopReason ?? "غير معروف"})`
    );
  }

  // نسخة سابقة؟ تُحفظ في السجل قبل الاستبدال — لا يضيع تحرير محامٍ
  const nextVersion = (prev?.version ?? 0) + 1;
  if (prev) {
    await admin.from("case_study_versions").insert({
      case_id: caseId, version: prev.version ?? 1,
      snapshot: prev, reason: reason ?? "إعادة توليد",
    });
  }

  const row = {
    case_id: caseId,
    version: nextVersion,
    what_changed: parsed.what_changed ?? null,
    precedents: parsed.precedents ?? null,
    statutes: parsed.statutes ?? null,
    stale_since: null,
    stale_reasons: [],
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
    oral_brief: parsed.oral_brief ?? null,
    client_summary: parsed.client_summary ?? null,
    status: "draft",
    generated_at: new Date().toISOString(),
    generated_by: `${model} — قرأ ${readDocs.length} من ${docList.length} مستند`,
    docs_coverage: coverage,
    updated_at: new Date().toISOString(),
    updated_by: userName,
  };
  const { error: saveErr } = await admin
    .from("case_studies")
    .upsert(row, { onConflict: "case_id" });
  if (saveErr) throw new Error(`تعذّر حفظ الدراسة: ${saveErr.message}`);

  // المقترحات: تُستبدل المعلّقة فقط — ما اعتمده المحامي أو رفضه يبقى شاهداً
  const props: any[] = Array.isArray(parsed.proposals) ? parsed.proposals : [];
  console.log(`case-study proposals: ${props.length} (case ${caseId}, v${nextVersion})`);
  await admin.from("case_study_proposals").delete().eq("case_id", caseId).eq("status", "proposed");
  if (props.length) {
    const { error: propErr } = await admin.from("case_study_proposals").insert(props.slice(0, 10).map((p) => {
      const d = Number(p.due_in_days);
      const due = Number.isFinite(d) && d > 0 ? riyadhToday(d) : null;
      return {
        case_id: caseId, study_version: nextVersion,
        kind: ["task", "risk", "question"].includes(p.kind) ? p.kind : "task",
        title: String(p.title ?? "").slice(0, 200), detail: p.detail ? String(p.detail) : null,
        due_date: due, priority: p.priority ?? null,
      };
    }));
    // لا نبتلع الخطأ — كان الإدراج يفشل بصمت فيظن المحامي أن الدراسة بلا مقترحات
    if (propErr) console.error("case-study proposals insert failed:", propErr.message);
  }
}

/* ===================== الملخصان وحدهما (دراسة قائمة) ===================== */

// اقتراح المدير 2026-10-10: الدراسات السابقة ليس فيها «لو سألك القاضي» و«ملخص للعميل» — يُولَّدان من نص الدراسة
// القائمة وآخر الجلسات دون إعادة قراءة المستندات (أرخص وأسرع)، ولا يمسّان بقية الأقسام ولا النسخة.
const SUMMARIES_TOOL = {
  name: "save_summaries",
  description: "حفظ ملخصَي الدراسة",
  input_schema: {
    type: "object",
    properties: { oral_brief: { type: "string" }, client_summary: { type: "string" } },
    required: ["oral_brief", "client_summary"],
  },
};

async function generateSummaries(caseId: string): Promise<void> {
  const { data: st } = await admin.from("case_studies")
    .select("basics, facts, requests, plaintiff_grounds, defendant_defenses, legal_opinion, suitability, what_changed")
    .eq("case_id", caseId).maybeSingle();
  if (!st) throw new Error("لا دراسة لهذا الملف بعد");
  const [{ data: c }, { data: sessions }] = await Promise.all([
    admin.from("cases").select("title, status, court, contact:contacts(name)").eq("id", caseId).maybeSingle(),
    admin.from("sessions").select("session_date, title, outcome, next_action").eq("case_id", caseId)
      .order("session_date", { ascending: false }).limit(4),
  ]);
  const cut = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const user = `من دراسة هذه القضية اكتب ملخصين وسلّمهما عبر أداة save_summaries:
${GUIDE_SUMMARIES}
القضية: ${cut((c as any)?.title, 200)} — الحالة: ${cut((c as any)?.status, 30)} — المحكمة: ${cut((c as any)?.court, 120)} — الموكّل: ${cut((c as any)?.contact?.name, 120)}
آخر الجلسات (الأحدث أولاً): ${JSON.stringify(sessions ?? [])}

من الدراسة:
بيانات القضية: ${cut(st.basics, 800)}
الوقائع: ${cut(st.facts, 1500)}
الطلبات: ${cut(st.requests, 600)}
أسانيد المدعي: ${cut(st.plaintiff_grounds, 1200)}
دفوع المدعى عليه: ${cut(st.defendant_defenses, 1200)}
الرأي القانوني: ${cut(st.legal_opinion, 2000)}
الموقف والتوصية: ${cut(st.suitability, 800)}
آخر ما تغيّر: ${cut(st.what_changed, 600)}`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: await getModel(),
      max_tokens: 8000,
      system: STUDY_SYSTEM.replace("بأقسامها العشرة كاملة", "").replace("save_study", "save_summaries"),
      tools: [SUMMARIES_TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`مزوّد الذكاء (${res.status}): ${(await res.text()).slice(0, 300)}`);
  const out = await res.json();
  const call = (out?.content ?? []).find((b: any) => b.type === "tool_use");
  const oral = String(call?.input?.oral_brief ?? "").trim();
  const client = String(call?.input?.client_summary ?? "").trim();
  if (!oral || !client) throw new Error(`لم يكتمل الملخصان (توقّف: ${out?.stop_reason ?? "غير معروف"})`);
  const { error } = await admin.from("case_studies")
    .update({ oral_brief: oral, client_summary: client }).eq("case_id", caseId);
  if (error) throw new Error(`تعذّر حفظ الملخصين: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح Anthropic غير مُعدّ." }, 500);
  try {
    const body = await req.json();

    // ⚠️ التحقق (2026-10-17): كانت الدالة تقبل المفتاح العام (anon، وهو في حزمة الويب) فيُطلق أيٌّ كان دراساتٍ
    // مكلفة لأي ملف — والدراسة صارت تقرأ مستندات الملف كلها. الآن: المهمة الليلية بالسرّ الداخلي وحده،
    // والتوليد اليدوي بجلسة موظف نشط يملك الوصول إلى الملف (RLS بجلسته).
    const internal = req.headers.get("x-internal-secret");
    let isCron = false;
    if (internal) {
      const { data: sec } = await admin.from("lookup_values").select("value")
        .eq("type", "discussion_ai_config").eq("label", "inbound_secret").maybeSingle();
      isCron = !!sec?.value && internal === sec.value;
      if (!isCron) return json({ error: "سرّ غير صالح" }, 401);
    }
    if (body?.mode === "stale" && !isCron) return json({ error: "للمهمة الليلية وحدها" }, 403);
    if (!isCron) {
      const auth = req.headers.get("Authorization") ?? "";
      const { data: u } = await admin.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
      if (!u?.user) return json({ error: "سجّل الدخول أولاً" }, 401);
      const { data: me } = await admin.from("team_members").select("is_active").eq("auth_id", u.user.id).maybeSingle();
      if (!me || me.is_active === false) return json({ error: "الحساب غير نشط" }, 403);
      const cid = String(body?.case_id || "");
      if (cid) {
        const asUser = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
          global: { headers: { Authorization: auth } }, auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: visible } = await asUser.from("cases").select("id").eq("id", cid).maybeSingle();
        if (!visible) return json({ error: "لا تملك الوصول إلى هذا الملف" }, 403);
      }
    }

    // cron ليلي: تجديد الدراسات التي علّمتها أحداث الملف قديمة (بحد ٥ كل ليلة)
    if (body?.mode === "stale") {
      const { data: stale } = await admin.from("case_studies")
        .select("case_id, stale_reasons").not("stale_since", "is", null)
        .order("stale_since", { ascending: true }).limit(5);
      // ويملأ الملخصين للدراسات السابقة لهما — خمس كل ليلة حتى تكتمل
      const { data: missing } = await admin.from("case_studies")
        .select("case_id").is("oral_brief", null).is("stale_since", null)
        .order("generated_at", { ascending: false }).limit(5);
      const work = (async () => {
        for (const m of missing ?? []) {
          await generateSummaries(m.case_id).catch((e) => console.error("summaries backfill", m.case_id, e?.message || e));
        }
        for (const st of stale ?? []) {
          const why = (st.stale_reasons ?? []).map((r: any) => r.kind).join("، ");
          await generateStudy(st.case_id, "تجديد ليلي", `تجديد تلقائي — أحداث: ${why}`).catch(async (e) => {
            console.error("stale refresh", st.case_id, e?.message || e);
            await logFailure(st.case_id, `تجديد ليلي: ${String(e?.message || e)}`);
          });
        }
      })();
      const er: any = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(work);
      return json({ ok: true, queued: (stale ?? []).length }, 202);
    }

    // الملخصان وحدهما لدراسة قائمة — زرّ في تبويب الدراسة
    if (body?.mode === "summaries") {
      const cid = String(body?.case_id || "");
      if (!cid) return json({ error: "case_id مطلوب" }, 400);
      const work = generateSummaries(cid).catch(async (e) => {
        console.error("summaries", cid, e?.message || e);
        await logFailure(cid, `ملخصا الدراسة: ${String(e?.message || e)}`);
      });
      const er: any = (globalThis as any).EdgeRuntime;
      if (er?.waitUntil) er.waitUntil(work);
      return json({ ok: true, started: true }, 202);
    }

    const caseId = String(body?.case_id || "");
    if (!caseId) return json({ error: "case_id مطلوب" }, 400);
    const userName = body?.user_name ? String(body.user_name) : null;

    // تحقق سريع أن القضية موجودة قبل بدء الخلفية
    const { data: exists } = await admin.from("cases").select("id").eq("id", caseId).maybeSingle();
    if (!exists) return json({ error: "القضية غير موجودة" }, 404);

    const work = generateStudy(caseId, userName, body?.reason ? String(body.reason) : undefined).catch(async (e) => {
      console.error("case-study background error:", e?.message || e);
      await logFailure(caseId, String(e?.message || e));
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
