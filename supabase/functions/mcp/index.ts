// =============================================================
// mcp — موصّل MCP للمدير (طلب المدير 2026-10-22: «ابي النظام تحط فيه موصل mcp»).
// قراراته: له وحده بصلاحياته، قراءة وإجراءات بسيطة (مهمة، كتابة في نقاش) بلا حذف ولا مراسلة عملاء،
// ويُستعمل من Claude وChatGPT.
//
// النقل: Streamable HTTP (MCP 2025-06-18) — POST بـJSON-RPC والرد JSON، بلا جلسة (stateless).
// الدخول: الرابط نفسه يحمل رمزاً سرياً ‎/functions/v1/mcp/<token>‎ — يُنشئه المدير من الإعدادات ← التكاملات،
//   ويُحفظ بصمته (SHA-256) في lookup_values mcp_config/token_hash (للمدير وحده بسياسة *config*)، ويُلغى بحذفها.
//   (تطبيقا Claude وChatGPT لا يرسلان ترويسة مخصّصة للموصّل، فالرمز في الرابط.)
// السجل: كل نداء أداة في ai_assistant_runs بادئته [MCP].
// =============================================================
import { admin, runExtraTool } from "../_shared/agent-tools.ts";
import { loadScope, type AiScope } from "../_shared/aiScope.ts";
import { riyadhToday } from "../_shared/riyadh.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, accept, mcp-session-id, mcp-protocol-version",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const FIRM = "شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس";
const isoToday = () => riyadhToday();
const plusDays = (d: number) => riyadhToday(d);

async function sha256(t: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** الرمز من آخر مقطع في المسار — ويُطابق بصمته المحفوظة */
async function authorized(req: Request): Promise<boolean> {
  const token = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? "";
  if (token.length < 32 || token === "mcp") return false;
  const { data } = await admin.from("lookup_values").select("value")
    .eq("type", "mcp_config").eq("label", "token_hash").limit(1).maybeSingle();
  return !!data?.value && (await sha256(token)) === data.value;
}

/* ===================== الأدوات ===================== */

const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties, required });
const str = (description: string) => ({ type: "string", description });

