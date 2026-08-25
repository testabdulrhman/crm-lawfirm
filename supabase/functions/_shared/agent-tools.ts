// أدوات الذكاء المشتركة بين المساعد العائم (ai-assistant) وذكاء النقاش (discussion-ai).
//
// قرار المستخدم 2026-08-25: «ابيه يكون أفضل من كذا بواجد» — توسعة الصلاحيات إلى
// **إضافة وتعديل** (بلا حذف إطلاقاً)، مع **استئذان قبل الإجراءات الحساسة**
// (رسالة لموكّل، تغيير حالة ملف). والأداتان تتشاركان نفس القدرات.
//
// آلية الاستئذان ليست وعظاً في التوجيه فقط: كل أداة حساسة تشترط `confirmed: true`
// وترفض بدونه — فحتى لو أخطأ النموذج لا يقع الفعل بلا موافقة صريحة.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoPlusDays = (d: number) =>
  new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

/** رفض موحّد للأداة الحساسة بلا تأكيد — النص يوجّه النموذج لطلب الإذن */
const needsConfirm = (what: string) =>
  JSON.stringify({
    blocked: true,
    reason: `هذا إجراء حسّاس (${what}). اعرضه على الموظف واطلب تأكيده صراحةً، ثم أعد الاستدعاء بـ confirmed=true.`,
  });

/* ===================== تعريفات الأدوات ===================== */

