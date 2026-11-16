// sign-files — روابط مؤقتة لملفات مخزن documents (المخزن الخاص، المرحلة ١ — المراجعة الشاملة 2026-11-15).
// المدخل: { urls: string[] } (حتى ١٠٠) بصيغة الرابط المخزّن في القاعدة (…/object/public/documents/<path>).
// الحكم: visible_stored_urls بجلسة المتصل نفسها (RLS) — يُوقَّع فقط ما يرى سجلاً يشير إليه؛ والمتعاون الخارجي
// يمرّ بالحارس لأن صلاحياته في القاعدة تحصره في ملفاته. التوقيع بمفتاح الخادم، صالح ساعة.
// المخرج: { signed: { [url]: signedUrl } } — ما لم يُوقَّع يغيب عن الخريطة (المتصفح يُبقي الرابط الأصلي ما دام المخزن عاماً).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { internalSecretOk, staffOrService } from "../_shared/staffGuard.ts";
import { guardFetch } from "../_shared/fetchGuard.ts";

guardFetch("sign-files");

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const PREFIX = `${SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/documents/`;
const TTL = 3600;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-region",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  // الموظف بجلسته (يُحكم بصلاحياته)، أو نداء داخلي من دوالنا/المجدولات بالسر أو مفتاح الخادم (يُوقَّع كله)
  const caller = (await internalSecretOk(req)) ? { kind: "internal" as const } : await staffOrService(req, { allowCollaborator: true });
  if (!caller) return json({ error: "لموظف نشط فقط" }, 401);

  const body = await req.json().catch(() => ({}));
  const urls: string[] = Array.from(new Set(
    (Array.isArray(body?.urls) ? body.urls : []).filter((u: unknown) => typeof u === "string" && u.startsWith(PREFIX)),
  )).slice(0, 100) as string[];
  if (!urls.length) return json({ signed: {} });

  // ما يحق للمتصل رؤيته — بجلسته هو لا بمفتاح الخادم (مفتاح الخادم = كل شيء: للنداءات الداخلية وحدها)
  let allowed: string[];
  if (caller.kind === "staff") {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const asUser = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await asUser.rpc("visible_stored_urls", { p_urls: urls });
    if (error) return json({ error: error.message }, 500);
    allowed = (data ?? []).map((r: unknown) => (typeof r === "string" ? r : (r as Record<string, string>).visible_stored_urls));
  } else {
    allowed = urls;
  }
  if (!allowed.length) return json({ signed: {} });

  const paths = allowed.map((u) => decodeURIComponent(u.slice(PREFIX.length)));
  const { data: signed, error: sErr } = await admin.storage.from("documents").createSignedUrls(paths, TTL);
  if (sErr) return json({ error: sErr.message }, 500);

  // الربط بالمسار لا بالترتيب — لا يُفترض أن الرد يحفظ ترتيب الطلب
  const byPath = new Map<string, string>();
  for (const s of signed ?? []) if (s?.path && s.signedUrl && !s.error) byPath.set(s.path, s.signedUrl);
  const out: Record<string, string> = {};
  allowed.forEach((u, i) => {
    const su = byPath.get(paths[i]);
    if (su) out[u] = su;
  });
  return json({ signed: out, ttl: TTL });
});
