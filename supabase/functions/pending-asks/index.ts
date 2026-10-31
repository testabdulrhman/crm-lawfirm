// «ينتظرون ردك» — ما طلبه الزملاء منك في النقاشات ولم ترد عليه (طلب المدير 2026-10-29: «انسى ارد عليهم أو انسى
// وش يبون مني»). للمدير وحده الآن («ابنه لي لحالي الآن»).
//
// المرشّحون: منشن لك لم تكتب بعده في الخيط نفسه (أو مجرى النقاش)، ورسائل الزميل في محادثة مباشرة بعد آخر رسالة لك.
// تُجمع رسائل الخيط الواحد طلباً واحداً، ويقرأ الذكاء سياقها فيكتب سطراً بما يريده أو يُسقطه («شكراً»، للعلم).
// يُعالَج الجديد فقط (comment_ids)، ويُقفل الطلب وحده حين ترد بعده. المجدول كل ساعة، والزر «حدّث» من اللوحة.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { staffServiceOrInternal } from "../_shared/staffGuard.ts";
import { riyadhToday } from "../_shared/riyadh.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const DEFAULT_MODEL = "claude-haiku-5-5";
const WINDOW_DAYS = 60;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

type Msg = { id: string; case_id: string; parent_id: string | null; author_id: string; body: string | null; created_at: string; document_id: string | null; mentions: string[] | null };
type Group = { key: string; case_id: string; thread_root: string | null; dm: boolean; items: Msg[] };

async function model(): Promise<string> {
  try {
    const { data } = await admin.from("lookup_values").select("value").eq("type", "ai_config").limit(1).maybeSingle();
    const cfg = data?.value ? JSON.parse(String(data.value)) : {};
    return String(cfg.asks_model || DEFAULT_MODEL);
  } catch { return DEFAULT_MODEL; }
}

const nameOf = (full: string | null | undefined) => {
  const w = String(full ?? "").replace(/^(المستشار|المحامي|المحامية)\s*:?\s*/, "").trim().split(/\s+/).filter(Boolean);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : (w[0] ?? "زميل");
};

/** هل كتب صاحب الطلب بعد هذه الرسالة في نطاقها؟ المحادثة المباشرة: أي رسالة بعدها؛ والخيط: رد فيه؛ والمجرى: رسالة في المجرى */
function answered(m: { created_at: string; parent_id: string | null; id: string }, mine: Msg[], dm: boolean): boolean {
  const root = m.parent_id ?? m.id;
  return mine.some((r) => r.created_at > m.created_at && (dm || r.parent_id === root || (m.parent_id === null && r.parent_id === null)));
}

