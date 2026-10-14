// «ملخص ما اطّلعنا عليه» — ملفات العميل في الطلب الوارد (طلب المدير 2026-10-14: «ودي أضيف إضافة ملفات، ويعطيني
// ملخص من الملفات اللي اطلع عليها من خلال الذكاء»). يقرأ مستندات الطلب (PDF وصور وWord) ويكتب: الوقائع، والأطراف،
// والمطالبة، والتواريخ والمهل، والناقص، وانطباعاً أولياً — ويعبّي حقول الطلب الفارغة فقط (لا يطمس ما كتبه الموظف).
//
// النداء: {request_id} بجلسة الموظف — والقراءة نفسها بصلاحيته (RLS)، فمن لا يرى الطلب لا يلخّصه.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
// @deno-types="https://esm.sh/jszip@3.10.1/index.d.ts"
import * as JSZipNS from "https://esm.sh/jszip@3.10.1";
// deno-lint-ignore no-explicit-any
const JSZip: any = (JSZipNS as any).default ?? JSZipNS;
import { HIJRI_RULE, pickDate } from "../_shared/hijri.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const FALLBACK_MODEL = "claude-opus-5-5";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const admin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const CASE_TYPES = ["جزائي", "عامة", "تجاري", "أحوال شخصية", "عمالي", "إداري", "إفلاس"];
const MAX_DOCS = 8;
const MAX_BYTES = 10 * 1024 * 1024;

async function getModel(): Promise<string> {
  try {
    const { data } = await admin.from("lookup_values").select("value").eq("type", "ai_config").limit(1).maybeSingle();
    if (data?.value) {
      const cfg = JSON.parse(data.value as string);
      if (cfg.study_model) return String(cfg.study_model);
    }
  } catch (_) { /* الافتراضي */ }
  return FALLBACK_MODEL;
}

/** المسار داخل مخزن documents من رابطه العام — يُنزَّل بمفتاح الخادم (المخزن مغلق أمام anon) */
function storagePath(url: string): string | null {
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/documents\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function loadFile(url: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  const path = storagePath(url);
  if (path) {
    const { data, error } = await admin.storage.from("documents").download(path);
    if (!error && data) return { bytes: new Uint8Array(await data.arrayBuffer()), type: data.type || "" };
  }
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: (res.headers.get("content-type") || "").split(";")[0] };
}

const b64 = (u8: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(s);
};

async function docxText(u8: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(u8);
  const xml = (await zip.file("word/document.xml")?.async("string")) ?? "";
  return xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

const S = { type: "string" };
const TOOL = {
  name: "save_summary",
  description: "حفظ ملخص ما اطّلعنا عليه من ملفات العميل",
  input_schema: {
    type: "object",
    properties: {
      headline: { type: "string", description: "سطر واحد: ما الموضوع وماذا يريد العميل" },
      facts: { type: "array", items: S, description: "الوقائع نقاطاً قصيرة بالترتيب الزمني" },
      parties: { type: "array", items: { type: "object", properties: { name: S, role: S }, required: ["name", "role"] } },
      claim: { type: "string", description: "المطالبة أو محل النزاع ومبلغه إن ورد — أو فارغ" },
      key_dates: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: S,
            date_hijri: { type: "string", description: "كما ورد في المستند (مثل 1448/04/10) أو فارغ" },
            date: { type: "string", description: "ميلادي YYYY-MM-DD إن ورد ميلادياً فقط" },
            is_deadline: { type: "boolean", description: "مهلة نظامية يفوت الحق بفواتها (اعتراض، تقادم، تبليغ…) — والتاريخ عندها تاريخ بدء احتسابها" },
            deadline_days: { type: "integer", description: "مدة المهلة بالأيام من هذا التاريخ (مثل 30 للاعتراض) — يحسب النظام نهايتها" },
            deadline_kind: { type: "string", enum: ["objection", "prescription", "notice", "other"] },
          },
          required: ["label"],
        },
      },
      documents_seen: { type: "array", items: { type: "object", properties: { name: S, what: S }, required: ["name", "what"] } },
      missing_docs: { type: "array", items: S, description: "مستندات نحتاج طلبها من العميل" },
      first_impression: { type: "string", description: "انطباع أولي مهني حذر (٢–٤ جمل) — مسودة للمحامي لا رأي نهائي" },
      fields: {
        type: "object",
        description: "حقول للطلب إن ظهرت في الملفات بوضوح — وإلا اتركها",
        properties: {
          opponent_name: S, court_name: S, claim_number: S,
          case_type: { type: "string", enum: CASE_TYPES },
        },
      },
    },
    required: ["headline", "facts", "parties", "key_dates", "documents_seen", "missing_docs", "first_impression"],
  },
};