const TOOLS = [
  // search/fetch بصيغة OpenAI — يحتاجها ChatGPT في وضع البحث، وتنفع Claude أيضاً
  { name: "search", description: "بحث عام في ملفات المكتب (القضايا والخدمات والإفلاس) والعملاء والمستندات. يعيد قائمة نتائج بمعرّف لكلٍّ تقرؤه بأداة fetch.",
    inputSchema: obj({ query: str("كلمة أو رقم: اسم موكّل، رقم ملف (CASE…)، رقم قضية في المحكمة، اسم مستند") }, ["query"]) },
  { name: "fetch", description: "قراءة نتيجة من search بمعرّفها (case:… أو contact:… أو doc:…) — تفاصيل كاملة.",
    inputSchema: obj({ id: str("المعرّف كما أعاده search") }, ["id"]) },
  { name: "get_case", description: "تفاصيل ملف برقم المكتب: الجلسات والمهام المفتوحة والمستندات والأحكام والأطراف وآخر رسائل نقاشه.",
    inputSchema: obj({ office_num: str("رقم المكتب مثل CASE26100") }, ["office_num"]) },
  { name: "list_sessions", description: "جلسات المحاكم في فترة (افتراضياً اليوم إلى ٧ أيام).",
    inputSchema: obj({ from_date: str("YYYY-MM-DD"), to_date: str("YYYY-MM-DD") }) },
  { name: "list_tasks", description: "المهام المفتوحة، اختيارياً لموظف بعينه أو المتأخرة فقط.",
    inputSchema: obj({ assignee_name: str("جزء من اسم الموظف"), overdue_only: { type: "boolean", description: "المتأخرة فقط" } }) },
  { name: "list_appointments", description: "مواعيد الموكّلين في فترة (افتراضياً اليوم إلى ٧ أيام).",
    inputSchema: obj({ from_date: str("YYYY-MM-DD"), to_date: str("YYYY-MM-DD") }) },
  { name: "search_documents", description: "بحث في مستندات المكتب بالاسم أو الوصف، اختيارياً داخل ملف.",
    inputSchema: obj({ query: str("ما يُبحث عنه"), case_office_num: str("رقم الملف لحصر البحث") }, ["query"]) },
  { name: "search_discussions", description: "بحث في نقاشات الفريق (ومنها ما قيل عن الملفات)، اختيارياً داخل ملف.",
    inputSchema: obj({ query: str("ما يُبحث عنه"), case_office_num: str("رقم الملف لحصر البحث") }, ["query"]) },
  { name: "list_expiring_poas", description: "الوكالات السارية التي تنتهي خلال عدد أيام (افتراضياً ٣٠).",
    inputSchema: obj({ days: { type: "number", description: "عدد الأيام" } }) },
  { name: "office_overview", description: "نظرة سريعة: الملفات الجارية، المهام المفتوحة والمتأخرة، جلسات اليوم والأسبوع، الوكالات المنتهية قريباً.",
    inputSchema: obj({}) },
  { name: "create_task", description: "إنشاء مهمة (إجراء — اعرضه على المدير قبل التنفيذ). تُسند لموظف بالاسم أو للمدير.",
    inputSchema: obj({
      title: str("عنوان المهمة"), due_date: str("YYYY-MM-DD"), assignee_name: str("اسم الموظف"),
      case_office_num: str("رقم الملف إن كانت لملف"), priority: { type: "string", enum: ["low", "med", "high"] },
    }, ["title"]) },
  { name: "post_discussion_message", description: "كتابة رسالة في نقاش ملف أو في «عام — المكتب» (إجراء — اعرض النص على المدير قبل الإرسال). تظهر منسوبة للذكاء.",
    inputSchema: obj({ body: str("نص الرسالة"), case_office_num: str("رقم الملف، وبدونه النقاش العام") }, ["body"]) },
];

/** نص البحث داخل مرشّح or في PostgREST: الفاصلة والأقواس تكسره */
const clean = (t: unknown) => String(t ?? "").replace(/[,()*%\\]/g, " ").trim().slice(0, 80);

async function memberIdByName(name: string): Promise<string | null> {
  const n = clean(name);
  if (!n) return null;
  const { data } = await admin.from("team_members").select("id")
    .or(`name.ilike.%${n}%,short_name.ilike.%${n}%`).eq("is_active", true).limit(1);
  return (data as any[])?.[0]?.id ?? null;
}