export const EXTRA_TOOLS = [
  /* ---------- قراءة ---------- */
  {
    name: "get_case_details",
    description:
      "تفاصيل ملف كاملة برقم المكتب: البيانات، الجلسات، المهام المفتوحة، المستندات، الأحكام، الأطراف. استخدمها قبل أي إجابة تفصيلية عن ملف بعينه.",
    input_schema: {
      type: "object",
      properties: { office_num: { type: "string", description: "رقم المكتب مثل CASE26010" } },
      required: ["office_num"],
    },
  },
  {
    name: "search_documents",
    description: "البحث في المستندات بالاسم أو الوصف، اختيارياً داخل ملف محدد.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        case_office_num: { type: "string", description: "حصر البحث في ملف (اختياري)" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_appointments",
    description: "المواعيد في مدى زمني (الافتراضي: من اليوم إلى بعد 7 أيام).",
    input_schema: {
      type: "object",
      properties: {
        from_date: { type: "string", description: "YYYY-MM-DD" },
        to_date: { type: "string", description: "YYYY-MM-DD" },
      },
    },
  },
  {
    name: "search_messages",
    description:
      "البحث في سجل الرسائل (الواردة من ناجز والجهات، والصادرة من النظام) بالنص أو باسم/رقم المرسل.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        direction: { type: "string", enum: ["incoming", "outgoing", "any"] },
      },
      required: ["query"],
    },
  },
  {
    name: "office_overview",
    description:
      "لمحة سريعة عن المكتب: عدد الملفات الجارية، المهام المفتوحة والمتأخرة، جلسات اليوم والأسبوع، الوكالات المنتهية قريباً.",
    input_schema: { type: "object", properties: {} },
  },

  /* ---------- إضافة ---------- */
  {
    name: "create_contact",
    description:
      "إضافة جهة اتصال جديدة (موكّل/خصم/جهة). تحقّق أولاً بـ search_contacts أنها غير موجودة.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        phone: { type: "string", description: "جوال (اختياري)" },
        category: { type: "string", description: "التصنيف مثل: موكل، خصم، جهة حكومية (اختياري)" },
        entity_type: { type: "string", enum: ["individual", "company"], description: "فرد أم منشأة" },
        id_number: { type: "string", description: "رقم الهوية/السجل (اختياري)" },
        city: { type: "string" },
        notes: { type: "string" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_matter",
    description:
      "فتح مشروع جديد: قضية (case) أو استشارة/لائحة (legal_service) أو توثيق عقاري (property). رقم المكتب يُولَّد تلقائياً إن لم يُذكر.",
    input_schema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["case", "legal_service", "property"] },
        title: { type: "string" },
        client_name: { type: "string", description: "اسم الموكّل — يُربط بجهة اتصال موجودة إن وُجدت" },
        type: { type: "string", description: "نوع القضية مثل: تجاري، عمالي، جزائي (اختياري)" },
        court: { type: "string" },
        court_num: { type: "string", description: "رقم الدعوى في المحكمة (اختياري)" },
        assignee_name: { type: "string", description: "المسؤول (اختياري)" },
      },
      required: ["kind", "title"],
    },
  },
  {
    name: "create_appointment",
    description: "حجز موعد لموكّل.",
    input_schema: {
      type: "object",
      properties: {
        client_name: { type: "string" },
        client_phone: { type: "string" },
        appointment_date: { type: "string", description: "YYYY-MM-DD" },
        appointment_time: { type: "string", description: "HH:MM بنظام 24 ساعة" },
        service_type: { type: "string", description: "نوع الخدمة (اختياري)" },
        meeting_method: { type: "string", enum: ["in_person", "online", "phone"] },
        notes: { type: "string" },
      },
      required: ["client_name", "appointment_date", "appointment_time"],
    },
  },
  {
    name: "post_discussion_message",
    description:
      "كتابة رسالة في نقاش ملف (أو القناة العامة إن لم يُذكر ملف). تُنسب للذكاء بوضوح. مفيدة لتوثيق خلاصة أو تنبيه الفريق.",
    input_schema: {
      type: "object",
      properties: {
        body: { type: "string" },
        case_office_num: { type: "string", description: "رقم مكتب الملف — اتركه فارغاً للقناة العامة" },
      },
      required: ["body"],
    },
  },
  {
    name: "create_outgoing_letter",
    description:
      "تسجيل خطاب صادر (مسودة داخلية): الموضوع والمرسل إليه وربطه بملف. الرقم يُولَّد تلقائياً.",
    input_schema: {
      type: "object",
      properties: {
        subject: { type: "string" },
        recipient: { type: "string" },
        case_office_num: { type: "string" },
        notes: { type: "string", description: "نص الخطاب أو ملاحظات" },
      },
      required: ["subject"],
    },
  },

  /* ---------- تعديل ---------- */
  {
    name: "update_task",
    description:
      "تعديل مهمة: إنجازها، أو تأجيلها بتاريخ جديد، أو تغيير مسؤولها أو أولويتها. مرّر معرّف المهمة من list_tasks.",
    input_schema: {
      type: "object",
      properties: {
        task_id: { type: "string" },
        action: { type: "string", enum: ["complete", "reopen", "postpone", "reassign", "priority"] },
        due_date: { type: "string", description: "للتأجيل: YYYY-MM-DD" },
        assignee_name: { type: "string", description: "لإعادة الإسناد" },
        priority: { type: "string", enum: ["low", "med", "high"] },
      },
      required: ["task_id", "action"],
    },
  },
  {
    name: "update_contact",
    description: "تحديث بيانات جهة اتصال (جوال، بريد، تصنيف، مدينة، ملاحظات).",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string" },
        phone: { type: "string" },
        email: { type: "string" },
        category: { type: "string" },
        city: { type: "string" },
        notes: { type: "string" },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "update_case",
    description:
      "⚠️ حسّاس: تغيير حالة ملف (جارية/معلّقة/منتهية) أو مسؤوله أو رقم دعواه. يجب أخذ إذن الموظف أولاً ثم confirmed=true.",
    input_schema: {
      type: "object",
      properties: {
        office_num: { type: "string" },
        status: { type: "string", enum: ["jarri", "muallaq", "muntahia"] },
        assignee_name: { type: "string" },
        court_num: { type: "string" },
        court: { type: "string" },
        confirmed: { type: "boolean", description: "true فقط بعد موافقة الموظف الصريحة" },
      },
      required: ["office_num"],
    },
  },
  {
    name: "link_document_to_case",
    description: "ربط مستند غير مصنّف بملف (نقله إلى مستندات الملف).",
    input_schema: {
      type: "object",
      properties: {
        document_id: { type: "string" },
        office_num: { type: "string" },
      },
      required: ["document_id", "office_num"],
    },
  },
];

