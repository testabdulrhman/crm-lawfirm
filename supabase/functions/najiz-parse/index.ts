// najiz-parse — يقرأ رسالة ناجز الواردة ويحوّلها إلى واقعة في الملف تلقائياً:
// جلسة جديدة · تأجيل جلسة · حكم صادر.
// (طلب المستخدم 2026-09-03: «أي رسالة تجي يعالجها ويسجلها كجلسة» ثم «والأحكام والتأجيل؟»)
//
// الحكم أثمن ما هنا: إدراج صفّه يشغّل derive_ruling_tasks في القاعدة فتُحسب
// مهلة الاعتراض (٣٠ يوماً قابلة للضبط) وتُنشأ مهمة «دراسة الحكم وإعداد
// الاعتراض» بسلّم تنبيه ١٤/٧/٣/١. أي أن رسالة تصل ليلاً تفتح المهلة بنفسها.
//
// لماذا بالذكاء لا بتعبير نمطي: صيغ ناجز تتبدّل («تفعيل الجلسة المرئية»،
// «تحديد موعد جلسة»، «تأجيل الجلسة»…) وهي الدرس نفسه الذي عُلّم في
// sms-inbox حين كان الاختصار يفلتر باسم المرسِل. النموذج يقرأ المعنى.
//
// ⚠️ التاريخ: ناجز يكتب هجرياً (26/04/1448). التحويل هنا **أم القرى الفعلي**
//    عبر Intl لا بالصيغة الحسابية التقريبية — تلك تنحرف يومين على هذا
//    التاريخ بالذات (تعطي 2026-10-09 والصحيح 2026-10-07)، ويومان في موعد
//    جلسة يعنيان جلسة فائتة.
//
// الحواجز قبل أي إنشاء: القضية مطابَقة بيقين (case_id من ترقر الربط)،
// والتاريخ محلول، والثقة ليست منخفضة، ولا جلسة سابقة بالتاريخ نفسه.
// ما لا يتحقق فيه ذلك يُبلَّغ به المدير بدل أن يُخترع صفٌّ خاطئ.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-5";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });

/* ============ تحويل هجري → ميلادي بتقويم أم القرى ============ */

const UMM_AL_QURA = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC",
});

/** تقدير حسابي ثم مطابقة دقيقة ضمن ±5 أيام — التقدير وحده ينحرف يوماً أو يومين */
function hijriToGregorian(hy: number, hm: number, hd: number): string | null {
  const jd = Math.floor((11 * hy + 3) / 30) + 354 * hy + 30 * hm -
    Math.floor((hm - 1) / 2) + hd + 1948440 - 385;
  const approx = new Date((jd - 2440588) * 86400000);
  for (let off = -5; off <= 5; off++) {
    const d = new Date(approx.getTime() + off * 86400000);
    const p: Record<string, string> = {};
    for (const part of UMM_AL_QURA.formatToParts(d)) p[part.type] = part.value;
    if (+p.year === hy && +p.month === hm && +p.day === hd) {
      return d.toISOString().slice(0, 10);
    }
  }
  return null;
}

/** يحل التاريخ النهائي: الميلادي كما هو، والهجري يُحوَّل */
function resolveDate(greg: string | null, hijri: string | null): string | null {
  if (greg && /^\d{4}-\d{2}-\d{2}$/.test(greg) && +greg.slice(0, 4) >= 2000) return greg;
  if (hijri) {
    const m = hijri.match(/^(\d{1,2})\/(\d{1,2})\/(\d{3,4})$/);
    if (m) {
      const [, d, mo, y] = m;
      // سنة ≥ 1500 = ميلادية كُتبت في خانة الهجري
      if (+y >= 1500) return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      return hijriToGregorian(+y, +mo, +d);
    }
  }
  return null;
}

/* ============ الاستخراج بالذكاء ============ */

