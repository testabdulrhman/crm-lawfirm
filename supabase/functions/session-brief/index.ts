// ملخص ما قبل الجلسة (طلب المستخدم 2026-09-02 ضمن «دراسة القضية الحيّة»):
// صفحة واحدة يقرؤها المحامي قبل الجلسة — لماذا هذه الجلسة، بماذا نجادل،
// ماذا نُحضر، ماذا قال الخصم آخر مرة، المخاطر والمهل، الأسئلة المفتوحة.
// مشتق من دراسة القضية + كل ما حدث بعدها، ويُبلَّغ المكلَّف إشعاراً (دفع تلقائي).
//
// النداء: {session_id} يدوياً من الواجهة، أو {mode:"upcoming"} من cron الصباح
// (جلسات الغد وبعده بلا ملخص). لا يُعاد التوليد إن وُجد ملخص إلا بـ force.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5"; // يومي — الكلفة تهم، والمدخل مهيّأ سلفاً بالدراسة
const FIRM = "شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس";

const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `أنت محامٍ أول في ${FIRM}. تكتب لزميلك «ملخص ما قبل الجلسة»: صفحة واحدة يقرؤها في خمس دقائق قبل دخول القاعة.
قواعد: عربية مهنية مباشرة، نص عادي بلا Markdown، عناوين الأقسام كما هي، نقاط بشرطة «- »، لا تختلق وقائع — ما لم يرد في المادة قل «غير محدد في الملف». لا تزد على ٤٠٠ كلمة.
الأقسام بالترتيب:
الغرض من الجلسة
موقفنا وما نجادل به (٣ إلى ٥ نقاط، الأقوى أولاً)
ما نُحضره معنا (مستندات/شهود/طلبات)
ما قاله الخصم آخر مرة وكيف نرد
مخاطر ومهل (مع التواريخ)
أسئلة مفتوحة تُحسم قبل الدخول`;

