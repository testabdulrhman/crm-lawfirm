// نص المستندات للبحث (طلب المدير 2026-11-03: «ودي البحث يكون يبحث عن كل شيء، حتى اللي داخل المستندات»).
// يأخذ من doc_text_queue ما لم يُستخرج نصه بعد، ويكتب document_texts:
//  - Word (.docx) وExcel (.xlsx): نصّهما من الملف مباشرة — بلا ذكاء.
//  - PDF: طبقته النصية (تلتقط الأرقام: القضية والصك والسجل) + قراءة الذكاء للنص العربي لأن الطبقة تخرج
//    مكسورة في خطابات Word العربية («املوضوع» بدل «الموضوع»). ما زاد على MAX_AI_PAGES يكتفي بالطبقة.
//  - الصور: قراءة الذكاء. والصوت وغيره: «skipped» (الملاحظة الصوتية نصّها في رسالتها أصلاً).
// المجدول كل خمس دقائق بدفعة صغيرة (درس: لا عشرات PDF في نداء واحد)، ونداء {document_id} لمستند بعينه.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "npm:unpdf@0.12.1";
// @deno-types="https://esm.sh/jszip@3.10.1/index.d.ts"
import * as JSZipNS from "https://esm.sh/jszip@3.10.1";
import { staffServiceOrInternal } from "../_shared/staffGuard.ts";
import { docxText } from "../_shared/docx.ts";

// deno-lint-ignore no-explicit-any
const JSZip: any = (JSZipNS as any).default ?? JSZipNS;
const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const DEFAULT_MODEL = "claude-haiku-5-5";
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_AI_PAGES = 40;
const BATCH = 3;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Doc = { id: string; name: string | null; file_path: string | null; file_url: string | null; file_type: string | null; file_size: number | null };
type Result = { status: "done" | "failed" | "skipped"; content?: string; source?: string; pages?: number; error?: string; model?: string; in_tokens?: number; out_tokens?: number };

async function model(): Promise<string> {
  try {
    const { data } = await admin.from("lookup_values").select("value").eq("type", "ai_config").limit(1).maybeSingle();
    const cfg = data?.value ? JSON.parse(String(data.value)) : {};
    return String(cfg.doc_text_model || DEFAULT_MODEL);
  } catch { return DEFAULT_MODEL; }
}

const ext = (name: string | null) => (name ?? "").toLowerCase().split(".").pop() ?? "";
const IMAGE_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

function sniffImage(u8: Uint8Array): string | null {
  if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47) return "image/png";
  if (u8[0] === 0xff && u8[1] === 0xd8) return "image/jpeg";
  if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return "image/gif";
  if (u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return "image/webp";
  return null;
}

function b64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}

