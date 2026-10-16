// =============================================================
// research-source — يجهّز مصدراً أضافه الموظف في «الباحث» (2026-10-16) ليقرأه الذكاء:
//   ملف Word  ⇒ نصه (JSZip)            ملف نصي (txt/md/csv) ⇒ كما هو
//   PDF وصورة ⇒ جاهز كما هو (يُرسَل للنموذج أصلاً ويقرؤه بنفسه)
//   رابط      ⇒ تُجلب الصفحة وتُنظَّف إلى نص؛ ورابط PDF يُحفظ ملفاً في مخزننا
// والنص المنسوخ يُحفظ من المتصفح مباشرة جاهزاً، فلا يمرّ من هنا.
//
// النداء: {source_id} بجلسة صاحب المصدر — لا يُجهّز إلا مصدره (RLS ثم تحقق المالك).
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { docxText } from "../_shared/docx.ts";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

const MAX_FETCH = 4 * 1024 * 1024;
const MAX_TEXT = 400_000;

/** مسار الملف داخل مخزن documents من رابطه العام */
const storagePath = (url: string) =>
  url.match(/\/storage\/v1\/object\/(?:public|sign)\/documents\/([^?]+)/)?.[1];

/** لا يُجلب إلا http(s) عام — لا localhost ولا شبكات داخلية (حماية من طلب الخادم لنفسه) */
function safeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || !h.includes(".")) return null;
    if (/^(10|127|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h)) return null;
    if (h.startsWith("[") || /^[\d.]+$/.test(h) && !/^\d+\.\d+\.\d+\.\d+$/.test(h)) return null;
    return u;
  } catch {
    return null;
  }
}

const decodeEntities = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

/** صفحة HTML ⇒ نص مقروء: بلا سكربت ولا تنسيق ولا قوائم تنقّل، والفقرات أسطر */
function htmlToText(html: string): { title: string | null; text: string } {
  const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim() || null;
  const body = html
    .replace(/<(script|style|noscript|svg|nav|footer|header|form|iframe)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  const text = decodeEntities(body)
    .split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean).join("\n");
  return { title, text };
}

async function readBytes(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(await res.arrayBuffer());
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_FETCH) { await reader.cancel(); throw new Error("الصفحة أكبر من ٤ ميغابايت"); }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST فقط" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [{ data: u }, body] = await Promise.all([
    admin.auth.getUser(auth.replace(/^Bearer\s+/i, "")),
    req.json().catch(() => ({})),
  ]);
  if (!u?.user) return json({ error: "جلسة غير صالحة" }, 401);
  const sourceId = String(body?.source_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(sourceId)) return json({ error: "مصدر غير صالح" }, 400);

  const [{ data: src }, { data: me }] = await Promise.all([
    asUser.from("research_sources").select("id, owner_id, kind, title, file_url, url, mime").eq("id", sourceId).maybeSingle(),
    admin.from("team_members").select("id").eq("auth_id", u.user.id).maybeSingle(),
  ]);
  if (!src || !me || src.owner_id !== me.id) return json({ error: "لا صلاحية على هذا المصدر" }, 403);

  const done = async (patch: Record<string, unknown>) => {
    await admin.from("research_sources").update(patch).eq("id", sourceId);
    return json({ ok: patch.status === "ready", ...patch, extracted_text: undefined });
  };

  try {
    if (src.kind === "file") {
      const name = String(src.title ?? "").toLowerCase();
      const mime = String(src.mime ?? "").toLowerCase();
      if (mime.includes("pdf") || name.endsWith(".pdf") || mime.startsWith("image/")) {
        return await done({ status: "ready", error: null });
      }
      const path = src.file_url ? storagePath(src.file_url) : null;
      if (!path) return await done({ status: "failed", error: "الملف غير موجود في المخزن" });
      const { data: blob, error } = await admin.storage.from("documents").download(decodeURIComponent(path));
      if (error || !blob) return await done({ status: "failed", error: "تعذّر تنزيل الملف" });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let text = "";
      if (name.endsWith(".docx") || mime.includes("wordprocessingml")) text = await docxText(bytes);
      else if (mime.startsWith("text/") || /\.(txt|md|csv|json|html?)$/.test(name)) text = new TextDecoder().decode(bytes);
      else return await done({ status: "failed", error: "صيغة غير مدعومة — المدعوم: PDF وصور وWord ونص" });
      if (/\.html?$/.test(name) || mime.includes("html")) text = htmlToText(text).text;
      if (!text.trim()) return await done({ status: "failed", error: "الملف بلا نص مقروء" });
      return await done({ status: "ready", error: null, extracted_text: text.slice(0, MAX_TEXT) });
    }

    if (src.kind === "url") {
      const u2 = safeUrl(String(src.url ?? ""));
      if (!u2) return await done({ status: "failed", error: "رابط غير صالح أو غير عام" });
      const res = await fetch(u2.toString(), {
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
        headers: { "User-Agent": "Mozilla/5.0 (compatible; RedwanResearch/1.0)", "Accept-Language": "ar,en;q=0.8" },
      });
      if (!res.ok) return await done({ status: "failed", error: `الموقع ردّ بالخطأ ${res.status}` });
      const ct = (res.headers.get("content-type") ?? "").toLowerCase();
      const bytes = await readBytes(res);
      if (ct.includes("pdf") || u2.pathname.toLowerCase().endsWith(".pdf")) {
        // رابط PDF يُحفظ ملفاً عندنا — فيُقرأ أصلاً كالمرفوع ولا يضيع إن تغيّر الموقع
        const path = `research/${me.id}/${Date.now()}_link.pdf`;
        const up = await admin.storage.from("documents").upload(path, bytes, { contentType: "application/pdf" });
        if (up.error) return await done({ status: "failed", error: "تعذّر حفظ ملف الرابط" });
        return await done({
          status: "ready", error: null, mime: "application/pdf", size: bytes.length,
          file_url: `${URL_}/storage/v1/object/public/documents/${path}`,
        });
      }
      const charset = ct.match(/charset=([^;]+)/)?.[1]?.trim() || "utf-8";
      let raw: string;
      try { raw = new TextDecoder(charset).decode(bytes); } catch { raw = new TextDecoder().decode(bytes); }
      const { title, text } = ct.includes("html") || /<html/i.test(raw.slice(0, 2000)) ? htmlToText(raw) : { title: null, text: raw };
      if (text.trim().length < 80) return await done({ status: "failed", error: "لم يُقرأ من الصفحة نص كافٍ (قد تحتاج تسجيل دخول أو تعمل بالجافاسكربت)" });
      const patch: Record<string, unknown> = { status: "ready", error: null, mime: "text/html", size: bytes.length, extracted_text: text.slice(0, MAX_TEXT) };
      if (title && (!src.title || src.title === src.url)) patch.title = title.slice(0, 200);
      return await done(patch);
    }

    // النص المنسوخ يُحفظ جاهزاً من المتصفح
    return await done({ status: "ready", error: null });
  } catch (e) {
    console.error("research-source", (e as Error).message);
    return await done({ status: "failed", error: String((e as Error).message).slice(0, 200) });
  }
});
