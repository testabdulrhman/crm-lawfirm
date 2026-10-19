import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// submit-application — تقديم الوظيفة من redwan.sa/careers واستكمال مستنداته (/careers/complete?id=).
// 2026-10-18: أُدخل المستودع (كان منشوراً فقط)، وتأكيد الاستلام يصل واتساب أيضاً مع الـSMS (طلب المدير):
//   النص نفسه حراً داخل نافذة الـ٢٤ ساعة، وخارجها القالب crm_law_09 (عبر fallback_template في whatsapp-send).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "documents";
const MAX_BYTES = 8 * 1024 * 1024;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function isValidEmail(e: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// فك ترميز سريع أصلي للـ base64/data-URL عبر fetch (بسرعة C، بدل حلقة atob البطيئة).
async function decodeDataUrl(input: string): Promise<Uint8Array> {
  const s = String(input);
  const dataUrl = s.startsWith("data:") ? s : `data:application/octet-stream;base64,${s.replace(/\s/g, "")}`;
  const resp = await fetch(dataUrl);
  const ab = await resp.arrayBuffer();
  return new Uint8Array(ab);
}

function normalizeSaudiPhone(raw: string): string {
  let p = String(raw).replace(/\D/g, "");
  if (p.startsWith("00966")) p = p.slice(2);
  else if (p.startsWith("966")) {}
  else if (p.startsWith("0")) p = "966" + p.slice(1);
  else if (p.startsWith("5")) p = "966" + p;
  return p;
}

async function logError(supabase: any, where: string, detail: string) {
  try { await supabase.from("error_logs").insert({ source: "submit-application", error_type: where, message: where + ": " + detail }); } catch (_) {}
}

// رفع مستند بمفتاح ASCII (التخزين يرفض العربية) — يُرجع الرابط العام أو يرمي خطأ.
async function uploadDoc(supabase: any, base64: string, name: string, tag: string): Promise<string> {
  if (String(base64).length * 0.75 > MAX_BYTES + 256 * 1024) throw new Error("size");
  const bytes = await decodeDataUrl(String(base64));
  if (bytes.length === 0) throw new Error("empty file");
  if (bytes.length > MAX_BYTES) throw new Error("size");
  const originalName = String(name).trim();
  const rawExt = originalName.includes(".") ? (originalName.split(".").pop() || "").toLowerCase() : "";
  const ext = /^[a-z0-9]{1,5}$/.test(rawExt) ? rawExt : "pdf";
  const path = `staff_applications/public/${Date.now()}_${tag}.${ext}`;
  const contentType = ext === "pdf" ? "application/pdf" : ext === "doc" ? "application/msword" : ext === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "png" ? "image/png" : "application/octet-stream";
  const blob = new Blob([bytes], { type: contentType });
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType, upsert: true });
  if (upErr) throw new Error(upErr.message);
  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return pub.publicUrl;
}

/** سجلّ الطلب (staff_application_events — 2026-10-19): كل حدث مربوط بطلبه، وفشل التسجيل لا يمسّ شيئاً */
async function logEvent(supabase: any, appId: string | null, kind: string, extra: Record<string, unknown> = {}) {
  if (!appId) return;
  try { await supabase.from("staff_application_events").insert({ application_id: appId, kind, ...extra }); } catch (_) {}
}