/* ===================== المنفّذ ===================== */

async function caseByOfficeNum(officeNum: string) {
  const { data } = await admin
    .from("cases")
    .select("id, title, office_num, status, kind")
    .eq("office_num", String(officeNum).trim())
    .maybeSingle();
  return data as any | null;
}

async function memberIdByName(name?: string): Promise<string | null> {
  const n = (name ?? "").trim();
  if (!n) return null;
  const { data } = await admin
    .from("team_members")
    .select("id, name, short_name")
    .or(`name.ilike.%${n}%,short_name.ilike.%${n}%`)
    .eq("is_active", true)
    .limit(1);
  return (data as any[])?.[0]?.id ?? null;
}

/** يُرجع نصاً JSON، أو null إن لم تكن الأداة من هذه المجموعة */
export async function runExtraTool(
  name: string,
  input: any,
  userName: string,
  actions: string[],
): Promise<string | null> {
  /* ---------- قراءة ---------- */
  if (name === "get_case_details") {
    const c = await caseByOfficeNum(input.office_num);
    if (!c) return JSON.stringify({ error: "لم أجد ملفاً بهذا الرقم" });
    const [sessions, tasks, docs, rulings, parties] = await Promise.all([
      admin.from("sessions").select("session_date, session_time, title, court, status").eq("case_id", c.id).order("session_date"),
      admin.from("tasks").select("id, title, due_date, status, priority").eq("case_id", c.id).is("deleted_at", null).neq("status", "done"),
      admin.from("documents").select("id, name, category, created_at").eq("case_id", c.id).is("deleted_at", null).limit(20),
      admin.from("rulings").select("title, ruling_date, result, ruling_number").eq("case_id", c.id),
      admin.from("case_parties").select("name, role, party_side").eq("case_id", c.id),
    ]);
    return JSON.stringify({
      case: c,
      sessions: sessions.data ?? [],
      open_tasks: tasks.data ?? [],
      documents: docs.data ?? [],
      rulings: rulings.data ?? [],
      parties: parties.data ?? [],
    });
  }

  if (name === "search_documents") {
    const q = String(input.query ?? "").trim();
    let qb = admin
      .from("documents")
      .select("id, name, description, category, case_id, file_url, created_at")
      .is("deleted_at", null)
      .or(`name.ilike.%${q}%,description.ilike.%${q}%`)
      .limit(10);
    if (input.case_office_num) {
      const c = await caseByOfficeNum(input.case_office_num);
      if (c) qb = qb.eq("case_id", c.id);
    }
    const { data, error } = await qb;
    return JSON.stringify(error ? { error: error.message } : data ?? []);
  }

  if (name === "list_appointments") {
    const from = input.from_date || isoToday();
    const to = input.to_date || isoPlusDays(7);
    const { data, error } = await admin
      .from("appointments")
      .select("id, client_name, client_phone, appointment_date, appointment_time, service_type, meeting_method, status")
      .gte("appointment_date", from)
      .lte("appointment_date", to)
      .neq("status", "cancelled")
      .order("appointment_date");
    return JSON.stringify(error ? { error: error.message } : data ?? []);
  }

  if (name === "search_messages") {
    const q = String(input.query ?? "").trim();
    const dir = input.direction ?? "any";
    let qb = admin
      .from("sms_log")
      .select("recipient_name, phone, message, status, sent_by, created_at")
      .or(`message.ilike.%${q}%,recipient_name.ilike.%${q}%,phone.ilike.%${q}%`)
      .order("created_at", { ascending: false })
      .limit(10);
    if (dir === "incoming") qb = qb.eq("status", "incoming");
    if (dir === "outgoing") qb = qb.in("status", ["sent", "failed"]);
    const { data, error } = await qb;
    return JSON.stringify(error ? { error: error.message } : data ?? []);
  }

  if (name === "office_overview") {
    const today = isoToday();
    const [cases, tasks, overdue, sessionsToday, sessionsWeek, poas] = await Promise.all([
      admin.from("cases").select("id", { count: "exact", head: true }).eq("kind", "case").eq("status", "jarri"),
      admin.from("tasks").select("id", { count: "exact", head: true }).eq("status", "todo").is("deleted_at", null),
      admin.from("tasks").select("id", { count: "exact", head: true }).eq("status", "todo").is("deleted_at", null).lt("due_date", today),
      admin.from("sessions").select("id", { count: "exact", head: true }).eq("session_date", today),
      admin.from("sessions").select("id", { count: "exact", head: true }).gte("session_date", today).lte("session_date", isoPlusDays(7)),
      admin.from("powers_of_attorney").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "active").gte("expiry_date", today).lte("expiry_date", isoPlusDays(30)),
    ]);
    return JSON.stringify({
      cases_active: cases.count ?? 0,
      open_tasks: tasks.count ?? 0,
      overdue_tasks: overdue.count ?? 0,
      sessions_today: sessionsToday.count ?? 0,
      sessions_next_7_days: sessionsWeek.count ?? 0,
      poas_expiring_30_days: poas.count ?? 0,
    });
  }

  /* ---------- إضافة ---------- */
  if (name === "create_contact") {
    const nm = String(input.name ?? "").trim();
    if (!nm) return JSON.stringify({ error: "الاسم مطلوب" });
    // حارس التكرار — الذكاء لا ينشئ نسخة ثانية من موكّل موجود
    const { data: dupe } = await admin
      .from("contacts")
      .select("id, name, phone")
      .ilike("name", nm)
      .limit(1);
    if ((dupe as any[])?.length) {
      return JSON.stringify({ already_exists: true, contact: (dupe as any[])[0] });
    }
    const { data, error } = await admin
      .from("contacts")
      .insert({
        name: nm,
        phone: input.phone ?? null,
        category: input.category ?? null,
        entity_type: input.entity_type ?? null,
        id_number: input.id_number ?? null,
        city: input.city ?? null,
        notes: input.notes ?? null,
        source: "الذكاء الاصطناعي",
      })
      .select("id, name")
      .single();
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`أضاف جهة اتصال: ${nm}`);
    return JSON.stringify({ created: true, contact: data });
  }

  if (name === "create_matter") {
    const kind = input.kind === "legal_service" || input.kind === "property" ? input.kind : "case";
    const title = String(input.title ?? "").trim();
    if (!title) return JSON.stringify({ error: "العنوان مطلوب" });

    // رقم المكتب: CASE + آخر رقمين من السنة + تسلسل
    const yy = new Date().getFullYear().toString().slice(-2);
    const { data: last } = await admin
      .from("cases")
      .select("office_num")
      .like("office_num", `CASE${yy}%`)
      .order("office_num", { ascending: false })
      .limit(1);
    const lastNum = parseInt(((last as any[])?.[0]?.office_num ?? "").slice(-3), 10);
    const officeNum = `CASE${yy}${String((isNaN(lastNum) ? 0 : lastNum) + 1).padStart(3, "0")}`;

    let contactId: string | null = null;
    if (input.client_name) {
      const { data: ct } = await admin
        .from("contacts").select("id").ilike("name", `%${input.client_name}%`).limit(1);
      contactId = (ct as any[])?.[0]?.id ?? null;
    }

    const { data, error } = await admin
      .from("cases")
      .insert({
        kind,
        title,
        office_num: officeNum,
        status: kind === "case" ? "jarri" : null,
        type: input.type ?? null,
        court: input.court ?? null,
        court_num: input.court_num ?? null,
        contact_id: contactId,
        assignee_id: await memberIdByName(input.assignee_name),
        open_date: isoToday(),
      })
      .select("id, office_num, title")
      .single();
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`فتح مشروعاً: ${title} (${officeNum})`);
    return JSON.stringify({ created: true, matter: data, client_linked: !!contactId });
  }

  if (name === "create_appointment") {
    const { data, error } = await admin
      .from("appointments")
      .insert({
        client_name: input.client_name,
        client_phone: input.client_phone ?? null,
        appointment_date: input.appointment_date,
        appointment_time: input.appointment_time,
        service_type: input.service_type ?? null,
        meeting_method: input.meeting_method ?? null,
        notes: input.notes ?? null,
        status: "scheduled",
        source: "الذكاء الاصطناعي",
      })
      .select("id, client_name, appointment_date, appointment_time")
      .single();
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`حجز موعداً: ${input.client_name} — ${input.appointment_date}`);
    return JSON.stringify({ created: true, appointment: data });
  }

  if (name === "post_discussion_message") {
    let caseId: string | null = null;
    if (input.case_office_num) {
      const c = await caseByOfficeNum(input.case_office_num);
      if (!c) return JSON.stringify({ error: "لم أجد ملفاً بهذا الرقم" });
      caseId = c.id;
    }
    const { error } = await admin.from("case_comments").insert({
      case_id: caseId,
      kind: "ai", // يظهر منسوباً للذكاء لا لموظف
      body: String(input.body ?? "").trim(),
    });
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`كتب في النقاش${input.case_office_num ? ` (${input.case_office_num})` : " العام"}`);
    return JSON.stringify({ posted: true });
  }

  if (name === "create_outgoing_letter") {
    const yy = new Date().getFullYear().toString().slice(-2);
    const { data: last } = await admin
      .from("outgoing_letters")
      .select("letter_number")
      .like("letter_number", `OUT-${yy}-%`)
      .order("letter_number", { ascending: false })
      .limit(1);
    const lastN = parseInt(((last as any[])?.[0]?.letter_number ?? "").split("-").pop() ?? "", 10);
    const num = `OUT-${yy}-${String((isNaN(lastN) ? 0 : lastN) + 1).padStart(3, "0")}`;
    let caseId: string | null = null;
    if (input.case_office_num) {
      const c = await caseByOfficeNum(input.case_office_num);
      caseId = c?.id ?? null;
    }
    const { data, error } = await admin
      .from("outgoing_letters")
      .insert({
        letter_number: num,
        subject: input.subject,
        recipient: input.recipient ?? null,
        case_id: caseId,
        notes: input.notes ?? null,
        letter_date: isoToday(),
        created_by: userName,
      })
      .select("id, letter_number, subject")
      .single();
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`سجّل خطاباً صادراً: ${num}`);
    return JSON.stringify({ created: true, letter: data });
  }

  /* ---------- تعديل ---------- */
  if (name === "update_task") {
    const id = String(input.task_id ?? "").trim();
    const patch: Record<string, unknown> = {};
    if (input.action === "complete") { patch.status = "done"; patch.done_at = new Date().toISOString(); }
    else if (input.action === "reopen") { patch.status = "todo"; patch.done_at = null; }
    else if (input.action === "postpone") {
      if (!input.due_date) return JSON.stringify({ error: "التأجيل يحتاج تاريخاً جديداً" });
      patch.due_date = input.due_date;
    } else if (input.action === "reassign") {
      const mid = await memberIdByName(input.assignee_name);
      if (!mid) return JSON.stringify({ error: "لم أجد موظفاً بهذا الاسم" });
      patch.assignee_id = mid;
    } else if (input.action === "priority") {
      patch.priority = input.priority ?? "med";
    }
    const { data, error } = await admin.from("tasks").update(patch).eq("id", id).select("id, title, status, due_date").single();
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`عدّل مهمة (${input.action}): ${data?.title ?? id}`);
    return JSON.stringify({ updated: true, task: data });
  }

  if (name === "update_contact") {
    const patch: Record<string, unknown> = {};
    for (const k of ["phone", "email", "category", "city", "notes"]) {
      if (input[k] != null && input[k] !== "") patch[k] = input[k];
    }
    if (!Object.keys(patch).length) return JSON.stringify({ error: "لا يوجد ما يُحدَّث" });
    const { data, error } = await admin
      .from("contacts").update(patch).eq("id", input.contact_id).select("id, name").single();
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`حدّث جهة اتصال: ${data?.name ?? input.contact_id}`);
    return JSON.stringify({ updated: true, contact: data });
  }

  if (name === "update_case") {
    // حسّاس — لا يقع الفعل بلا تأكيد صريح مهما قال النموذج
    if (input.confirmed !== true) return needsConfirm("تغيير بيانات ملف");
    const c = await caseByOfficeNum(input.office_num);
    if (!c) return JSON.stringify({ error: "لم أجد ملفاً بهذا الرقم" });
    const patch: Record<string, unknown> = {};
    if (input.status) patch.status = input.status;
    if (input.court_num) patch.court_num = input.court_num;
    if (input.court) patch.court = input.court;
    if (input.assignee_name) {
      const mid = await memberIdByName(input.assignee_name);
      if (!mid) return JSON.stringify({ error: "لم أجد موظفاً بهذا الاسم" });
      patch.assignee_id = mid;
    }
    if (!Object.keys(patch).length) return JSON.stringify({ error: "لا يوجد ما يُحدَّث" });
    const { error } = await admin.from("cases").update(patch).eq("id", c.id);
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`عدّل الملف ${c.office_num}: ${Object.keys(patch).join("، ")}`);
    return JSON.stringify({ updated: true, office_num: c.office_num, changed: Object.keys(patch) });
  }

  if (name === "link_document_to_case") {
    const c = await caseByOfficeNum(input.office_num);
    if (!c) return JSON.stringify({ error: "لم أجد ملفاً بهذا الرقم" });
    const { data, error } = await admin
      .from("documents").update({ case_id: c.id }).eq("id", input.document_id).select("id, name").single();
    if (error) return JSON.stringify({ error: error.message });
    actions.push(`ربط مستند «${data?.name ?? ""}» بالملف ${c.office_num}`);
    return JSON.stringify({ linked: true, document: data, office_num: c.office_num });
  }

  return null; // ليست من أدوات هذه الوحدة
}

