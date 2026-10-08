// «خبر اليوم» (قرار المدير 2026-10-08: «ودي كل يوم آخذ منها خبر يطلع لنا في التطبيق» — للفريق وحده، لا الموقع العام).
// cron الصباح (٧ الرياض) ينادي {mode:"pick"}: نقرأ أخبار أساب للنشر الجديدة، ويختار النموذج خبراً واحداً هو الأقرب لعمل
// المكتب ويكتب له سطر «لماذا يهمّنا» بصياغتنا — أو لا يختار شيئاً إن لم يكن في اليوم ما يخصنا (تختفي البطاقة).
// خبر واحد في اليوم (day فريد) فالنداء المكرر لا يكلّف شيئاً. ولا نعرض نص المصدر: العنوان وسطرنا ورابطه.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const MODEL = "claude-haiku-5-5"; // اختيار من قائمة قصيرة مرة في اليوم — الأرخص يكفي
const SOURCE_API = "https://publishing.asap.sa/api/news";
const SOURCE_PAGE = "https://publishing.asap.sa/news/";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `أنت محامٍ أول في شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس (بريدة، السعودية).
عمل المكتب: التقاضي التجاري والعمالي والإداري والعام، التنفيذ، إجراءات الإفلاس (أمين إفلاس)، العقود والاستشارات، الوكالات والإفراغات العقارية.
مهمتك كل صباح: من قائمة أخبار قانونية اختر خبراً واحداً يفيد فريق المكتب في عمله أكثر من غيره.
الأولوية: ما يغيّر إجراءً أو مهلة أو اختصاصاً نعمل به (المحاكم، التنفيذ، الإفلاس، ديوان المظالم، المحاماة، الأنظمة واللوائح السعودية النافذة)، ثم المشاريع التنظيمية المطروحة للاستطلاع في مجالاتنا، ثم أخبار المهنة.
لا تختر: الرياضة والتهاني والإعلانات، وأخبار الدول الأخرى ما لم تمسّ عملاً سعودياً، وصفقات التمويل الأجنبية.
إن لم يكن في القائمة ما يستحق فاختر لا شيء — خبر ضعيف أسوأ من لا خبر.
«لماذا يهمّنا»: جملة واحدة بصياغتك (لا تنسخ نص الخبر)، ١٢–٢٥ كلمة، عملية: ماذا يعني لملفاتنا أو ماذا نراقب. بلا مبالغة ولا اختلاق تفاصيل غير مذكورة.
استدعِ الأداة pick مرة واحدة دائماً.`;

const PICK_TOOL = {
  name: "pick",
  description: "اختيار خبر اليوم أو لا شيء",
  input_schema: {
    type: "object",
    properties: {
      index: { type: ["integer", "null"], description: "رقم الخبر المختار من القائمة، أو null إن لم يستحق شيء" },
      why: { type: "string", description: "«لماذا يهمّنا» — جملة واحدة بصياغتك؛ فارغة إن لم تختر" },
    },
    required: ["index", "why"],
  },
};

interface Item { slug: string; category: string | null; title: string; summary: string | null; published_at: string }

const riyadhDay = (d = new Date()) => new Date(d.getTime() + 3 * 3600_000).toISOString().slice(0, 10);

async function logError(message: string) {
  await admin.from("error_logs").insert({ error_type: "daily_news", source: "daily-news", message }).then(() => {}, () => {});
}

async function pick(force = false) {
  const day = riyadhDay();
  if (!force) {
    const { data: ex } = await admin.from("daily_news").select("id").eq("day", day).maybeSingle();
    if (ex) return { ok: true, skipped: "already picked" };
  }

  const res = await fetch(SOURCE_API, { headers: { "User-Agent": "RedwanLawCRM/1.0 (+https://app.redwan.sa)" } });
  if (!res.ok) { await logError(`تعذّر جلب أخبار أساب: HTTP ${res.status}`); return { ok: false, error: `source ${res.status}` }; }
  const all = (await res.json().catch(() => null)) as Item[] | null;
  if (!Array.isArray(all)) { await logError("أخبار أساب: الرد ليس قائمة — ربما تغيّرت واجهتهم"); return { ok: false, error: "bad payload" }; }

  // الجديد فقط: آخر ٣٦ ساعة، ولم يُعرض من قبل
  const since = Date.now() - 36 * 3600_000;
  const { data: shown } = await admin.from("daily_news").select("source_slug").eq("source", "asap")
    .gte("day", riyadhDay(new Date(Date.now() - 10 * 86400_000)));
  const seen = new Set((shown ?? []).map((r: { source_slug: string }) => r.source_slug));
  const fresh = all.filter((n) => n?.slug && n?.title && new Date(n.published_at).getTime() >= since && !seen.has(n.slug)).slice(0, 15);

  if (fresh.length === 0) {
    // يومان بلا جديد = غالباً تغيّر شيء عندهم — يظهر في سجل الأخطاء للمدير
    const newest = all.reduce((m, n) => Math.max(m, new Date(n?.published_at ?? 0).getTime() || 0), 0);
    if (Date.now() - newest > 48 * 3600_000) await logError("أخبار أساب: لا أخبار جديدة منذ يومين — تحقّق من المصدر");
    return { ok: true, skipped: "no fresh news" };
  }

  const list = fresh.map((n, i) =>
    `${i}. [${n.category ?? "—"}] ${n.title}\n   ${String(n.summary ?? "").replace(/\s+/g, " ").slice(0, 400)}`).join("\n");

  const ai = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000, // النموذج يفكّر قبل الأداة — ٤٠٠ كانت تنفد في التفكير فلا يصل للاختيار
      system: SYSTEM, // بلا تخزين مؤقت: نداء واحد في اليوم والتعليمات دون الحد الأدنى
      tools: [PICK_TOOL],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: `أخبار اليوم (${fresh.length}):\n${list}` }],
    }),
  });
  if (!ai.ok) {
    const t = await ai.text();
    await logError(`خبر اليوم: فشل نداء الذكاء ${ai.status} ${t.slice(0, 300)}`);
    return { ok: false, error: `ai ${ai.status}` };
  }
  const out = await ai.json();
  const call = (out?.content ?? []).find((b: { type: string }) => b.type === "tool_use");
  const idx = call?.input?.index;
  const why = String(call?.input?.why ?? "").trim();
  if (idx === null || idx === undefined || !fresh[idx] || !why) {
    // الرد يُعاد في الاستجابة (سجل net._http_response) ليُفهم سبب «لا شيء»
    return { ok: true, skipped: "nothing relevant", candidates: fresh.length, model: out?.content ?? null, stop: out?.stop_reason ?? null };
  }

  const n = fresh[idx];
  const { error } = await admin.from("daily_news").insert({
    day, source: "asap", source_slug: n.slug, title: n.title, category: n.category,
    url: SOURCE_PAGE + encodeURIComponent(n.slug), why, published_at: n.published_at, candidates: fresh.length,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, picked: n.title, candidates: fresh.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح الذكاء غير مضبوط" }, 500);
  const body = await req.json().catch(() => ({}));
  if (body?.mode !== "pick") return json({ error: "mode غير معروف" }, 400);
  try {
    return json(await pick(false));
  } catch (e) {
    await logError(`خبر اليوم: ${String((e as Error)?.message || e)}`);
    return json({ error: "تعذّر اختيار خبر اليوم" }, 500);
  }
});
