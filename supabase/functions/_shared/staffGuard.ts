// من يحق له نداء دوال الإرسال (SMS وواتساب) — فحص ChatGPT 2026-10-19:
// verify_jwt يقبل مفتاح anon العام نفسه (وهو منشور في واجهة الويب)، فكان أي زائر يرسل رسائل باسم المكتب
// ومن رصيده. المقبول الآن: مفتاح الخادم (نداءات الدوال الأخرى: تأكيد الموعد، طلبات التوظيف)، أو جلسة موظف
// **نشط** ليس حساب مراجعة أبل.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Caller = { kind: "service" } | { kind: "internal" } | { kind: "staff"; memberId: string; name: string; director: boolean };

export async function staffOrService(req: Request): Promise<Caller | null> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (service && token === service) return { kind: "service" };

  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", service, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: m } = await admin
    .from("team_members")
    .select("id, name, is_active, is_reviewer, is_director, member_type")
    .eq("auth_id", data.user.id)
    .maybeSingle();
  if (!m || m.is_active === false || m.is_reviewer === true) return null;
  return { kind: "staff", memberId: m.id as string, name: (m.name as string) ?? "", director: m.is_director === true };
}

/** للمهام المجدولة (pg_cron): ترويسة x-internal-secret = discussion_ai_config/inbound_secret — كما case-study */
export async function internalSecretOk(req: Request): Promise<boolean> {
  const got = req.headers.get("x-internal-secret") ?? "";
  if (!got) return false;
  const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data } = await admin.from("lookup_values").select("value")
    .eq("type", "discussion_ai_config").eq("label", "inbound_secret").limit(1).maybeSingle();
  return !!data?.value && got === data.value;
}

/** موظف نشط أو مفتاح الخادم أو السرّ الداخلي (المجدول) — وإلا null */
export async function staffServiceOrInternal(req: Request): Promise<Caller | null> {
  if (await internalSecretOk(req)) return { kind: "internal" };
  return await staffOrService(req);
}