const SYSTEM = `أنت محامٍ أول في شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس (بريدة، السعودية).
عميل محتمل أرسل مستنداته قبل التعاقد. اقرأها بعناية واكتب «ملخص ما اطّلعنا عليه» لزميلك الذي سيتواصل معه.
قواعد:
- اعتمد على المستندات وحدها — لا تختلق وقائع ولا أرقام مواد ولا تواريخ.
- عربية مهنية موجزة، نقاط قصيرة، بلا Markdown.
- المهل: نبّه على كل مهلة نظامية يفوت بفواتها حق (مثل ٣٠ يوماً للاعتراض من تاريخ استلام الحكم) واذكر من أي تاريخ تُحسب.
- الانطباع الأولي حذر ومتوازن: ما يقوّي موقف العميل وما يضعفه، بلا وعود.
- إن كان بين الملفات نص محادثة واتساب: خذ منها ما قاله العميل عن مسألته وتواريخه، ولا تعدّ ردود المكتب الآلية وقائع.
${HIJRI_RULE}
- سلّم النتيجة حصراً عبر أداة save_summary.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح الذكاء غير مضبوط" }, 500);

  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const body = await req.json().catch(() => ({}));
  const requestId = String(body?.request_id ?? "");
  if (!requestId) return json({ error: "request_id مطلوب" }, 400);

  // الصلاحية: يقرأ الطلب بجلسته — وإلا فلا
  const { data: r, error: rErr } = await asUser.from("incoming_requests")
    .select("id, client_name, description, case_type, opponent_name, court_name, claim_number, critical_date, critical_date_kind")
    .eq("id", requestId).maybeSingle();
  if (rErr || !r) return json({ error: "لا صلاحية على هذا الطلب أو غير موجود" }, 403);

  const { data: docs } = await admin.from("request_documents").select("id, name, file_url")
    .eq("request_id", requestId).is("deleted_at", null).order("created_at", { ascending: true }).limit(60);
  if (!docs?.length) return json({ error: "لا ملفات في الطلب بعد" }, 400);

  // نص محادثة الواتساب أولاً فلا يُسقطه سقف الملفات، والصوت والمرئي لا يُنزَّلان أصلاً (لا يُقرآن)
  const ordered = [...docs].sort((a, b) => Number(/\.txt$/i.test(b.name ?? "")) - Number(/\.txt$/i.test(a.name ?? "")));
  const blocks: unknown[] = [];
  const read: string[] = [];
  const skipped: string[] = [];
  for (const d of ordered) {
    if (read.length >= MAX_DOCS || /\.(ogg|opus|mp3|m4a|mp4|mov|3gp)$/i.test(d.name ?? "")) { skipped.push(d.name); continue; }
    const f = await loadFile(d.file_url).catch(() => null);
    if (!f || f.bytes.length > MAX_BYTES) { skipped.push(d.name); continue; }
    const name = String(d.name ?? "").toLowerCase();
    const type = f.type.toLowerCase();
    try {
      if (type.includes("pdf") || name.endsWith(".pdf")) {
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(f.bytes) }, title: d.name });
      } else if (type.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/.test(name)) {
        const mt = type.startsWith("image/") ? type : name.endsWith(".png") ? "image/png" : "image/jpeg";
        blocks.push({ type: "text", text: `صورة: ${d.name}` });
        blocks.push({ type: "image", source: { type: "base64", media_type: mt, data: b64(f.bytes) } });
      } else if (name.endsWith(".docx") || type.includes("wordprocessingml")) {
        blocks.push({ type: "text", text: `مستند Word «${d.name}»:\n${(await docxText(f.bytes)).slice(0, 40000)}` });
      } else if (type.startsWith("text/") || name.endsWith(".txt")) {
        // نص محادثة الواتساب (2026-10-14) — ومن قبلُ أي ملف نصي
        blocks.push({ type: "text", text: `ملف نصي «${d.name}»:\n${new TextDecoder().decode(f.bytes).replace(/^\uFEFF/, "").slice(-30000)}` });
      } else { skipped.push(d.name); continue; }
      read.push(d.name);
    } catch { skipped.push(d.name); }
  }
  if (!read.length) return json({ error: "تعذّرت قراءة الملفات — الصيغ المدعومة: PDF وصور وWord ونص" }, 400);

  blocks.push({
    type: "text",
    text: `الطلب: ${r.client_name ?? ""}${r.case_type ? ` — نوعه: ${r.case_type}` : ""}
