// لوحة شاشة العرض في المكتب (تلفزيون سامسونج/Tizen) — قراءة فقط.
//
// ⚠️ لماذا دالة بدل قراءة الجداول بمفتاح anon مباشرةً:
//    مفتاح anon **منشور في كود الموقع**، وسياسات sessions/tasks/cases لدور
//    authenticated فقط. فتحها لـanon كان سيعني أن أي شخص على الإنترنت يقرأ
//    عناوين القضايا والمحاكم والمهام كاملةً. هذه الدالة تُرجع الحد الأدنى
//    اللازم للعرض على الحائط فقط، خلف سر مستقل.
//
// الحماية: verify_jwt (مفتاح anon) + سر x-board-secret من lookup_values
//          (type='tv_board_config'). التلفزيون داخل شبكة المكتب.
//
// ما يُرجَع عمداً: لا أسماء موكّلين ولا أرقام هواتف ولا تفاصيل — الشاشة على
// الحائط يراها كل زائر للمكتب.
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-board-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** تاريخ اليوم بتوقيت الرياض (لا UTC — وإلا تغيّر اليوم بعد التاسعة مساءً) */
function riyadhToday(): string {
  return new Date(Date.now() + 3 * 3600 * 1000).toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // السر: من الترويسة أو من متغيّر الرابط (متصفح التلفزيون لا يسهل فيه ضبط الترويسات)
  const url = new URL(req.url);
  const secret =
    req.headers.get("x-board-secret") ?? url.searchParams.get("k") ?? "";

  const { data: cfg } = await admin
    .from("lookup_values")
    .select("value")
    .eq("type", "tv_board_config")
    .limit(1)
    .maybeSingle();

  if (!cfg?.value || secret !== cfg.value) {
    return json({ error: "سر غير صحيح" }, 401);
  }

  const today = riyadhToday();

  try {
    // جلسات اليوم — مرتّبة بالوقت، مع عنوان القضية ومحكمتها
    const { data: sessions, error: sErr } = await admin
      .from("sessions")
      .select("id, title, session_time, court, case:cases(title, court, court_division)")
      .eq("session_date", today)
      .order("session_time", { ascending: true, nullsFirst: false });
    if (sErr) throw sErr;

    // المهام غير المنجزة — الأقرب استحقاقاً أولاً، بحد أقصى ١٠
    const { data: tasks, error: tErr } = await admin
      .from("tasks")
      .select("id, title, due_date, is_urgent, status")
      .is("deleted_at", null)
      .neq("status", "done")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(10);
    if (tErr) throw tErr;

    return json({
      ok: true,
      today,
      sessions: (sessions ?? []).map((s: any) => ({
        time: s.session_time ? String(s.session_time).slice(0, 5) : null,
        title: s.title || s.case?.title || "جلسة",
        court: s.court || s.case?.court || "",
        division: s.case?.court_division || "",
      })),
      tasks: (tasks ?? []).map((t: any) => ({
        title: t.title || "مهمة",
        due: t.due_date,
        urgent: !!t.is_urgent,
        review: t.status === "review",
      })),
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
