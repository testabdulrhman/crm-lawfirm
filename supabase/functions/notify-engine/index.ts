import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =============================================================
// notify-engine — محرك الإشعارات العام (طلب المدير 2026-09-22).
//
// هذا النظام يملك **متى ولمن**: يقرأ notification_rules، ويحسب ما استُحق اليوم
// من كل مصدر (جلسة/موعد/وكالة/مهلة)، ويحلّ المستلم ومتغيّرات القالب، ويكتب
// صفاً في notification_sends بحالة pending.
//
// **كيف** (القالب والإرسال) يملكه نظام الـHub. لا يُرسل هذا الملف شيئاً بعد:
// دالة الإرسال تُوصَل بالـHub حين تصل تعريفات القوالب المعتمدة منه
// (اسم القالب + ترتيب المتغيّرات + اللغة). حتى ذلك الحين يبقى الاستحقاق
// مسجَّلاً pending ويُرى في الواجهة — فلا رسالة تُرسل بلا قالب معتمد.
//
// التشغيل: بـcron يومياً (يُجدول بعد وصول عقد الـHub)، أو يدوياً للفحص:
//   POST /functions/v1/notify-engine  { "date": "2026-09-22", "dry_run": true }
// =============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o, null, 1), { status, headers: { "Content-Type": "application/json" } });

interface Rule {
  id: string;
  key: string;
  name: string;
  event_type: "session" | "appointment" | "poa" | "deadline" | "manual";
  source_table: string | null;
  date_column: string | null;
  filter: Record<string, unknown>;
  offsets_days: number[];
  send_at_time: string;
  recipient: "client" | "assignee" | "director";
  channel: string;
  template_name: string | null;
  template_lang: string;
  variables: string[];
  is_active: boolean;
}

// ===== تنسيق القيم =====

const AR_MONTHS = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