async function runTool(name: string, a: any, me: { id: string; name: string }, scope: AiScope, actions: string[]): Promise<string> {
  // أدوات مشتركة مع المساعد (بنطاق المدير)
  const shared: Record<string, string> = {
    get_case: "get_case_details", list_appointments: "list_appointments", search_documents: "search_documents",
    search_discussions: "search_discussions", office_overview: "office_overview", post_discussion_message: "post_discussion_message",
  };
  if (shared[name]) {
    const input = name === "list_appointments" ? { from_date: a.from_date, to_date: a.to_date } : a;
    return (await runExtraTool(shared[name], input, me.name, actions, scope)) ?? JSON.stringify({ error: "أداة غير معروفة" });
  }

  if (name === "search") {
    const q = clean(a.query);
    if (!q) return JSON.stringify({ results: [] });
    const [cs, ct, dc] = await Promise.all([
      admin.from("cases").select("office_num, title, kind").is("deleted_at", null)
        .or(`office_num.ilike.%${q}%,title.ilike.%${q}%,court_num.ilike.%${q}%`).not("kind", "in", "(dm,channel)").limit(8),
      admin.from("contacts").select("id, name, phone").or(`name.ilike.%${q}%,phone.ilike.%${q}%`).limit(5),
      admin.from("documents").select("id, name").is("deleted_at", null).or(`name.ilike.%${q}%,description.ilike.%${q}%`).limit(5),
    ]);
    const results = [
      ...(cs.data ?? []).map((c: any) => ({ id: `case:${c.office_num}`, title: `${c.office_num} — ${c.title ?? ""}`, url: `https://app.redwan.sa/#/cases` })),
      ...(ct.data ?? []).map((c: any) => ({ id: `contact:${c.id}`, title: `عميل: ${c.name}`, url: "https://app.redwan.sa/#/contacts" })),
      ...(dc.data ?? []).map((d: any) => ({ id: `doc:${d.id}`, title: `مستند: ${d.name}`, url: "https://app.redwan.sa/" })),
    ];
    return JSON.stringify({ results });
  }

  if (name === "fetch") {
    const id = String(a.id ?? "");
    const [kind, ref] = [id.split(":")[0], id.slice(id.indexOf(":") + 1)];
    if (kind === "case") {
      const text = (await runExtraTool("get_case_details", { office_num: ref }, me.name, actions, scope)) ?? "{}";
      return JSON.stringify({ id, title: ref, text, url: "https://app.redwan.sa/#/cases", metadata: { type: "case" } });
    }
    if (kind === "contact") {
      const { data } = await admin.from("contacts").select("*").eq("id", ref).maybeSingle();
      const { data: mat } = await admin.from("cases").select("office_num, title, status").eq("contact_id", ref).is("deleted_at", null).limit(20);
      return JSON.stringify({ id, title: data?.name ?? id, text: JSON.stringify({ contact: data, matters: mat ?? [] }), url: "https://app.redwan.sa/#/contacts", metadata: { type: "contact" } });
    }
    if (kind === "doc") {
      const { data } = await admin.from("documents").select("id, name, description, category, file_url, created_at, case:cases!documents_case_id_fkey(office_num, title)").eq("id", ref).maybeSingle();
      return JSON.stringify({ id, title: data?.name ?? id, text: JSON.stringify(data), url: data?.file_url ?? "", metadata: { type: "document" } });
    }
    return JSON.stringify({ error: "معرّف غير معروف" });
  }

  if (name === "list_sessions") {
    const from = String(a.from_date || isoToday()), to = String(a.to_date || plusDays(7));
    const { data, error } = await admin.from("sessions")
      .select("session_date, session_time, title, court, status, closed_at, case:cases!sessions_case_id_fkey(office_num, title)")
      .gte("session_date", from).lte("session_date", to).order("session_date").order("session_time").limit(60);
    return JSON.stringify(error ? { error: error.message } : { from, to, sessions: data ?? [] });
  }

  if (name === "list_tasks") {
    let q = admin.from("tasks")
      .select("title, due_date, priority, status, assignee:team_members!tasks_assignee_id_fkey(name), case:cases!tasks_case_id_fkey(office_num, title)")
      .eq("status", "todo").is("deleted_at", null).order("due_date", { ascending: true, nullsFirst: false }).limit(80);
    if (a.overdue_only) q = q.lt("due_date", isoToday());
    const { data, error } = await q;
    if (error) return JSON.stringify({ error: error.message });
    let rows = (data ?? []) as any[];
    if (a.assignee_name) rows = rows.filter((t) => String(t.assignee?.name ?? "").includes(String(a.assignee_name).trim()));
    return JSON.stringify(rows);
  }

  if (name === "list_expiring_poas") {
    const days = Number(a.days) > 0 ? Number(a.days) : 30;
    const { data, error } = await admin.from("powers_of_attorney")
      .select("poa_number, client_name, agent_name, expiry_date, case:cases!powers_of_attorney_case_id_fkey(office_num, title)")
      .is("deleted_at", null).eq("status", "active").gte("expiry_date", isoToday()).lte("expiry_date", plusDays(days))
      .order("expiry_date").limit(60);
    return JSON.stringify(error ? { error: error.message } : data ?? []);
  }

  if (name === "create_task") {
    const title = String(a.title ?? "").trim();
    if (!title) return JSON.stringify({ error: "العنوان مطلوب" });
    const assigneeId = a.assignee_name ? await memberIdByName(String(a.assignee_name)) : me.id;
    if (a.assignee_name && !assigneeId) return JSON.stringify({ error: `لم أجد موظفاً باسم «${a.assignee_name}»` });
    let caseId: string | null = null;
    if (a.case_office_num) {
      const { data } = await admin.from("cases").select("id").eq("office_num", String(a.case_office_num).trim()).maybeSingle();
      if (!data) return JSON.stringify({ error: `لم أجد ملفاً برقم ${a.case_office_num}` });
      caseId = data.id;
    }
    const { error } = await admin.from("tasks").insert({
      title, status: "todo", priority: ["low", "med", "high"].includes(a.priority) ? a.priority : "med",
      due_date: a.due_date || null, assignee_id: assigneeId, case_id: caseId, created_by: me.id,
    });
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`أُنشئت مهمة: ${title}`);
    return JSON.stringify({ created: true, title, assigned_to: a.assignee_name || me.name });
  }

  return JSON.stringify({ error: "أداة غير معروفة" });
}