/** قواعد إضافية تُلحق بتوجيه النظام في الدالتين */
export const EXTRA_SYSTEM_RULES = `
صلاحياتك الموسّعة (2026-08-25): تستطيع **الإضافة والتعديل** في النظام — إضافة موكّلين، فتح مشاريع، حجز مواعيد، كتابة في النقاشات، تسجيل خطابات صادرة، إنجاز المهام وتأجيلها وإعادة إسنادها، تحديث جهات الاتصال، ربط المستندات بملفاتها.
قواعد الصلاحيات:
- لا تحذف شيئاً أبداً؛ لا تملك أدوات حذف ولا تدّعِ ذلك.
- **استأذن قبل الحسّاس**: إرسال رسالة لموكّل (send_sms) وتغيير بيانات ملف (update_case). اعرض ما ستفعله بجملة واحدة، وانتظر موافقة الموظف، ثم نفّذ بـ confirmed=true. أما الإضافات العادية (موكّل، موعد، مهمة، خطاب) فنفّذها مباشرة واذكر ما فعلت.
- تحقّق قبل الإنشاء: ابحث بـ search_contacts أو search_cases أولاً كي لا تكرّر سجلاً موجوداً.
- بعد أي إضافة أو تعديل اذكر بسطر واحد ما تم بالضبط (الاسم والرقم المولَّد).
- إن نقصك معطى جوهري (رقم، تاريخ، اسم موظف) فاسأل عنه بدل التخمين.`;