async function runFor(memberId: string) {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  // ١) المحادثات المباشرة الحقيقية (عضوان) التي أنت فيها
  const { data: memberships } = await admin.from("channel_members").select("channel_id").eq("member_id", memberId);
  const chIds = (memberships ?? []).map((r) => r.channel_id);
  let dmIds: string[] = [];
  const soloIds = new Set<string>();
  if (chIds.length) {
    const [{ data: dms }, { data: counts }] = await Promise.all([
      admin.from("cases").select("id").in("id", chIds).eq("kind", "dm").is("deleted_at", null),
      admin.from("channel_members").select("channel_id").in("channel_id", chIds),
    ]);
    const n = new Map<string, number>();
    for (const r of counts ?? []) n.set(r.channel_id, (n.get(r.channel_id) ?? 0) + 1);
    dmIds = (dms ?? []).map((d) => d.id).filter((id) => (n.get(id) ?? 0) >= 2);
    // قناة أو محادثة لا عضو فيها غيرك (نسخة تجربة، ملاحظات) لا أحد ينتظر فيها رداً
    for (const id of chIds) if ((n.get(id) ?? 0) < 2) soloIds.add(id);
  }

  // ٢) المرشّحون: منشن لك، ورسائل المحادثات المباشرة من غيرك
  const cols = "id, case_id, parent_id, author_id, body, created_at, document_id, mentions";
  const [{ data: mentioned }, { data: dmMsgs }] = await Promise.all([
    admin.from("case_comments").select(cols).contains("mentions", [memberId]).neq("author_id", memberId)
      .eq("kind", "user").is("deleted_at", null).gte("created_at", since).order("created_at").limit(500),
    dmIds.length
      ? admin.from("case_comments").select(cols).in("case_id", dmIds).neq("author_id", memberId)
          .eq("kind", "user").is("deleted_at", null).gte("created_at", since).order("created_at").limit(500)
      : Promise.resolve({ data: [] as Msg[] }),
  ]);
  const dmSet = new Set(dmIds);
  const cand = new Map<string, Msg>();
  for (const m of [...(mentioned ?? []), ...(dmMsgs ?? [])] as Msg[]) if (!soloIds.has(m.case_id)) cand.set(m.id, m);
  const caseIds = [...new Set([...cand.values()].map((m) => m.case_id))];

  // رسائلك في تلك النقاشات — لمعرفة ما رددت عليه
  const { data: mine } = caseIds.length
    ? await admin.from("case_comments").select(cols).in("case_id", caseIds).eq("author_id", memberId)
        .is("deleted_at", null).gte("created_at", since).limit(2000)
    : { data: [] as Msg[] };
  const mineBy = new Map<string, Msg[]>();
  for (const r of (mine ?? []) as Msg[]) mineBy.set(r.case_id, [...(mineBy.get(r.case_id) ?? []), r]);

  // ما عولج من قبل لا يُرسل للذكاء ثانية
  const { data: existing } = await admin.from("pending_asks").select("id, case_id, thread_root, ask_at, status, comment_ids, anchor_comment_id")
    .eq("member_id", memberId);
  const seen = new Set((existing ?? []).flatMap((r) => r.comment_ids as string[]));

  // ٣) إقفال المفتوح الذي رددت عليه بعده
  let autoClosed = 0;
  for (const r of existing ?? []) {
    if (!["open", "snoozed"].includes(r.status)) continue;
    const dm = dmSet.has(r.case_id);
    const probe = { id: r.anchor_comment_id, created_at: r.ask_at, parent_id: r.thread_root };
    let mineHere = mineBy.get(r.case_id);
    if (!mineHere) {
      const { data } = await admin.from("case_comments").select(cols).eq("case_id", r.case_id).eq("author_id", memberId)
        .is("deleted_at", null).gt("created_at", r.ask_at).limit(50);
      mineHere = (data ?? []) as Msg[];
    }
    if (answered(probe, mineHere, dm)) {
      await admin.from("pending_asks").update({ status: "answered", updated_at: new Date().toISOString() }).eq("id", r.id);
      autoClosed++;
    }
  }

  // ٤) الجديد غير المجاب، مجمّعاً بالخيط
  const groups = new Map<string, Group>();
  for (const m of cand.values()) {
    if (seen.has(m.id)) continue;
    const dm = dmSet.has(m.case_id);
    if (answered(m, mineBy.get(m.case_id) ?? [], dm)) continue;
    const root = dm ? null : m.parent_id;
    const key = `${m.case_id}:${dm ? "dm" : root ?? "stream"}`;
    const g = groups.get(key) ?? { key, case_id: m.case_id, thread_root: root, dm, items: [] };
    g.items.push(m);
    groups.set(key, g);
  }
  if (!groups.size) return { member: memberId, new: 0, kept: 0, autoClosed };

  // ٥) السياق: آخر رسائل النطاق قبل آخر رسالة في الطلب، بالأسماء
  const { data: people } = await admin.from("team_members").select("id, name");
  const who = new Map((people ?? []).map((p) => [p.id, nameOf(p.name)]));
  const { data: caseRows } = await admin.from("cases").select("id, office_num, title, kind").in("id", [...new Set([...groups.values()].map((g) => g.case_id))]);
  const caseOf = new Map((caseRows ?? []).map((c) => [c.id, c]));

  const list = [...groups.values()];
  const payload: unknown[] = [];
  for (const g of list) {
    g.items.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const last = g.items[g.items.length - 1];
    let q = admin.from("case_comments").select("author_id, body, created_at, document_id, kind")
      .eq("case_id", g.case_id).is("deleted_at", null).lte("created_at", last.created_at).order("created_at", { ascending: false }).limit(10);
    if (!g.dm) q = g.thread_root ? q.or(`id.eq.${g.thread_root},parent_id.eq.${g.thread_root}`) : q.is("parent_id", null);
    const { data: ctx } = await q;
    const c = caseOf.get(g.case_id);
    payload.push({
      id: g.key,
      where: g.dm ? `محادثة مباشرة مع ${who.get(last.author_id) ?? "زميل"}` : `${c?.kind === "channel" ? "قناة" : "نقاش ملف"} ${c?.office_num ?? ""} «${String(c?.title ?? "").slice(0, 60)}»`,
      messages: (ctx ?? []).reverse().map((x) => ({
        from: x.author_id === memberId ? "أنت" : (who.get(x.author_id) ?? "زميل"),
        at: String(x.created_at).slice(0, 10),
        text: String(x.body ?? "").slice(0, 600) || (x.document_id ? "[أرسل ملفاً]" : "[بلا نص]"),
      })),
    });
  }

  // ٦) الذكاء: هل يحتاج رداً؟ وما المطلوب بسطر؟
  const verdicts = new Map<string, { needs_reply: boolean; ask: string; urgency: string }>();
  const mdl = await model();
  for (let i = 0; i < payload.length; i += 12) {
    const batch = payload.slice(i, i + 12);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: mdl, max_tokens: 4000,
        system: `أنت مساعد مدير مكتب محاماة سعودي. اليوم ${riyadhToday()}. أمامك محادثات من نقاشات المكتب، آخرها رسائل زملاء ذُكر فيها المدير («أنت») ولم يرد بعدها. ` +
          "لكل محادثة قرّر: هل ينتظر الزميل من المدير نفسه رداً أو قراراً أو اعتماداً أو معلومة أو إجراءً؟ (التذكير بطلب سابق = نعم، والشكر أو الإبلاغ للعلم أو التحية = لا. " +
          "وإن كان الطلب موجّهاً لزميل آخر وذُكر المدير للعلم أو نسخة = لا). " +
          "واكتب ask سطراً عربياً واحداً (١٢٠ حرفاً على الأكثر) يبدأ باسم الزميل ثم ما يريده بالضبط من سياق ما سبق — لا تكتب «يطلب الرد» عاماً؛ وإن كان المنشن فارغاً فاستنتج المطلوب مما قبله. " +
          "urgency=high فقط إن كان في الرسائل موعد أو مهلة لم تمضِ بعد بالنسبة لتاريخ اليوم وهو قريب (خلال ثلاثة أيام)، أو كُتب «عاجل» في رسالة من آخر ثلاثة أيام؛ وما مضى موعده = normal. أجب بأداة verdicts وحدها.",
        tools: [{
          name: "verdicts", description: "الحكم لكل محادثة",
          input_schema: {
            type: "object",
            properties: { items: { type: "array", items: { type: "object", properties: {
              id: { type: "string" }, needs_reply: { type: "boolean" }, ask: { type: "string" }, urgency: { type: "string", enum: ["high", "normal"] },
            }, required: ["id", "needs_reply", "ask", "urgency"] } } },
            required: ["items"],
          },
        }],
        tool_choice: { type: "tool", name: "verdicts" },
        messages: [{ role: "user", content: JSON.stringify(batch) }],
      }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(`مزوّد الذكاء: ${d?.error?.message ?? res.status}`);
    const items = (d.content ?? []).find((b: { type: string }) => b.type === "tool_use")?.input?.items ?? [];
    for (const it of items) verdicts.set(String(it.id), { needs_reply: !!it.needs_reply, ask: String(it.ask ?? "").slice(0, 200), urgency: it.urgency === "high" ? "high" : "normal" });
  }

  // ٧) الحفظ — وما لا يحتاج رداً يُحفظ «dismissed» كي لا يُعاد تحليله
  // وما لم يُرجع له الذكاء حكماً يُترك للدورة التالية
  let kept = 0;
  const rows = list.filter((g) => verdicts.has(g.key)).map((g) => {
    const v = verdicts.get(g.key)!;
    const last = g.items[g.items.length - 1];
    if (v.needs_reply) kept++;
    return {
      member_id: memberId, case_id: g.case_id, thread_root: g.thread_root,
      anchor_comment_id: last.id, comment_ids: g.items.map((m) => m.id), asker_id: last.author_id,
      // «عاجل» لما كُتب في آخر يومين فقط — موعد «اليوم» في رسالة قديمة قد مضى (لا يُترك للنموذج)
      ask: v.ask || null, needs_reply: v.needs_reply,
      urgency: v.urgency === "high" && Date.now() - new Date(last.created_at).getTime() < 2 * 86_400_000 ? "high" : "normal",
      status: v.needs_reply ? "open" : "dismissed", ask_at: last.created_at,
    };
  });
  if (rows.length) {
    const { error } = await admin.from("pending_asks").upsert(rows, { onConflict: "member_id,anchor_comment_id" });
    if (error) throw new Error(error.message);
  }
  return { member: memberId, new: rows.length, kept, autoClosed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const caller = await staffServiceOrInternal(req);
  if (!caller) return json({ error: "غير مصرّح" }, 401);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح الذكاء غير مُعدّ" }, 500);

  // للمدير وحده الآن: المجدول يعالج المدراء، والموظف يطلب لنفسه إن كان مديراً
  let targets: string[];
  if (caller.kind === "staff") {
    if (!caller.director) return json({ error: "متاح للمدير حالياً" }, 403);
    targets = [caller.memberId];
  } else {
    const { data } = await admin.from("team_members").select("id").eq("is_director", true).eq("is_active", true);
    targets = (data ?? []).map((r) => r.id);
  }
  try {
    const out = [];
    for (const t of targets) out.push(await runFor(t));
    return json({ ok: true, results: out });
  } catch (e) {
    console.error("pending-asks", e);
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500);
  }
});