async function buildBrief(sessionId: string, by: string | null, force = false): Promise<{ ok: boolean; skipped?: string }> {
  const { data: s } = await admin.from("sessions")
    .select("id, case_id, title, session_number, session_date, session_time, court, status, closed_at")
    .eq("id", sessionId).maybeSingle();
  if (!s || !s.case_id) return { ok: false, skipped: "no session" };
  if (!force) {
    const { data: ex } = await admin.from("session_briefs").select("id").eq("session_id", sessionId).maybeSingle();
    if (ex) return { ok: true, skipped: "exists" };
  }

  const [c, study, prevSessions, memos, tasks, docs] = await Promise.all([
    admin.from("cases").select("id, title, subject, type, court, assignee_id, contact:contacts(name)").eq("id", s.case_id).single(),
    admin.from("case_studies").select("facts, requests, plaintiff_grounds, defendant_defenses, legal_opinion, suitability, statutes, what_changed, generated_at").eq("case_id", s.case_id).maybeSingle(),
    admin.from("sessions").select("session_number, session_date, title, outcome, next_action").eq("case_id", s.case_id)
      .lt("session_date", s.session_date).order("session_date", { ascending: false }).limit(3),
    admin.from("memos").select("title, party_side, memo_type, is_submitted, submit_date, description").eq("case_id", s.case_id).order("created_at", { ascending: false }).limit(6),
    admin.from("tasks").select("title, due_date, status, priority").eq("case_id", s.case_id).is("deleted_at", null).neq("status", "done").limit(12),
    admin.from("documents").select("name, description, created_at").eq("case_id", s.case_id).is("deleted_at", null).order("created_at", { ascending: false }).limit(8),
  ]);
  const cs: any = c.data;
  const st: any = study.data;
  const sinceQ = st?.generated_at
    ? admin.from("matter_events").select("kind, sentence, created_at").eq("matter_id", s.case_id).gt("created_at", st.generated_at).order("created_at").limit(30)
    : Promise.resolve({ data: [] as any[] });
  const { data: since } = await sinceQ;

  const user = `الجلسة القادمة: رقم ${s.session_number ?? "؟"} — ${s.title ?? ""} — ${s.session_date} ${s.session_time ?? ""} — ${s.court ?? cs?.court ?? ""}
القضية: ${cs?.title ?? ""} (${cs?.type ?? ""}) — الموكّل: ${cs?.contact?.name ?? "غير محدد"}
الموضوع: ${(cs?.subject ?? "").slice(0, 800)}

${st ? `من دراسة القضية (${String(st.generated_at ?? "").slice(0,10)}):
الوقائع: ${(st.facts ?? "").slice(0, 1200)}
الطلبات: ${(st.requests ?? "").slice(0, 500)}
أسانيد المدعي: ${(st.plaintiff_grounds ?? "").slice(0, 900)}
دفوع المدعى عليه: ${(st.defendant_defenses ?? "").slice(0, 900)}
الرأي القانوني: ${(st.legal_opinion ?? "").slice(0, 1200)}
الأسانيد النظامية: ${(st.statutes ?? "").slice(0, 700)}
آخر ما تغيّر: ${(st.what_changed ?? "").slice(0, 500)}` : "لا دراسة للقضية بعد — اعتمد على بيانات الملف وحدها ونبّه أن الدراسة ناقصة."}

ما حدث في الملف بعد الدراسة:
${JSON.stringify((since ?? []).map((e: any) => ({ التاريخ: String(e.created_at).slice(0,10), الحدث: e.sentence })), null, 1)}

الجلسات السابقة (الأحدث أولاً، بنتيجتها وما تقرر بعدها):
${JSON.stringify(prevSessions.data ?? [], null, 1)}

المذكرات المتبادلة:
${JSON.stringify((memos.data ?? []).map((m: any) => ({ العنوان: m.title, الطرف: m.party_side, النوع: m.memo_type, قُدّمت: m.is_submitted, التاريخ: m.submit_date, ملخص: (m.description ?? "").slice(0, 300) })), null, 1)}

المهام المفتوحة على الملف:
${JSON.stringify(tasks.data ?? [], null, 1)}

آخر المستندات:
${JSON.stringify((docs.data ?? []).map((d: any) => d.name), null, 1)}

اكتب الملخص وسلّمه عبر أداة save_brief.`;

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2500, system: SYSTEM,
      tools: [{ name: "save_brief", description: "ملخص ما قبل الجلسة", input_schema: { type: "object", properties: { brief: { type: "string" } }, required: ["brief"] } }],
      tool_choice: { type: "tool", name: "save_brief" },
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `AI ${res.status}`);
  const brief = String((data.content ?? []).find((b: any) => b.type === "tool_use")?.input?.brief ?? "").trim();
  if (!brief) throw new Error("ملخص فارغ");

  await admin.from("session_briefs").upsert({
    session_id: sessionId, case_id: s.case_id, brief,
    generated_at: new Date().toISOString(), generated_by: by ?? MODEL,
  }, { onConflict: "session_id" });

  // إشعار المكلَّف — الإدراج = دفع تلقائي، والنقرة تفتح القضية
  if (cs?.assignee_id) {
    await admin.from("notifications").insert({
      type: "session_brief",
      title: `📋 ملخص ما قبل الجلسة — ${s.session_date}`,
      message: `${cs.title ?? "قضية"}: جاهز في تبويب الجلسات — خمس دقائق قراءة قبل القاعة.`,
      recipient_id: cs.assignee_id, case_id: s.case_id,
    });
    await admin.from("session_briefs").update({ notified_at: new Date().toISOString() }).eq("session_id", sessionId);
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "مفتاح الذكاء غير مضبوط" }, 500);
  try {
    const body = await req.json().catch(() => ({}));

    // cron الصباح: جلسات الغد وبعد الغد بلا ملخص
    if (body?.mode === "upcoming") {
      const today = new Date(); const d1 = new Date(today.getTime() + 86_400_000); const d2 = new Date(today.getTime() + 2 * 86_400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const { data: sessions } = await admin.from("sessions").select("id")
        .gte("session_date", iso(d1)).lte("session_date", iso(d2)).is("closed_at", null).not("case_id", "is", null).limit(20);
      const work = (async () => {
        for (const s of sessions ?? []) await buildBrief(s.id, "صباحي").catch((e) => console.error("brief", s.id, e?.message || e));
      })();
      const er: any = (globalThis as any).EdgeRuntime; if (er?.waitUntil) er.waitUntil(work);
      return json({ ok: true, queued: (sessions ?? []).length }, 202);
    }

    const sessionId = String(body?.session_id ?? "");
    if (!sessionId) return json({ error: "session_id مطلوب" }, 400);
    const r = await buildBrief(sessionId, body?.user_name ? String(body.user_name) : null, !!body?.force);
    return json(r, r.ok ? 200 : 404);
  } catch (e) {
    return json({ error: "تعذّر إعداد الملخص", detail: String((e as Error)?.message || e) }, 500);
  }
});