/* ===================== بروتوكول MCP ===================== */

async function handle(msg: any, me: { id: string; name: string }, scope: AiScope): Promise<unknown | null> {
  const { id, method, params } = msg ?? {};
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id, error: { code, message } });
  if (id === undefined || id === null) return null; // إشعار — لا رد

  if (method === "initialize") {
    return ok({
      protocolVersion: params?.protocolVersion || "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "redwan-crm", title: "نظام مكتب رضوان", version: "1.0.0" },
      instructions: `نظام إدارة ${FIRM}. البيانات بالعربية، وأرقام الملفات بصيغة CASE…. ` +
        `الأدوات للقراءة، وcreate_task وpost_discussion_message إجراءان: اعرض ما ستفعله على المدير وانتظر موافقته قبل التنفيذ.`,
    });
  }
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: TOOLS });
  if (method === "tools/call") {
    const name = String(params?.name ?? "");
    if (!TOOLS.some((t) => t.name === name)) return fail(-32602, `أداة غير معروفة: ${name}`);
    const actions: string[] = [];
    const started = Date.now();
    let text = "", isError = false;
    try {
      text = await runTool(name, params?.arguments ?? {}, me, scope, actions);
      isError = /^\{"error"/.test(text);
    } catch (e) {
      text = JSON.stringify({ error: String((e as Error)?.message || e) });
      isError = true;
    }
    await admin.from("ai_assistant_runs").insert({
      member_id: me.id, user_name: me.name,
      request: `[MCP] ${name} ${JSON.stringify(params?.arguments ?? {}).slice(0, 250)}`,
      reply: text.slice(0, 1000), tools: [name], failed_tools: isError ? [name] : [], actions,
      finished: !isError, ms: Date.now() - started, model: "mcp", error: isError ? text.slice(0, 300) : null,
    }).then(() => {}, () => {});
    return ok({ content: [{ type: "text", text }], isError });
  }
  if (method === "resources/list") return ok({ resources: [] });
  if (method === "prompts/list") return ok({ prompts: [] });
  return fail(-32601, `غير مدعوم: ${method}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!(await authorized(req))) return json({ error: "unauthorized" }, 401);
  // لا بث من الخادم (stateless) — المواصفة تقبل 405 لطلب GET
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { ...cors, Allow: "POST, OPTIONS" } });

  const { data: d } = await admin.from("team_members").select("id, name").eq("is_director", true).eq("is_active", true).limit(1).maybeSingle();
  if (!d) return json({ error: "no director" }, 500);
  const scope = await loadScope(admin, d.id);
  if (!scope) return json({ error: "scope" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400); }
  const me = { id: d.id as string, name: (d.name as string) ?? "المدير" };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((m) => handle(m, me, scope)))).filter(Boolean);
    return out.length ? json(out) : new Response(null, { status: 202, headers: cors });
  }
  const out = await handle(body, me, scope);
  return out ? json(out) : new Response(null, { status: 202, headers: cors });
});