/** واتساب تأكيد الاستلام — غير قاتل: فشله لا يمسّ الطلب ولا الـSMS. يُرجع هل خرج */
async function sendApplicantWhatsApp(name: string, phone: string, msg: string): Promise<boolean> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_ROLE}` },
      body: JSON.stringify({
        phone, message: msg, recipient_name: name,
        fallback_template: { name: "crm_law_09", lang: "ar", params: [name] },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const d = await r.json().catch(() => ({}));
    return r.ok && !!d?.success;
  } catch (_) { return false; }
}

async function sendApplicantSMS(supabase: any, name: string, phone: string, appId: string | null) {
  try {
    const { data: cfgRow } = await supabase.from("lookup_values").select("value").eq("type", "sms_config").limit(1).maybeSingle();
    const { data: tplRow } = await supabase.from("message_templates").select("body").eq("key", "application_received").maybeSingle();
    if (!cfgRow?.value || !tplRow?.body) return;
    const cfg = typeof cfgRow.value === "string" ? JSON.parse(cfgRow.value) : cfgRow.value;
    const msg = String(tplRow.body).replace(/\{name\}/g, name || "");
    const num = normalizeSaudiPhone(phone);
    if (num.replace(/\D/g, "").length < 11) return;
    const wa = sendApplicantWhatsApp(name, num, msg);
    const res = await fetch("https://www.msegat.com/gw/sendsms.php", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userName: cfg.userName, apiKey: cfg.apiKey, userSender: cfg.sender, numbers: num, msg }),
    });
    const out = await res.text();
    const smsOk = out.includes("\"code\":\"1\"") || out.includes("1");
    await supabase.from("sms_log").insert({
      recipient_name: name, phone: num, message: msg,
      status: smsOk ? "sent" : "failed",
      sent_by: "نظام (تقديم وظيفة)",
    });
    await logEvent(supabase, appId, "received_msg", { channel: "sms", ok: smsOk });
    await logEvent(supabase, appId, "received_msg", { channel: "whatsapp", ok: await wa });
  } catch (_) {}
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    const body = await req.json();

    // ===== استكمال طلب قائم عبر رابط خاص (id الطلب هو الرمز — يصل للمتقدم برسالة) =====
    if (body?.action === "status") {
      const { data: app } = await supabase.from("staff_applications")
        .select("id, full_name, cv_url, qualification_doc_url, lawyer_license_url, deleted_at")
        .eq("id", String(body.id || "")).maybeSingle();
      if (!app || app.deleted_at) return json({ error: "الطلب غير موجود أو انتهت صلاحية الرابط" }, 404);
      return json({ success: true, full_name: app.full_name, has_cv: !!app.cv_url, has_qual: !!app.qualification_doc_url, has_license: !!app.lawyer_license_url });
    }

    if (body?.action === "complete") {
      const { data: app } = await supabase.from("staff_applications")
        .select("id, full_name, deleted_at").eq("id", String(body.id || "")).maybeSingle();
      if (!app || app.deleted_at) return json({ error: "الطلب غير موجود أو انتهت صلاحية الرابط" }, 404);

      const updates: Record<string, unknown> = {};
      const docs: [string, string, string, string, string][] = [
        ["cv_base64", "cv_name", "cv_url", "cv_name", "cv"],
        ["qual_base64", "qual_name", "qualification_doc_url", "qualification_doc_name", "qual"],
        ["license_base64", "license_name", "lawyer_license_url", "lawyer_license_name", "license"],
      ];
      let uploaded = 0;
      for (const [b64Key, nameKey, urlCol, nameCol, tag] of docs) {
        const b64 = body[b64Key]; const fname = body[nameKey];
        if (!b64 || !fname) continue;
        try {
          const url = await uploadDoc(supabase, b64, fname, tag);
          updates[urlCol] = url; updates[nameCol] = String(fname).trim();
          uploaded++;
        } catch (e) {
          const m = String((e as Error)?.message || e);
          if (m === "size") return json({ error: `ملف «${fname}» يتجاوز 8 ميجابايت. يرجى ضغطه وإعادة المحاولة.` }, 400);
          await logError(supabase, "complete_upload", m);
          return json({ error: "تعذّر رفع أحد الملفات. يرجى المحاولة مجدداً." }, 500);
        }
      }
      if (uploaded === 0) return json({ error: "لم يُرفق أي ملف" }, 400);

      const { error: updErr } = await supabase.from("staff_applications").update(updates).eq("id", app.id);
      if (updErr) { await logError(supabase, "complete_update", updErr.message); return json({ error: "تعذّر حفظ المستندات" }, 500); }
      const labels: Record<string, string> = { cv_url: "السيرة الذاتية", qualification_doc_url: "شهادة المؤهل", lawyer_license_url: "رخصة المحاماة" };
      await logEvent(supabase, app.id, "completed", {
        detail: Object.keys(updates).filter((k) => labels[k]).map((k) => labels[k]).join("، "),
      });
      return json({ success: true, uploaded });
    }

    // ===== تقديم جديد (السلوك الأصلي) =====
    const { full_name, phone, email, qualifications, website, cv_base64, cv_name } = body ?? {};

    if (website) return json({ success: true });

    if (!full_name || String(full_name).trim().length < 2) return json({ error: "الاسم مطلوب" }, 400);
    if (!phone || String(phone).replace(/\D/g, "").length < 9) return json({ error: "رقم الجوال غير صحيح" }, 400);
    if (email && !isValidEmail(String(email))) return json({ error: "البريد الإلكتروني غير صحيح" }, 400);

    const cleanName = String(full_name).trim();
    const cleanPhone = String(phone).trim();

    let cv_url: string | null = null;
    let stored_cv_name: string | null = null;
    let cvFailed = false;
    if (cv_base64 && cv_name) {
      try {
        cv_url = await uploadDoc(supabase, cv_base64, cv_name, "cv");
        stored_cv_name = String(cv_name).trim();
      } catch (e) {
        const m = String((e as Error)?.message || e);
        if (m === "size") return json({ error: "حجم السيرة الذاتية كبير (الحد 8 ميجابايت). يرجى ضغط الملف وإعادة المحاولة." }, 400);
        await logError(supabase, "upload", m);
        cvFailed = true;
      }
    }

    const { data: inserted, error: insErr } = await supabase.from("staff_applications").insert({
      full_name: cleanName, phone: cleanPhone,
      email: email ? String(email).trim() : null,
      qualifications: qualifications ? String(qualifications).trim() : null,
      cv_url, cv_name: stored_cv_name, status: "pending",
    }).select("id").single();
    if (insErr) { await logError(supabase, "insert", insErr.message); return json({ error: "تعذّر حفظ الطلب" }, 500); }
    const appId: string | null = inserted?.id ?? null;
    await logEvent(supabase, appId, "submitted", { detail: cv_url ? "مع السيرة الذاتية" : (cvFailed ? "تعذّر إرفاق السيرة" : "بلا سيرة ذاتية") });

    await sendApplicantSMS(supabase, cleanName, cleanPhone, appId);

    if (cvFailed) {
      return json({ success: true, cv_warning: true, message: "تم استلام طلبك، لكن تعذّر إرفاق السيرة الذاتية. يمكنك إرسالها لاحقاً." });
    }
    return json({ success: true, message: "تم استلام طلبك بنجاح" });
  } catch (e) {
    await logError(supabase, "fatal", String(e?.message || e));
    return json({ error: "حدث خطأ غير متوقّع" }, 500);
  }
});