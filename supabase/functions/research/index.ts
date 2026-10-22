// =============================================================
// research — «الباحث» (طلب المدير 2026-10-16: «يبحث عن أي شيء… كأنه يستخدم تطبيق كلاود، ويحط مصادر من عنده»).
//
// محادثة محفوظة (research_chats/research_messages) يجيب فيها Claude بثّاً مباشراً (SSE) مستعيناً بـ:
//   • بحث الإنترنت وقراءة الصفحات (أداتا الخادم web_search / web_fetch) — والإحالة لكل معلومة
//   • مصادر المحادثة المفعّلة (research_chat_sources): نص أو PDF أو صورة، بإحالات للمقطع نفسه
//   • بيانات النظام للقراءة فقط وبصلاحيات الموظف نفسه (عميل بجلسته — لا مفتاح الخادم)
// ولا أدوات إنشاء أو إرسال: هذه أداة بحث، والتنفيذ للمساعد العائم.
//
// النداء: POST {chat_id?, message} بجلسة الموظف، ويُفضَّل x-region: eu-west-1 (بجوار القاعدة).
// الأحداث: meta {chat_id} · status {text} · delta {text} · done {message_id, citations} · error {message}
// =============================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.132.1";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

const FALLBACK_MODEL = "claude-opus-5-5";
const MAX_ROUNDS = 12; // تتسع لجولات إعادة الكتابة بملاحظات الموظف
const HISTORY = 20;
const MAX_SOURCE_CHARS = 600_000; // مجموع نصوص المصادر في الطلب (~٢٠٠ ألف رمز)
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const APP = "https://app.redwan.sa/#";

async function getModel(): Promise<string> {
  try {
    const { data } = await admin.from("lookup_values").select("value").eq("type", "ai_config").limit(1).maybeSingle();
    const cfg = data?.value ? JSON.parse(String(data.value)) : {};
    return String(cfg.research_model || FALLBACK_MODEL);
  } catch {
    return FALLBACK_MODEL;
  }
}

const SYSTEM = `أنت «الباحث» في شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس (بريدة، المملكة العربية السعودية). يسألك المحامون والموظفون عن أي شيء — مسائل نظامية، أنظمة ولوائح وتعاميم، مبادئ قضائية، صياغة، أخبار، أو عن بيانات المكتب نفسه.

كيف تعمل:
- للمعلومة النظامية أو الحديثة أو أي ما لا تجزم به: ابحث بأداة web_search، واقرأ الصفحة بـweb_fetch إن احتجت نصّها. قدّم المصادر الرسمية: هيئة الخبراء (laws.boe.gov.sa)، وزارة العدل (moj.gov.sa)، لجنة الإفلاس (bankruptcy.gov.sa)، المركز الوطني للوثائق (ncar.gov.sa)، ديوان المظالم، هيئة السوق المالية، وما في حكمها.
- إن أرفق الموظف مصادر في المحادثة فهي أمامك: أجب منها أولاً، واذكر ما لم تجده فيها صراحةً.
- لبيانات المكتب (ملف، قضية، حكم، مستند، جلسة) استعمل أدوات النظام؛ وما لا تُرجعه الأداة لا تملكه — لا تخمّن.
- لا تختلق أرقام مواد ولا نصوصاً نظامية ولا أحكاماً. إن لم تتحقق من رقم المادة فقل ذلك.
- حدّد إن كان النص المنقول قد عُدّل أو أُلغي متى ظهر لك ذلك من المصدر.

كيف تكتب:
- بالعربية الفصحى المهنية، مباشراً: الجواب أولاً ثم التفصيل.
- استعمل Markdown باعتدال: عناوين قصيرة، ونقاط، وجداول للمقارنة عند الحاجة.
- التواريخ بالهجري والميلادي معاً متى عرفتهما، والأرقام باللاتينية (1 2 3).
- اختم الإجابة النظامية بسطر «للتحقق:» يذكر ما يحسن مراجعته في المصدر الرسمي قبل الاعتماد.

إن طُلب منك خطاب أو مذكرة أو لائحة:
- اكتب النص نفسه جاهزاً للطباعة: الجهة المرسَل إليها، ثم «السلام عليكم ورحمة الله وبركاته»، ثم الموضوع، ثم المتن، ثم الطلبات مرقّمة، ثم الختام — بلا تمهيد ولا تعليق قبله أو بعده (تُنزَّل الإجابة ملف Word بترويسة المكتب كما هي).
- لا تكتب رقم الصادر ولا تاريخه — يُطبعان عند التوقيع. ولا سطر «للتحقق:» داخل الخطاب.`;