async function bytesOf(d: Doc): Promise<Uint8Array> {
  if (d.file_path) {
    const { data, error } = await admin.storage.from("documents").download(d.file_path);
    if (!error && data) return new Uint8Array(await data.arrayBuffer());
  }
  const r = await fetch(d.file_url!);
  if (!r.ok) throw new Error(`تعذّر تنزيل الملف (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

/** نص Excel: كل نصوص الخلايا المشتركة والمضمّنة، سطراً سطراً */
async function xlsxText(u8: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(u8);
  const parts: string[] = [];
  const shared = (await zip.file("xl/sharedStrings.xml")?.async("string")) ?? "";
  for (const m of shared.matchAll(/<t[^>]*>([^<]*)<\/t>/g)) parts.push(m[1]);
  for (const f of Object.keys(zip.files).filter((n: string) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))) {
    const xml = (await zip.file(f)?.async("string")) ?? "";
    for (const m of xml.matchAll(/<v>([^<]*)<\/v>/g)) if (/\d{4,}/.test(m[1])) parts.push(m[1]);
  }
  return parts.join("\n").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

/** قراءة الذكاء: نسخ النص الظاهر حرفياً — للبحث لا للتلخيص */
async function aiTranscribe(block: Record<string, unknown>, mdl: string): Promise<{ text: string; inTok: number; outTok: number }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: mdl,
      max_tokens: 16000,
      // نسخ لا استنتاج — التفكير كان يضاعف الرموز الخارجة بلا فائدة (صورة نصّها رقم لوحة: ٤٩٨ رمزاً)
      thinking: { type: "disabled" },
      messages: [{
        role: "user",
        content: [
          block,
          { type: "text", text:
            "انسخ كل النص الظاهر في هذا المستند حرفياً وبترتيب قراءته، صفحةً بعد صفحة، بلا مقدمة ولا تعليق ولا تلخيص ولا ترجمة. " +
            "الأرقام كما هي (أرقام القضايا والصكوك والهويات والسجلات والمبالغ والتواريخ). الجداول: كل صف في سطر وخلاياه مفصولة بـ « | ». " +
            "تجاهل الزخارف والشعارات. إن لم يكن فيه نص مقروء فاكتب: (لا نص)" },
        ],
      }],
    }),
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out?.error?.message ?? `خطأ الذكاء (${res.status})`);
  // deno-lint-ignore no-explicit-any
  const text = (out.content ?? []).filter((c: any) => c.type === "text").map((c: any) => c.text).join("\n").trim();
  return { text: text === "(لا نص)" ? "" : text, inTok: out.usage?.input_tokens ?? 0, outTok: out.usage?.output_tokens ?? 0 };
}

async function extract(d: Doc, mdl: string): Promise<Result> {
  const e = ext(d.name) || ext(d.file_url);
  const supported = ["pdf", "docx", "xlsx", ...Object.keys(IMAGE_MIME)];
  if (!supported.includes(e)) return { status: "skipped", error: `نوع غير مدعوم (${e || "؟"})` };
  if ((d.file_size ?? 0) > MAX_BYTES) return { status: "skipped", error: "الملف أكبر من ٢٥ م.ب" };

  const u8 = await bytesOf(d);
  if (u8.byteLength > MAX_BYTES) return { status: "skipped", error: "الملف أكبر من ٢٥ م.ب" };

  if (e === "docx") return { status: "done", content: await docxText(u8), source: "docx" };
  if (e === "xlsx") return { status: "done", content: await xlsxText(u8), source: "xlsx" };

  if (IMAGE_MIME[e]) {
    // النوع من محتوى الملف لا من اسمه — ‎.jpg‎ كان PNG فرفضه الذكاء
    const mime = sniffImage(u8) ?? IMAGE_MIME[e];
    const r = await aiTranscribe({ type: "image", source: { type: "base64", media_type: mime, data: b64(u8) } }, mdl);
    return { status: "done", content: r.text, source: "image", model: mdl, in_tokens: r.inTok, out_tokens: r.outTok };
  }

  // PDF: الطبقة النصية أولاً (NFKC يفكّ أشكال العرض العربية ﻷ ﻻ)، ثم قراءة الذكاء لما لم يطل
  let layer = "";
  let pages = 0;
  try {
    const pdf = await getDocumentProxy(u8.slice());
    const r = await extractText(pdf, { mergePages: true });
    pages = r.totalPages;
    layer = String(r.text ?? "").normalize("NFKC").replace(/[ \t]+/g, " ").trim();
  } catch (_) { /* محمي أو تالف — يبقى للذكاء */ }

  let ai = { text: "", inTok: 0, outTok: 0 };
  if (pages === 0 || pages <= MAX_AI_PAGES) {
    ai = await aiTranscribe({ type: "document", source: { type: "base64", media_type: "application/pdf", data: b64(u8) } }, mdl);
  }
  const content = [ai.text, layer].filter(Boolean).join("\n\n— — —\n\n");
  return {
    status: "done", content, source: "pdf", pages,
    model: ai.inTok ? mdl : undefined, in_tokens: ai.inTok || undefined, out_tokens: ai.outTok || undefined,
    error: pages > MAX_AI_PAGES ? `${pages} صفحة — نصّه من طبقته وحدها` : undefined,
  };
}

async function save(d: Doc, r: Result) {
  const { data: prev } = await admin.from("document_texts").select("attempts").eq("document_id", d.id).maybeSingle();
  await admin.from("document_texts").upsert({
    document_id: d.id, status: r.status, content: r.content ?? null, source: r.source ?? null, pages: r.pages ?? null,
    error: r.error ?? null, model: r.model ?? null, in_tokens: r.in_tokens ?? null, out_tokens: r.out_tokens ?? null,
    attempts: (prev?.attempts ?? 0) + 1, extracted_at: new Date().toISOString(),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const caller = await staffServiceOrInternal(req);
  if (!caller) return json({ error: "غير مصرّح" }, 401);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح الذكاء غير مُعدّ" }, 500);

  const body = await req.json().catch(() => ({}));
  let docs: Doc[] = [];
  if (body?.document_id) {
    const { data } = await admin.from("documents").select("id, name, file_path, file_url, file_type, file_size")
      .eq("id", String(body.document_id)).is("deleted_at", null).maybeSingle();
    if (data) docs = [data as Doc];
  } else {
    const n = Math.min(Math.max(Number(body?.limit) || BATCH, 1), 8);
    const { data, error } = await admin.rpc("doc_text_queue", { n });
    if (error) return json({ error: error.message }, 500);
    docs = (data ?? []) as Doc[];
  }
  if (!docs.length) return json({ ok: true, processed: 0 });

  const mdl = await model();
  const results = await Promise.all(docs.map(async (d) => {
    let r: Result;
    try { r = await extract(d, mdl); } catch (e) { r = { status: "failed", error: String((e as Error)?.message ?? e).slice(0, 300) }; }
    await save(d, r);
    return { id: d.id, status: r.status, chars: r.content?.length ?? 0, in: r.in_tokens ?? 0, out: r.out_tokens ?? 0, error: r.error };
  }));
  return json({ ok: true, processed: results.length, results });
});