const TOOL = {
  name: "extract_najiz",
  description: "استخراج بيانات إشعار ناجز/المحكمة",
  input_schema: {
    type: "object",
    properties: {
      kind: {
        type: "string",
        enum: ["session", "session_postponed", "session_cancelled", "ruling", "appointment", "other"],
        description:
          "session = إشعار بجلسة محددة (تفعيل جلسة مرئية، تحديد موعد جلسة، موعد نظر الدعوى). " +
          "session_postponed = تأجيل جلسة إلى موعد آخر. session_cancelled = إلغاء/شطب جلسة. " +
          "ruling = صدور حكم أو صك. appointment = موعد كتابة عدل لا جلسة محكمة.",
      },
      case_number: { type: ["string", "null"], description: "رقم القضية/الدعوى كما ورد" },
      date_hijri: { type: ["string", "null"], description: "التاريخ **الفعّال** كما ورد إن كان هجرياً DD/MM/YYYY: موعد الجلسة، أو الموعد الجديد بعد التأجيل، أو تاريخ نطق الحكم" },
      date_gregorian: { type: ["string", "null"], description: "التاريخ الفعّال ميلادياً YYYY-MM-DD إن ورد ميلادياً صراحةً" },
      time_24h: { type: ["string", "null"], description: "الوقت بنظام 24 ساعة HH:MM (9:30 صباحاً = 09:30)" },
      previous_date_hijri: { type: ["string", "null"], description: "للتأجيل فقط: التاريخ القديم الذي أُجّلت منه الجلسة، هجرياً DD/MM/YYYY" },
      previous_date_gregorian: { type: ["string", "null"], description: "للتأجيل فقط: التاريخ القديم ميلادياً YYYY-MM-DD" },
      ruling_number: { type: ["string", "null"], description: "رقم الحكم أو الصك إن ذُكر" },
      title: { type: "string", description: "عنوان عربي قصير للحدث، مثل: جلسة مرئية / حكم ابتدائي" },
      court: { type: ["string", "null"], description: "اسم المحكمة أو الدائرة إن ذُكر" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
    },
    required: ["kind", "case_number", "date_hijri", "date_gregorian", "time_24h", "previous_date_hijri", "previous_date_gregorian", "ruling_number", "title", "court", "confidence"],
  },
};

async function extract(message: string): Promise<any | null> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      tool_choice: { type: "tool", name: "extract_najiz" },
      tools: [TOOL],
      system:
        "أنت مساعد مكتب محاماة سعودي يقرأ رسائل ناجز ووزارة العدل. " +
        "تستخرج الحقائق كما وردت حرفياً ولا تخمّن ما لم يُذكر — الحقل غير الوارد يكون null. " +
        "التاريخ في رسائل ناجز هجري غالباً (سنة نحو 1447/1448)؛ ضعه في date_hijri كما ورد ولا تحوّله بنفسك.",
      messages: [{ role: "user", content: `اقرأ هذا الإشعار واستخرج بياناته:\n\n${message}` }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${JSON.stringify(data?.error ?? {}).slice(0, 200)}`);
  return (data.content ?? []).find((b: any) => b.type === "tool_use")?.input ?? null;
}

/* ============ الإشعار ============ */

async function notifyTeam(caseId: string | null, title: string, message: string) {
  const ids = new Set<string>();
  if (caseId) {
    const { data: c } = await admin.from("cases").select("assignee_id").eq("id", caseId).maybeSingle();
    if (c?.assignee_id) ids.add(c.assignee_id as string);
  }
  const { data: dirs } = await admin
    .from("team_members").select("id").eq("is_director", true).not("is_active", "is", false);
  for (const d of dirs ?? []) ids.add(d.id as string);
  if (!ids.size) return;
  await admin.from("notifications").insert(
    [...ids].map((id) => ({ type: "session_auto", title, message, recipient_id: id, case_id: caseId }))
  );
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY غير مضبوط" }, 500);

  // بوابة السر الداخلي — نفس سر ذكاء النقاش وتصنيف المستندات
  const { data: secretRow } = await admin
    .from("lookup_values").select("value")
    .eq("type", "discussion_ai_config").eq("label", "inbound_secret")
    .limit(1).maybeSingle();
  if (!secretRow?.value || req.headers.get("x-ai-secret") !== secretRow.value) {
    return json({ error: "forbidden" }, 403);
  }

  const { sms_id } = await req.json().catch(() => ({}));
  if (!sms_id) return json({ skipped: "sms_id مفقود" });

  const { data: sms } = await admin
    .from("sms_log")
    .select("id, message, case_id, category, status, created_at")
    .eq("id", sms_id).maybeSingle();
  if (!sms) return json({ skipped: "رسالة غير موجودة" });
  if (sms.status !== "incoming") return json({ skipped: "ليست واردة" });

  let r: any;
  try {
    r = await extract(String(sms.message ?? ""));
  } catch (e) {
    return json({ error: String(e).slice(0, 300) }, 502);
  }
  if (!r) return json({ skipped: "بلا نتيجة" });

  const date = resolveDate(r.date_gregorian ?? null, r.date_hijri ?? null);
  const prevDate = resolveDate(r.previous_date_gregorian ?? null, r.previous_date_hijri ?? null);
  const time = /^\d{1,2}:\d{2}$/.test(r.time_24h ?? "") ? String(r.time_24h).padStart(5, "0") : null;
  const kind: string = r.kind;
  const acts = kind === "session" || kind === "session_postponed" || kind === "ruling";

  // ما لا نتصرّف فيه: موعد كتابة عدل (له مساره في sms-inbox)، وإلغاء الجلسة
  // (دلالته تختلف بين شطب وتأجيل غير مسمّى — يقرّرها بشر)، وغير ذلك.
  if (!acts) {
    if (kind === "session_cancelled" && sms.case_id) {
      await notifyTeam(sms.case_id as string, "⚠️ إشعار إلغاء جلسة من ناجز",
        "وصلنا إشعار بإلغاء/شطب جلسة — راجع الملف في ناجز وحدّث الجلسة يدوياً.");
      return json({ ok: true, kind, action: "notified" });
    }
    return json({ ok: true, kind, action: "none" });
  }

  // حاجز أول: لا قضية مطابَقة بيقين، أو تاريخ غير محلول، أو ثقة منخفضة →
  // نُبلّغ ولا نُنشئ. صفٌّ خاطئ في الملف أسوأ من رسالة تنتظر بشراً.
  if (!sms.case_id || !date || r.confidence === "low") {
    const why = !sms.case_id
      ? `لم يُطابَق رقم القضية (${r.case_number ?? "غير مذكور"}) بملف واحد بعينه`
      : !date
        ? `تعذّر فهم التاريخ (${r.date_hijri ?? r.date_gregorian ?? "غير مذكور"})`
        : "ثقة الاستخراج منخفضة";
    const what = kind === "ruling" ? "حكم" : kind === "session_postponed" ? "تأجيل جلسة" : "جلسة";
    await notifyTeam(sms.case_id as string | null,
      `📩 إشعار ${what} من ناجز يحتاج تسجيلاً يدوياً`,
      `${why} — افتح «الرسائل» وسجّله بنفسك.`);
    return json({ ok: true, kind, action: "notified", reason: why });
  }

  const { data: kase } = await admin
    .from("cases").select("court, hearing_date, title").eq("id", sms.case_id).maybeSingle();
  const src = `أُنشئ تلقائياً من رسالة ناجز الواردة في ${String(sms.created_at ?? "").slice(0, 10)}.`;
  const asWritten = `${r.date_hijri ?? r.date_gregorian ?? "—"}${r.date_hijri ? " هـ" : ""}`;

  /* ============ حكم ============ */
  if (kind === "ruling") {
    // منع التكرار: رقم الحكم أولاً (الأوثق)، وإلا تاريخ النطق نفسه
    let q = admin.from("rulings").select("id").eq("case_id", sms.case_id);
    q = r.ruling_number ? q.eq("ruling_number", String(r.ruling_number)) : q.eq("ruling_date", date);
    const { data: dupR } = await q.limit(1).maybeSingle();
    if (dupR) return json({ ok: true, kind, action: "duplicate", ruling_id: dupR.id });

    const { data: created, error: insErr } = await admin.from("rulings").insert({
      case_id: sms.case_id,
      title: String(r.title || "حكم").slice(0, 120),
      ruling_number: r.ruling_number ? String(r.ruling_number).slice(0, 60) : null,
      ruling_date: date,
      court_name: r.court || kase?.court || null,
      // النتيجة والملخّص لا يردان في رسالة ناجز — يُستكملان من الصك
      summary: `${src}\nتاريخ النطق في الرسالة: ${asWritten} (يوافق ${date}).\n` +
        `النتيجة والمنطوق يُستكملان من الصك — هذه الرسالة تُثبت الواقعة وتفتح مهلة الاعتراض فقط.`,
      uploaded_by_name: "أتمتة رسائل ناجز",
    }).select("id").single();
    if (insErr) return json({ error: `تعذّر تسجيل الحكم: ${insErr.message}` }, 500);

    await notifyTeam(sms.case_id as string,
      `⚖️ حكم سُجّل تلقائياً — ${date}`,
      `${kase?.title ?? "الملف"}: ${r.title}${r.ruling_number ? ` رقم ${r.ruling_number}` : ""}. ` +
        `بدأت مهلة الاعتراض واحتُسبت مهمتها — نزّل الصك وأكمل المنطوق.`);
    return json({ ok: true, kind, action: "created", ruling_id: created?.id, date });
  }

  /* ============ جلسة جديدة أو تأجيل ============ */

  // الجلسة المؤجَّلة: بتاريخها القديم إن ذُكر، وإلا أقرب جلسة غير مغلقة
  let postponed: { id: string; session_date: string | null; title: string | null } | null = null;
  if (kind === "session_postponed") {
    let pq = admin.from("sessions").select("id, session_date, title").eq("case_id", sms.case_id).is("closed_at", null);
    pq = prevDate ? pq.eq("session_date", prevDate) : pq.lt("session_date", date).order("session_date", { ascending: false });
    const { data: found } = await pq.limit(1).maybeSingle();
    postponed = (found as any) ?? null;
  }

  // حاجز ثانٍ: جلسة بالتاريخ نفسه مسجّلة سلفاً (الرسالة قد تُعاد، أو سجّلها زميل)
  const { data: dup } = await admin
    .from("sessions").select("id").eq("case_id", sms.case_id).eq("session_date", date).limit(1).maybeSingle();
  if (dup) return json({ ok: true, kind, action: "duplicate", session_id: dup.id });

  const { data: last } = await admin
    .from("sessions").select("session_number").eq("case_id", sms.case_id)
    .not("session_number", "is", null)
    .order("session_number", { ascending: false }).limit(1).maybeSingle();

  // «تأجيل جلسة» وصفُ الحدث لا عنوانُ الجلسة — ترث الجديدة عنوان المؤجَّلة
  const sessionTitle = postponed?.title?.trim()
    ? postponed.title.trim()
    : String(r.title || "جلسة").replace(/^تأجيل\s*/, "").trim() || "جلسة";

  const { data: created, error: insErr } = await admin.from("sessions").insert({
    case_id: sms.case_id,
    title: sessionTitle.slice(0, 120),
    session_date: date,
    session_time: time,
    court: r.court || kase?.court || null,
    status: "قادمة",
    session_number: (last?.session_number ?? 0) + 1,
    preparation: `${src}\nالتاريخ في الرسالة: ${asWritten} (يوافق ${date}).` +
      (postponed ? `\nأُجّلت عن جلسة ${postponed.session_date ?? "سابقة"}.` : "") +
      `\nتحقّق من الموعد في ناجز قبل الاعتماد عليه.`,
  }).select("id").single();
  if (insErr) return json({ error: `تعذّر إنشاء الجلسة: ${insErr.message}` }, 500);

  // وسم الجلسة القديمة مؤجّلة وربطها بالجديدة — فيبقى الخيط ظاهراً في الملف
  if (postponed?.id) {
    await admin.from("sessions")
      .update({ status: "مؤجّلة", next_session_id: created?.id })
      .eq("id", postponed.id);
  }

  // موعد الجلسة القادمة على بطاقة الملف — يُحدَّث إن كانت هذه أقرب
  if (date >= new Date().toISOString().slice(0, 10) &&
      (!kase?.hearing_date || date < String(kase.hearing_date))) {
    await admin.from("cases")
      .update({ hearing_date: date, hearing_label: sessionTitle.slice(0, 60) })
      .eq("id", sms.case_id);
  }

  await notifyTeam(sms.case_id as string,
    postponed ? `📅 جلسة أُجّلت تلقائياً إلى ${date}` : `📅 جلسة جديدة سُجّلت تلقائياً — ${date}`,
    `${kase?.title ?? "الملف"}: ${sessionTitle}${time ? ` الساعة ${time}` : ""}. ` +
      `مصدرها رسالة ناجز؛ راجعها في تبويب الجلسات.`);

  return json({
    ok: true, kind,
    action: postponed ? "postponed" : "created",
    session_id: created?.id, previous_session_id: postponed?.id ?? null, date, time,
  });
});