// ===== أدوات النظام: قراءة فقط وبجلسة الموظف =====
const SYSTEM_TOOLS = [
  {
    name: "search_office",
    description: "البحث في بيانات المكتب بصلاحيات الموظف: الملفات والقضايا والعملاء والوكالات (بحث عربي مطبّع)، والأحكام (عنوانها ومنطوقها ورقمها)، والمستندات (اسمها ووصفها). أرجِع النتائج بروابطها.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "كلمات البحث: اسم، رقم ملف CASE…، رقم قضية، موضوع" } },
      required: ["query"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
  {
    name: "get_case",
    description: "تفاصيل ملف واحد بصلاحيات الموظف: بياناته وأطرافه بصفاتهم وآخر جلساته وأحكامه ومهامه المفتوحة، ودراسة القضية (الوقائع والطلبات والأسانيد والدفوع والرأي — مبنية على مستندات الملف). استعملها قبل كتابة أي خطاب أو مذكرة عن ملف. مرّر رقم المكتب (CASE26045) أو المعرّف من search_office.",
    input_schema: {
      type: "object",
      properties: { case_ref: { type: "string", description: "رقم المكتب أو المعرّف" } },
      required: ["case_ref"],
      additionalProperties: false,
    },
    eager_input_streaming: true,
  },
];

const like = (q: string) => `%${q.replace(/[%,()]/g, " ").trim()}%`;

// deno-lint-ignore no-explicit-any
async function runSystemTool(asUser: any, name: string, input: any): Promise<{ text: string; isError?: boolean }> {
  try {
    if (name === "search_office") {
      const q = String(input?.query ?? "").trim().slice(0, 120);
      if (!q) return { text: "اكتب كلمات البحث", isError: true };
      const [g, r, d] = await Promise.all([
        asUser.rpc("global_search", { q }),
        asUser.from("rulings").select("id, case_id, title, ruling_number, ruling_date, court_name, result")
          .or(`title.ilike.${like(q)},result.ilike.${like(q)},ruling_number.ilike.${like(q)}`).limit(6),
        asUser.from("documents").select("id, case_id, name, description, created_at")
          .or(`name.ilike.${like(q)},description.ilike.${like(q)}`).is("deleted_at", null).limit(8),
      ]);
      const out = {
        office: (g.data ?? []).slice(0, 12).map((x: Record<string, unknown>) => ({
          ...x, link: x.kind === "case" || x.kind === "matter" ? `${APP}/cases/${x.id}` : undefined,
        })),
        rulings: (r.data ?? []).map((x: Record<string, unknown>) => ({
          ...x, result: String(x.result ?? "").slice(0, 500), link: x.case_id ? `${APP}/cases/${x.case_id}` : undefined,
        })),
        documents: (d.data ?? []).map((x: Record<string, unknown>) => ({
          ...x, link: x.case_id ? `${APP}/cases/${x.case_id}` : undefined,
        })),
      };
      return { text: JSON.stringify(out) };
    }
    if (name === "get_case") {
      const ref = String(input?.case_ref ?? "").trim();
      const byId = /^[0-9a-f-]{36}$/i.test(ref);
      const { data: c } = await asUser.from("cases")
        .select("id, office_num, title, kind, status, court, court_num, created_at, contact:contacts(name), assignee:team_members!cases_assignee_id_fkey(name)")
        .eq(byId ? "id" : "office_num", byId ? ref : ref.toUpperCase()).is("deleted_at", null).maybeSingle();
      if (!c) return { text: `لا ملف «${ref}» ضمن صلاحياتك`, isError: true };
      const [s, r, t, p, st] = await Promise.all([
        asUser.from("sessions").select("session_date, session_time, title, court, status, outcome, next_action")
          .eq("case_id", c.id).order("session_date", { ascending: false }).limit(6),
        asUser.from("rulings").select("title, ruling_number, ruling_date, court_name, result, outcome_short, objection_until")
          .eq("case_id", c.id).order("ruling_date", { ascending: false, nullsFirst: false }).limit(5),
        asUser.from("tasks").select("title, status, due_date, priority").eq("case_id", c.id)
          .is("deleted_at", null).not("status", "in", "(done,cancelled)").limit(10),
        // الأطراف بصفاتهم، ودراسة القضية (تقرأ مستندات الملف كلها) — مادة أي خطاب أو مذكرة عن الملف (2026-10-17)
        asUser.from("case_parties").select("role, party_side, name, nationality").eq("case_id", c.id),
        asUser.from("case_studies").select("basics, facts, requests, plaintiff_grounds, defendant_defenses, legal_opinion, statutes, generated_at, docs_coverage")
          .eq("case_id", c.id).maybeSingle(),
      ]);
      const cut = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : v);
      const study = st.data
        ? {
            تاريخها: st.data.generated_at, البيانات: cut(st.data.basics, 1500), الوقائع: cut(st.data.facts, 4000),
            الطلبات: cut(st.data.requests, 1500), الأسانيد: cut(st.data.plaintiff_grounds, 2500),
            الدفوع: cut(st.data.defendant_defenses, 2500), الرأي: cut(st.data.legal_opinion, 3000),
            الأسانيد_النظامية: cut(st.data.statutes, 2000),
            المستندات_المقروءة: (st.data.docs_coverage as { read?: { name: string }[] } | null)?.read?.map((x) => x.name) ?? null,
          }
        : null;
      return {
        text: JSON.stringify({
          ...c, link: `${APP}/cases/${c.id}`,
          sessions: s.data ?? [],
          rulings: (r.data ?? []).map((x: Record<string, unknown>) => ({ ...x, result: String(x.result ?? "").slice(0, 1200) })),
          open_tasks: t.data ?? [],
          parties: p.data ?? [],
          study: study ?? "لا دراسة لهذا الملف بعد — تُولَّد من تبويب «الدراسة» في الملف",
        }),
      };
    }
    return { text: "أداة غير معروفة", isError: true };
  } catch (e) {
    return { text: `تعذّر: ${(e as Error).message}`.slice(0, 300), isError: true };
  }
}

// ===== المصادر =====
const storagePath = (url: string) => url.match(/\/storage\/v1\/object\/(?:public|sign)\/documents\/([^?]+)/)?.[1];

function b64(u8: Uint8Array): string {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(s);
}

type Src = { id: string; title: string; kind: string; url: string | null; file_url: string | null; mime: string | null; extracted_text: string | null };

/** كتل المصادر بترتيبها — وdocIndex يربط رقم الوثيقة في الإحالة بالمصدر (الصور بلا إحالات فلا رقم لها) */
async function sourceBlocks(sources: Src[]): Promise<{ blocks: Anthropic.Beta.BetaContentBlockParam[]; docIndex: Src[]; skipped: string[] }> {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [];
  const docIndex: Src[] = [];
  const skipped: string[] = [];
  let chars = 0;
  for (const s of sources) {
    const mime = String(s.mime ?? "").toLowerCase();
    const isPdf = mime.includes("pdf") || (s.title ?? "").toLowerCase().endsWith(".pdf");
    const isImg = mime.startsWith("image/");
    if ((isPdf || isImg) && s.file_url) {
      const path = storagePath(s.file_url);
      const { data: blob } = path ? await admin.storage.from("documents").download(decodeURIComponent(path)) : { data: null };
      if (!blob || blob.size > MAX_PDF_BYTES) { skipped.push(s.title); continue; }
      const data = b64(new Uint8Array(await blob.arrayBuffer()));
      if (isPdf) {
        blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: s.title, citations: { enabled: true } });
        docIndex.push(s);
      } else {
        const mt = (["image/png", "image/jpeg", "image/webp", "image/gif"].includes(mime) ? mime : "image/jpeg") as "image/png";
        blocks.push({ type: "text", text: `صورة مرفقة مصدراً: «${s.title}»` });
        blocks.push({ type: "image", source: { type: "base64", media_type: mt, data } });
      }
      continue;
    }
    const text = (s.extracted_text ?? "").trim();
    if (!text) { skipped.push(s.title); continue; }
    if (chars + text.length > MAX_SOURCE_CHARS) { skipped.push(s.title); continue; }
    chars += text.length;
    blocks.push({
      type: "document",
      source: { type: "text", media_type: "text/plain", data: text },
      title: s.title,
      context: s.url ? `رابط المصدر: ${s.url}` : undefined,
      citations: { enabled: true },
    });
    docIndex.push(s);
  }
  // نقطة تخزين على آخر مصدر: الأسئلة التالية في المحادثة تقرأ المصادر من الذاكرة المؤقتة
  const last = blocks[blocks.length - 1] as { cache_control?: unknown } | undefined;
  if (last) last.cache_control = { type: "ephemeral" };
  return { blocks, docIndex, skipped };
}