/** 2026-09-22 → «22 سبتمبر 2026» — أرقام لاتينية كبقية النظام */
export function dateAr(iso: string | null): string {
  if (!iso) return "";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} ${AR_MONTHS[m - 1]} ${y}`;
}

/** "14:30:00" → «2:30 م» */
export function time12(t: string | null): string {
  if (!t) return "";
  const [hh, mm] = String(t).slice(0, 5).split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return String(t);
  const suffix = hh < 12 ? "ص" : "م";
  const h = hh % 12 === 0 ? 12 : hh % 12;
  return `${h}:${String(mm).padStart(2, "0")} ${suffix}`;
}

/** فرق الأيام بين اليوم والتاريخ، بصيغة عربية سليمة العدد */
export function daysLeft(iso: string | null, today: string): string {
  if (!iso) return "";
  const a = Date.parse(String(iso).slice(0, 10) + "T00:00:00Z");
  const b = Date.parse(today + "T00:00:00Z");
  if (Number.isNaN(a) || Number.isNaN(b)) return "";
  const n = Math.round((a - b) / 86_400_000);
  if (n <= 0) return "اليوم";
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

/** يحلّ «contact.name» أو «session.session_date|date_ar» من سياق السجل */
export function resolvePath(ctx: Record<string, unknown>, path: string, today: string): string {
  const [expr, fmt] = path.split("|");
  let cur: unknown = ctx;
  for (const key of expr.trim().split(".")) {
    if (cur && typeof cur === "object" && key in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[key];
    } else {
      cur = null;
      break;
    }
  }
  const raw = cur == null ? "" : String(cur);
  switch ((fmt ?? "").trim()) {
    case "date_ar": return dateAr(raw || null);
    case "time12": return time12(raw || null);
    case "days_left": return daysLeft(raw || null, today);
    default: return raw;
  }
}

/** اليوم بتوقيت الرياض بصيغة YYYY-MM-DD */
export function riyadhToday(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

/** التاريخ المستهدف لتذكير «قبل N يوماً» */
export function targetDate(today: string, offset: number): string {
  const t = Date.parse(today + "T00:00:00Z") + offset * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

// ===== جلب السجلات المستحقة لكل نوع =====

interface Due {
  entity_table: string;
  entity_id: string;
  case_id: string | null;
  event_date: string;
  ctx: Record<string, unknown>;
  recipient_name: string;
  recipient_phone: string;
}

function applyFilter<T>(q: T, filter: Record<string, unknown>): T {
  let out = q as unknown as { eq: (c: string, v: unknown) => unknown; is: (c: string, v: unknown) => unknown };
  for (const [col, val] of Object.entries(filter ?? {})) {
    out = (val === null ? out.is(col, null) : out.eq(col, val)) as typeof out;
  }
  return out as unknown as T;
}

async function dueSessions(rule: Rule, date: string): Promise<Due[]> {
  let q = supabase.from("sessions")
    .select("id, case_id, title, session_date, session_time, court, cases(id, title, office_num, contact_id, assignee_id, contacts(id, name, phone))")
    .eq("session_date", date);
  q = applyFilter(q, rule.filter);
  const { data } = await q;
  return (data ?? []).map((s: Record<string, unknown>) => {
    const kase = (s.cases ?? {}) as Record<string, unknown>;
    const contact = (kase.contacts ?? {}) as Record<string, unknown>;
    return {
      entity_table: "sessions",
      entity_id: String(s.id),
      case_id: (s.case_id as string) ?? null,
      event_date: String(s.session_date),
      ctx: { session: s, case: kase, contact },
      recipient_name: String(contact.name ?? ""),
      recipient_phone: String(contact.phone ?? ""),
    };
  });
}

async function dueAppointments(rule: Rule, date: string): Promise<Due[]> {
  let q = supabase.from("appointments")
    .select("id, client_id, client_name, client_phone, appointment_date, appointment_time, meeting_method, reference_no, meeting_link, status")
    .eq("appointment_date", date);
  q = applyFilter(q, rule.filter);
  const { data } = await q;
  return (data ?? []).map((a: Record<string, unknown>) => ({
    entity_table: "appointments",
    entity_id: String(a.id),
    case_id: null,
    event_date: String(a.appointment_date),
    ctx: { appointment: a, contact: { name: a.client_name, phone: a.client_phone } },
    recipient_name: String(a.client_name ?? ""),
    recipient_phone: String(a.client_phone ?? ""),
  }));
}

async function duePoas(rule: Rule, date: string): Promise<Due[]> {
  let q = supabase.from("powers_of_attorney")
    .select("id, poa_number, expiry_date, status, client_id, client_name, case_id, contacts:client_id(id, name, phone)")
    .eq("expiry_date", date).is("deleted_at", null);
  q = applyFilter(q, rule.filter);
  const { data } = await q;
  return (data ?? []).map((p: Record<string, unknown>) => {
    const contact = (p.contacts ?? {}) as Record<string, unknown>;
    return {
      entity_table: "powers_of_attorney",
      entity_id: String(p.id),
      case_id: (p.case_id as string) ?? null,
      event_date: String(p.expiry_date),
      ctx: { poa: p, contact },
      // ⚠️ الوكالات غير مربوطة بجهات الاتصال بعد: بلا client_id لا جوال ⇒ skipped
      recipient_name: String(contact.name ?? p.client_name ?? ""),
      recipient_phone: String(contact.phone ?? ""),
    };
  });
}

async function dueDeadlines(rule: Rule, date: string): Promise<Due[]> {
  let q = supabase.from("deadlines")
    .select("id, case_id, title, deadline_date, type, assignee_id, cases(id, title, office_num, assignee_id, contact_id, contacts(id, name, phone))")
    .eq("deadline_date", date).is("deleted_at", null);
  q = applyFilter(q, rule.filter);
  const { data } = await q;
  const rows = data ?? [];
  // المستلم «مسؤول الملف»: نجلب جواله من الفريق
  const memberIds = [...new Set(rows.map((d: Record<string, unknown>) => {
    const kase = (d.cases ?? {}) as Record<string, unknown>;
    return (d.assignee_id ?? kase.assignee_id) as string | null;
  }).filter(Boolean))] as string[];
  const members = new Map<string, { name: string; phone: string }>();
  if (memberIds.length) {
    const { data: tm } = await supabase.from("team_members").select("id, name, short_name, phone").in("id", memberIds);
    for (const m of tm ?? []) {
      members.set(String(m.id), { name: String(m.short_name ?? m.name ?? ""), phone: String(m.phone ?? "") });
    }
  }
  return rows.map((d: Record<string, unknown>) => {
    const kase = (d.cases ?? {}) as Record<string, unknown>;
    const contact = (kase.contacts ?? {}) as Record<string, unknown>;
    const assignee = members.get(String(d.assignee_id ?? kase.assignee_id ?? "")) ?? { name: "", phone: "" };
    return {
      entity_table: "deadlines",
      entity_id: String(d.id),
      case_id: (d.case_id as string) ?? null,
      event_date: String(d.deadline_date),
      ctx: { deadline: d, case: kase, contact, assignee },
      recipient_name: rule.recipient === "client" ? String(contact.name ?? "") : assignee.name,
      recipient_phone: rule.recipient === "client" ? String(contact.phone ?? "") : assignee.phone,
    };
  });
}

async function dueFor(rule: Rule, date: string): Promise<Due[]> {
  switch (rule.event_type) {
    case "session": return dueSessions(rule, date);
    case "appointment": return dueAppointments(rule, date);
    case "poa": return duePoas(rule, date);
    case "deadline": return dueDeadlines(rule, date);
    default: return []; // manual: يُستدعى من الواجهة لا من الجدولة
  }
}

// ===== المشغّل =====

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const today: string = body.date ?? riyadhToday();
  const dryRun: boolean = body.dry_run === true;

  const { data: rules, error } = await supabase
    .from("notification_rules").select("*").eq("is_active", true);
  if (error) return json({ error: error.message }, 500);

  const planned: Record<string, unknown>[] = [];
  let inserted = 0;

  for (const rule of (rules ?? []) as Rule[]) {
    if (rule.event_type === "manual" || !rule.source_table) continue;
    for (const offset of rule.offsets_days ?? []) {
      const date = targetDate(today, offset);
      for (const due of await dueFor(rule, date)) {
        const params = (rule.variables ?? []).map((p) => resolvePath(due.ctx, p, today));
        const row = {
          rule_id: rule.id,
          entity_table: due.entity_table,
          entity_id: due.entity_id,
          case_id: due.case_id,
          offset_days: offset,
          event_date: due.event_date,
          due_at: `${today}T${rule.send_at_time}+03:00`,
          recipient_name: due.recipient_name,
          recipient_phone: due.recipient_phone,
          template_name: rule.template_name,
          template_params: params,
          // بلا جوال لا إرسال؛ وبلا قالب معتمد من الـHub لا إرسال كذلك
          status: !due.recipient_phone ? "skipped" : "pending",
          error: !due.recipient_phone ? "لا يوجد رقم جوال للمستلم" : null,
        };
        planned.push({ rule: rule.key, ...row });
        if (!dryRun) {
          // الفهرس الفريد (rule, entity, offset) يمنع التكرار عند إعادة التشغيل
          const { error: insErr } = await supabase
            .from("notification_sends").insert(row).select("id").maybeSingle();
          if (!insErr) inserted++;
        }
      }
    }
  }

  // ⚠️ لا إرسال هنا بعد: «كيف» يملكه الـHub. حين يصل عقده (المسار + المصادقة +
  //    أسماء القوالب المعتمدة وترتيب متغيّراتها) يُضاف هنا تسليم صفوف pending
  //    إليه وتحديث الحالة sent/failed بما يرده.
  return json({ ok: true, today, dry_run: dryRun, rules: (rules ?? []).length, planned: planned.length, inserted, planned_rows: planned.slice(0, 20) });
});
