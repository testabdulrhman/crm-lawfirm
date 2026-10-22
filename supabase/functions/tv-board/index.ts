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
// ما يُرجَع عمداً: لا أسماء موكّلين ولا أرقام هواتف ولا تفاصيل (والمواعيد بلا موكّلها كذلك) — الشاشة على
// الحائط يراها كل زائر للمكتب. (2026-10-12: أُسقطت عناوين القضايا والمهام — كانت تحمل أسماء الموكّلين.)
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

/** «محمد الجندي» من الاسم الكامل: الأول والعائلة بلا لقب — short_name غير صالح للعرض (أسماء دخول لاتينية) */
function displayName(full: string | null | undefined): string {
  const name = String(full ?? "").trim();
  const w = name.replace(/^(المستشار|المحامي|المحامية|أ\.|د\.)\s*:?\s*/, "").split(/\s+/).filter(Boolean);
  const out = w.length > 1 ? `${w[0]} ${w[w.length - 1]}` : (w[0] ?? "");
  return /[ء-ي]/.test(out) ? out : name;
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
    // ⚠️ الشاشة يراها كل زائر: لا عناوين قضايا (تحمل أسماء الموكّلين «فلان ضد فلان») ولا عناوين مهام —
    //    رقم الملف والمحكمة للجلسات، وأعداد للمهام (تحديث 2026-10-12 مع تطبيق التلفزيون)
    // يوم العمل التالي (المحاكم لا تعمل الجمعة والسبت): بعد الخميس يأتي الأحد — طلب المدير 2026-10-13:
    // «جلسات بكرا… عشان مثل هذا الوقت وانا اشتغل اعرف وش عندي»
    let nextMs = Date.parse(today) + 86400000;
    while ([5, 6].includes(new Date(nextMs).getUTCDay())) nextMs += 86400000;
    const tomorrow = new Date(nextMs).toISOString().slice(0, 10);
    const mmdd = today.slice(5);
    // المواعيد (طلب المدير 2026-10-22): الوقت والطريقة ونوع الخدمة والموظف — بلا اسم الموكّل ولا جواله ولا شركته
    const apptSel = "appointment_time, duration_minutes, status, meeting_method, service_type, " +
      "assignee:team_members!appointments_assignee_id_fkey(name), " +
      "members:appointment_members(member:team_members!appointment_members_member_id_fkey(name))";
    const apptsOn = (day: string) => admin.from("appointments").select(apptSel)
      .eq("appointment_date", day).not("status", "in", "(cancelled,canceled)")
      .order("appointment_time", { ascending: true, nullsFirst: false });
    const [sessR, tomR, taskR, newsR, teamR, waR, apR, apNextR] = await Promise.all([
      admin.from("sessions")
        .select("id, session_time, court, case:cases(office_num, kind, court, court_division, assignee:team_members!cases_assignee_id_fkey(name))")
        .eq("session_date", today)
        .order("session_time", { ascending: true, nullsFirst: false }),
      admin.from("sessions")
        .select("id, session_time, court, case:cases(office_num, kind, court, court_division, assignee:team_members!cases_assignee_id_fkey(name))")
        .eq("session_date", tomorrow)
        .order("session_time", { ascending: true, nullsFirst: false }),
      admin.from("tasks")
        .select("due_date, is_urgent, status, assignee:team_members!tasks_assignee_id_fkey(short_name, name, is_reviewer)")
        .is("deleted_at", null).neq("status", "done").limit(500),
      admin.from("daily_news").select("title, why, category, day").gte("day", new Date(Date.parse(today) - 86400000).toISOString().slice(0, 10))
        .order("day", { ascending: false }).limit(1),
      admin.from("team_members").select("short_name, name, date_of_birth")
        .eq("is_active", true).not("date_of_birth", "is", null),
      admin.from("wa_threads").select("phone_e164", { count: "exact", head: true })
        .eq("last_direction", "in").gt("last_in_at", new Date(Date.now() - 7 * 86400000).toISOString()),
      apptsOn(today),
      apptsOn(tomorrow),
    ]);
    if (apR.error) throw apR.error;
    const SERVICE: Record<string, string> = {
      law: "أعمال المحاماة", bankruptcy: "أعمال إفلاس", notarization: "التوثيق والتسجيل العيني", other: "استشارة",
    };
    const shapeAppts = (rows: any[]) => rows.map((a: any) => ({
      time: a.appointment_time ? String(a.appointment_time).slice(0, 5) : null,
      duration: a.duration_minutes ?? null,
      method: a.meeting_method === "remote" ? "remote" : a.meeting_method === "onsite" ? "onsite" : null,
      service: a.service_type ? (SERVICE[a.service_type] ?? "") : "",
      status: a.status ?? "confirmed",
      // المسؤول المسند، وإلا أول عضو أُضيف للموعد
      lawyer: displayName(a.assignee?.name) || displayName(a.members?.[0]?.member?.name),
    }));
    if (sessR.error) throw sessR.error;
    if (tomR.error) throw tomR.error;
    const shape = (rows: any[]) => rows
      .filter((s) => !String(s.case?.office_num ?? "").startsWith("DEMO"))
      .map((s: any) => ({
        time: s.session_time ? String(s.session_time).slice(0, 5) : null,
        office_num: s.case?.office_num ?? null,
        kind: s.case?.kind ?? "case",
        court: s.court || s.case?.court || "",
        division: s.case?.court_division || "",
        // المسؤول عن الجلسة = مسؤول الملف (طلب المدير 2026-10-22) — اسم موظف لا موكّل
        lawyer: displayName(s.case?.assignee?.name),
        title: s.case?.office_num ? `ملف ${s.case.office_num}` : "جلسة",   // توافق الصفحة القديمة — بلا أسماء
      }));
    const nextList = shape((tomR.data ?? []) as any[]);
    if (taskR.error) throw taskR.error;

    // المهام: أعداد فقط — مفتوحة/متأخرة/عاجلة، وعدد كل موظف (الأكثر أولاً)
    // حساب مراجعة أبل وملفاته التجريبية لا تظهر على شاشة المكتب
    const tasks = ((taskR.data ?? []) as any[]).filter((t) => !t.assignee?.is_reviewer);
    const perMember = new Map<string, { open: number; late: number }>();
    let late = 0, urgent = 0, review = 0;
    for (const t of tasks) {
      const isLate = !!t.due_date && t.due_date < today;
      if (isLate) late++;
      if (t.is_urgent) urgent++;
      if (t.status === "review") review++;
      const who = displayName(t.assignee?.name) || "بلا مسؤول";
      const m = perMember.get(who) ?? { open: 0, late: 0 };
      m.open++; if (isLate) m.late++;
      perMember.set(who, m);
    }

    const news = (newsR.data ?? [])[0] as any;
    const byMember = [...perMember.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.late - a.late || b.open - a.open)
      .slice(0, 8);
    return json({
      ok: true,
      today,
      sessions: shape((sessR.data ?? []) as any[]),
      next_day: tomorrow,
      next_sessions: nextList,
      appointments: shapeAppts((apR.data ?? []) as any[]),
      next_appointments: shapeAppts((apNextR.data ?? []) as any[]),
      // توافق الصفحة القديمة (index.html على الـiMac): صف لكل موظف بعدد مهامه بدل عناوينها
      tasks: byMember.map((m) => ({
        title: `${m.name} — ${m.open} مفتوحة${m.late ? ` · ${m.late} متأخرة` : ""}`,
        due: null, urgent: m.late > 0, review: false,
      })),
      tomorrow_sessions: nextList.length,
      tasks_summary: {
        open: tasks.length, late, urgent, review,
        by_member: byMember,
      },
      news: news ? { title: news.title, why: news.why, category: news.category } : null,
      // اليوم والشهر فقط — لا سنة ولا عمر (قاعدة أعياد الميلاد)
      birthdays: ((teamR.data ?? []) as any[])
        .filter((m) => String(m.date_of_birth).slice(5, 10) === mmdd)
        .map((m) => m.short_name || m.name),
      wa_waiting: waR.count ?? 0,
      generated_at: new Date().toISOString(),
    });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