type Cite = { kind: "web" | "source"; title: string; url?: string; source_id?: string; quote?: string };

// deno-lint-ignore no-explicit-any
function collectCitations(content: any[], docIndex: Src[], into: Map<string, Cite>) {
  for (const b of content) {
    if (b.type !== "text" || !Array.isArray(b.citations)) continue;
    for (const c of b.citations) {
      if (c.type === "web_search_result_location" && c.url) {
        if (!into.has(c.url)) into.set(c.url, { kind: "web", title: c.title || c.url, url: c.url, quote: c.cited_text?.slice(0, 300) });
      } else if (typeof c.document_index === "number") {
        const s = docIndex[c.document_index];
        const key = s ? `src:${s.id}` : `doc:${c.document_title}`;
        if (!into.has(key)) {
          into.set(key, s
            ? { kind: "source", title: s.title, source_id: s.id, url: s.url ?? s.file_url ?? undefined, quote: c.cited_text?.slice(0, 300) }
            : { kind: "web", title: c.document_title || "صفحة", quote: c.cited_text?.slice(0, 300) });
        }
      }
    }
  }
}

const TOOL_LABEL: Record<string, string> = {
  web_search: "يبحث في الإنترنت",
  web_fetch: "يقرأ صفحة",
  code_execution: "يرتّب نتائج البحث", // تصفية البحث الآلية في web_search_20260209
  search_office: "يبحث في بيانات المكتب",
  get_case: "يقرأ ملفاً",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST فقط" }, 405);

  const auth = req.headers.get("Authorization") ?? "";
  const [{ data: u }, body] = await Promise.all([
    admin.auth.getUser(auth.replace(/^Bearer\s+/i, "")),
    req.json().catch(() => ({})),
  ]);
  if (!u?.user) return json({ error: "جلسة غير صالحة" }, 401);
  const { data: me } = await admin.from("team_members").select("id, name, is_active, member_type, is_reviewer").eq("auth_id", u.user.id).maybeSingle();
  if (!me || me.is_active === false || me.member_type === "collaborator" || me.is_reviewer) return json({ error: "«الباحث» غير متاح لهذا الحساب" }, 403);

  const asUserEarly = createClient(URL_, ANON, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ملاحظة أثناء الكتابة (طلب المدير 2026-10-22: «وانت تكتب لي او تبحث… اكتب لك بنفس الوقت ثم تشوف
  // اللي كتبته انا وترسل مرة وحده»): تُحفظ رسالةً في المحادثة، والتشغيلة الجارية تلتقطها بالاستطلاع.
  if (body?.mode === "note") {
    const text = String(body?.text ?? "").trim();
    if (!text) return json({ error: "اكتب الملاحظة" }, 400);
    if (text.length > 5000) return json({ error: "الملاحظة أطول من ٥ آلاف حرف" }, 400);
    const cid = typeof body?.chat_id === "string" ? body.chat_id : "";
    const { data: own } = await asUserEarly.from("research_chats").select("id").eq("id", cid).is("deleted_at", null).maybeSingle();
    if (!own) return json({ error: "المحادثة غير موجودة" }, 404);
    const { data: row, error } = await admin.from("research_messages").insert({ chat_id: cid, role: "user", content: text }).select("id").single();
    if (error || !row) return json({ error: "تعذّر حفظ الملاحظة" }, 500);
    return json({ id: row.id });
  }

  // ملاحظات وصلت بعد أن حُفظت الإجابة: تُجاب الآن دون إعادة إدراجها
  const reuseIds: string[] = Array.isArray(body?.reuse_ids)
    ? body.reuse_ids.filter((x: unknown) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x)).slice(0, 20)
    : [];
  let message = String(body?.message ?? "").trim();
  if (!message && !reuseIds.length) return json({ error: "اكتب سؤالك" }, 400);
  if (message.length > 20_000) return json({ error: "السؤال أطول من ٢٠ ألف حرف — أضفه مصدراً بدل ذلك" }, 400);

  const asUser = asUserEarly;

  // المحادثة: القائمة بصلاحية صاحبها، أو جديدة باسم أول سؤال — ومربوطة بملف إن بدأت من صفحته
  let chatId = typeof body?.chat_id === "string" ? body.chat_id : null;
  // رقم التشغيلة من المتصفح — «إيقاف» يكتبه في research_chats.stop_run فنتوقف (2026-10-17)
  const runId = typeof body?.run_id === "string" && /^[0-9a-f-]{36}$/i.test(body.run_id) ? body.run_id : null;
  let caseId: string | null = null;
  if (chatId) {
    const { data: c } = await asUser.from("research_chats").select("id, case_id").eq("id", chatId).is("deleted_at", null).maybeSingle();
    if (!c) return json({ error: "المحادثة غير موجودة" }, 404);
    caseId = c.case_id ?? null;
  } else {
    const wanted = typeof body?.case_id === "string" && /^[0-9a-f-]{36}$/i.test(body.case_id) ? body.case_id : null;
    if (wanted) {
      const { data: vis } = await asUser.from("cases").select("id").eq("id", wanted).maybeSingle();
      if (!vis) return json({ error: "لا تملك الوصول إلى هذا الملف" }, 403);
      caseId = wanted;
    }
    const title = message.replace(/\s+/g, " ").slice(0, 70);
    const { data: c, error } = await admin.from("research_chats").insert({ owner_id: me.id, title, case_id: caseId }).select("id").single();
    if (error || !c) return json({ error: "تعذّر بدء المحادثة" }, 500);
    chatId = c.id;
  }
  // الملف المربوط: رقمه وعنوانه في التعليمات، وتفاصيله بأداة get_case (بصلاحية الموظف)
  let caseNote = "";
  if (caseId) {
    const { data: cs } = await asUser.from("cases").select("id, office_num, title").eq("id", caseId).maybeSingle();
    if (cs) caseNote = `\nهذه المحادثة عن ملف المكتب ${cs.office_num ?? ""} «${cs.title ?? ""}» (المعرّف ${cs.id}). ما يُسأل عنه هنا يخص هذا الملف ما لم يُذكر غيره: اقرأه بأداة get_case بمعرّفه قبل أي خطاب أو رأي، وابنِ على أطرافه ودراسته ووقائعه، ولا تختلق ما ليس فيها — اترك فراغاً (……) لما ينقص.`;
  }

  const startedAt = Date.now();
  const encoder = new TextEncoder();
  // الإجابة تكتمل وتُحفظ ولو غادر الموظف الصفحة (2026-10-17: «كتبت للباحث وطلعت ورجعت حصلته متوقف»):
  // انقطاع المتصفح كان يرمي «cannot close or enqueue» داخل الحلقة فتضيع الإجابة كلها. الآن البث
  // يتوقف بصمت والعمل يستمر حتى الحفظ، وwaitUntil يُبقي الدالة حيّة بعد إغلاق الاتصال.
  let clientGone = false;
  const stream = new ReadableStream({
    cancel() { clientGone = true; },
    start(ctrl) {
      const send = (event: string, data: unknown) => {
        if (clientGone) return;
        try { ctrl.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); }
        catch { clientGone = true; }
      };
      let stopped = false;
      let stopTimer: number | null = null;
      // ملاحظات الموظف أثناء العمل: كل رسالة منه في المحادثة بعد سؤال هذه التشغيلة
      let since = new Date().toISOString();
      const consumed = new Set<string>();
      let pending: { id: string; content: string }[] = [];
      const fetchNotes = async () => {
        const { data } = await admin.from("research_messages").select("id, content")
          .eq("chat_id", chatId).eq("role", "user").gt("created_at", since).order("created_at");
        const fresh = (data ?? []).filter((r) => !consumed.has(r.id) && !pending.some((p) => p.id === r.id));
        pending = [...pending, ...fresh];
        return fresh.length > 0;
      };
      // تُسلَّم الملاحظات للنموذج نصاً واحداً، وتُعلَّم مقروءة عند المتصفح
      const takeNotes = (rewrite: boolean) => {
        const ids = pending.map((p) => p.id);
        ids.forEach((id) => consumed.add(id));
        const text = `ملاحظات من ${me.name} كتبها وأنت تعمل — خذ بها كلها:\n` + pending.map((p) => `- ${p.content}`).join("\n") +
          (rewrite ? "\n\nأعد كتابة إجابتك كاملة بعد الأخذ بها — النسخة النهائية وحدها، بلا تعليق على ما عدّلت." : "");
        pending = [];
        send("notes", { ids });
        return text;
      };
      let restart = false;      // ملاحظة وصلت والنموذج يكتب نص الإجابة ⇒ نقطع ونعيد الجولة بها
      let roundText = 0;        // ما كُتب من نص في الجولة الجارية
      const work = (async () => {
      const tools: string[] = [];
      let answer = "";
      let model = FALLBACK_MODEL;
      let error: string | null = null;
      try {
        send("meta", { chat_id: chatId });
        if (reuseIds.length) {
          const { data: rows } = await admin.from("research_messages").select("id, content, created_at")
            .eq("chat_id", chatId).eq("role", "user").in("id", reuseIds).order("created_at");
          if (!rows?.length) throw new Error("الملاحظات غير موجودة");
          rows.forEach((r) => consumed.add(r.id));
          message = rows.map((r) => r.content).join("\n");
          since = rows[rows.length - 1].created_at;
        } else {
          const { data: mine } = await admin.from("research_messages").insert({ chat_id: chatId, role: "user", content: message })
            .select("created_at").single();
          since = mine?.created_at ?? new Date().toISOString();
        }

        const [{ data: hist }, { data: links }, m] = await Promise.all([
          admin.from("research_messages").select("role, content").eq("chat_id", chatId)
            .order("created_at", { ascending: false }).limit(HISTORY + 1),
          asUser.from("research_chat_sources")
            .select("source:research_sources(id, title, kind, url, file_url, mime, extracted_text, status, deleted_at)")
            .eq("chat_id", chatId),
          getModel(),
        ]);
        model = m;
        const sources = ((links ?? []) as { source: (Src & { status: string; deleted_at: string | null }) | null }[])
          .map((l) => l.source).filter((s): s is Src & { status: string; deleted_at: string | null } => !!s && s.status === "ready" && !s.deleted_at);
        if (sources.length) send("status", { text: `يقرأ ${sources.length === 1 ? "المصدر" : `${sources.length} مصادر`}` });
        const { blocks, docIndex, skipped } = await sourceBlocks(sources);
        if (skipped.length) send("status", { text: `تعذّرت قراءة: ${skipped.join("، ")}` });

        // السجل من الأقدم؛ والمصادر أول المحادثة (ثابتة فتُخزَّن) قبل أول سؤال
        const turns = (hist ?? []).reverse().filter((x) => x.content?.trim())
          // السؤال وملاحظاته رسائل متتالية من الموظف ⇒ دور واحد
          .reduce((acc: { role: string; content: string }[], t) => {
            const last = acc[acc.length - 1];
            if (last && last.role === t.role) last.content += "\n\n" + t.content;
            else acc.push({ role: t.role, content: t.content });
            return acc;
          }, []);
        while (turns.length && turns[0].role !== "user") turns.shift();
        const messages: Anthropic.Beta.BetaMessageParam[] = turns.map((t, i) => ({
          role: t.role as "user" | "assistant",
          content: i === 0 && blocks.length ? [...blocks, { type: "text", text: t.content }] : t.content,
        }));

        // «إيقاف»: نقرأ stop_run كل ١٫٥ ثانية (لا مع الأحداث وحدها — البحث في الإنترنت يسكت ثواني)،
        // فإن طابق تشغيلتنا قُطع البث الجاري وحُفظ ما كُتب
        let current: { abort(): void } | null = null;
        stopTimer = setInterval(async () => {
          if (stopped || restart) return;
          if (runId) {
            const { data } = await admin.from("research_chats").select("stop_run").eq("id", chatId).maybeSingle();
            if (data?.stop_run === runId) { stopped = true; current?.abort(); return; }
          }
          // ملاحظة جديدة والنموذج يكتب نص الإجابة: ما يكتبه سيُعاد على كل حال ⇒ نقطعه الآن
          if (await fetchNotes() && roundText > 0 && messages[messages.length - 1]?.role === "user") {
            restart = true; current?.abort();
          }
        }, 1500);

        const citations = new Map<string, Cite>();
        for (let round = 0; round < MAX_ROUNDS; round++) {
          if (stopped) break;
          const answerBefore = answer;
          roundText = 0;
          const s = anthropic.beta.messages.stream({
            model,
            max_tokens: 64000,
            output_config: { effort: "high" },
            system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
                     { type: "text", text: `الموظف: ${me.name}. اليوم: ${new Date().toISOString().slice(0, 10)}.${caseNote}` }],
            tools: [
              { type: "web_search_20260209", name: "web_search", max_uses: 8, user_location: { type: "approximate", country: "SA", city: "Buraydah", timezone: "Asia/Riyadh" } },
              { type: "web_fetch_20260209", name: "web_fetch", max_uses: 5 },
              ...SYSTEM_TOOLS,
            ],
            messages,
            betas: ["server-side-fallback-2026-07-01"],
            // deno-lint-ignore no-explicit-any
            ...({ fallbacks: "default" } as any),
          } as Anthropic.Beta.MessageCreateParamsStreaming);

          current = s;
          try {
          for await (const ev of s) {
            if (ev.type === "content_block_start") {
              const cb = ev.content_block as { type: string; name?: string };
              if ((cb.type === "server_tool_use" || cb.type === "tool_use") && cb.name) {
                tools.push(cb.name);
                send("status", { text: TOOL_LABEL[cb.name] ?? cb.name });
              } else if (cb.type === "thinking" && round === 0 && !answer) {
                send("status", { text: "يفكّر" });
              }
            } else if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
              answer += ev.delta.text;
              roundText += ev.delta.text.length;
              send("delta", { text: ev.delta.text });
            }
          }
          } catch (e) {
            if (!stopped && !restart) throw e; // قطعُنا نحن البث
          }
          if (stopped) break;
          if (restart) {
            // يُمحى نص هذه الجولة، وتُلحق الملاحظات بآخر رسالة من الموظف، وتُعاد الجولة
            restart = false;
            answer = answerBefore;
            send("reset", { text: answer });
            const last = messages[messages.length - 1];
            const note = { type: "text" as const, text: takeNotes(false) };
            last.content = typeof last.content === "string"
              ? [{ type: "text", text: last.content }, note]
              : [...(last.content as Anthropic.Beta.BetaContentBlockParam[]), note];
            continue;
          }
          const msg = await s.finalMessage();
          collectCitations(msg.content as unknown[] as Record<string, unknown>[], docIndex, citations);

          if (msg.stop_reason === "refusal") {
            if (!answer) { answer = "تعذّرت الإجابة عن هذا الطلب."; send("delta", { text: answer }); }
            break;
          }
          if (msg.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
            continue;
          }
          if (msg.stop_reason !== "tool_use") {
            // آخر فرصة قبل الحفظ: ملاحظة وصلت والمسودة اكتملت ⇒ تُعاد كاملة بها، ويُرسل الأخير وحده
            if (msg.stop_reason === "end_turn" && round < MAX_ROUNDS - 1 && (pending.length || await fetchNotes())) {
              messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
              messages.push({ role: "user", content: takeNotes(true) });
              answer = "";
              send("reset", { text: "" });
              continue;
            }
            break;
          }

          const uses = msg.content.filter((b) => b.type === "tool_use") as Anthropic.Beta.BetaToolUseBlock[];
          const results = await Promise.all(uses.map(async (tu) => {
            const r = await runSystemTool(asUser, tu.name, tu.input);
            return { type: "tool_result" as const, tool_use_id: tu.id, content: r.text, is_error: r.isError || undefined };
          }));
          if (stopped) break;
          messages.push({ role: "assistant", content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
          // ملاحظات وصلت أثناء البحث تُسلَّم مع نتائجه، فيبني عليها قبل أن يكتب
          await fetchNotes();
          messages.push({ role: "user", content: pending.length ? [...results, { type: "text" as const, text: takeNotes(false) }] : results });
          if (answer && !answer.endsWith("\n")) { answer += "\n\n"; send("delta", { text: "\n\n" }); }
        }

        if (stopped) {
          const note = answer.trim() ? "\n\n— أُوقفت الإجابة بطلبك." : "أُوقفت الإجابة قبل أن تبدأ.";
          answer = answer.trim() + note;
          send("delta", { text: note });
        }
        const cites = [...citations.values()].slice(0, 30);
        const { data: saved } = await admin.from("research_messages")
          .insert({ chat_id: chatId, role: "assistant", content: answer.trim(), citations: cites, tools: [...new Set(tools)], model })
          .select("id").single();
        await admin.from("research_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
        send("done", { message_id: saved?.id ?? null, citations: cites, notes: [...consumed] });
      } catch (e) {
        error = e instanceof Anthropic.APIError ? `مزوّد الذكاء ${e.status}: ${e.message}` : String((e as Error).message);
        console.error("research", error);
        send("error", { message: error.includes("credit") ? "رصيد الذكاء منتهٍ — يُشحن من لوحة Anthropic" : "تعذّر إكمال الإجابة — حاول مرة أخرى" });
      } finally {
        if (stopTimer) clearInterval(stopTimer);
        await admin.from("ai_assistant_runs").insert({
          member_id: me.id, user_name: me.name, request: `[الباحث] ${message.slice(0, 300)}`,
          reply: answer.slice(0, 1000), tools: [...new Set(tools)], failed_tools: [], actions: stopped ? ["stopped"] : [],
          finished: !error, ms: Date.now() - startedAt, model, error,
        }).then(() => {}, () => {});
        if (!clientGone) { try { ctrl.close(); } catch { /* أغلقه المتصفح */ } }
      }
      })();
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(work);
      return work;
    },
  });

  return new Response(stream, {
    headers: { ...cors, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
});