وصف الطلب كما سُجّل: ${String(r.description ?? "—").slice(0, 1500)}
اكتب ملخص ما اطّلعنا عليه من المستندات المرفقة (${read.length}) وسلّمه عبر save_summary.`,
  });

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: await getModel(),
      max_tokens: 16000, // التفكير يأكل من الميزانية نفسها — سقف ضيّق يقطع الأداة
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: blocks }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    await admin.from("error_logs").insert({ error_type: "request_summary", source: "request-summary", url: requestId, message: `مزوّد الذكاء ${res.status}: ${t.slice(0, 300)}` }).then(() => {}, () => {});
    return json({ error: res.status === 400 && t.includes("credit") ? "رصيد الذكاء منتهٍ — يُشحن من لوحة Anthropic" : "تعذّر التلخيص — حاول بعد قليل" }, 502);
  }
  const out = await res.json();
  const call = (out?.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  const s = call?.input;
  if (!s?.headline) return json({ error: `لم يكتمل الملخص (توقّف: ${out?.stop_reason ?? "غير معروف"})` }, 502);

  // الهجري يُحوَّل هنا بأم القرى — لا بالنموذج
  // ونهاية المهلة = بدء احتسابها + مدتها — حساب في الخادم لا تقدير من النموذج
  s.key_dates = (s.key_dates ?? []).map((k: Record<string, unknown>) => {
    const date = pickDate(k.date, k.date_hijri);
    const days = Number(k.deadline_days);
    const due = k.is_deadline && date && Number.isFinite(days) && days > 0
      ? new Date(Date.parse(date) + days * 86400_000).toISOString().slice(0, 10) : null;
    return { ...k, date, due };
  });
  const summary = { ...s, read, skipped, model: out?.model ?? null };

  // يعبّي الفارغ فقط — ما كتبه الموظف لا يُطمس
  const f = s.fields ?? {};
  const patch: Record<string, unknown> = { docs_summary: summary, docs_summary_at: new Date().toISOString() };
  if (!r.opponent_name && f.opponent_name) patch.opponent_name = String(f.opponent_name).slice(0, 200);
  if (!r.court_name && f.court_name) patch.court_name = String(f.court_name).slice(0, 200);
  if (!r.claim_number && f.claim_number) patch.claim_number = String(f.claim_number).slice(0, 60);
  if (!r.case_type && CASE_TYPES.includes(f.case_type)) patch.case_type = f.case_type;
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const deadline = (s.key_dates as { due?: string | null; is_deadline?: boolean; deadline_kind?: string }[])
    .filter((k) => k.is_deadline && k.due && k.due >= today)
    .sort((a, b) => String(a.due).localeCompare(String(b.due)))[0];
  if (!r.critical_date && deadline?.due) {
    patch.critical_date = deadline.due;
    if (["objection", "prescription", "notice"].includes(String(deadline.deadline_kind))) patch.critical_date_kind = deadline.deadline_kind;
  }
  const { error: upErr } = await admin.from("incoming_requests").update(patch).eq("id", requestId);
  if (upErr) return json({ error: `تعذّر حفظ الملخص: ${upErr.message}` }, 500);
  return json({ ok: true, summary, filled: Object.keys(patch).filter((k) => !k.startsWith("docs_summary")) });
});
