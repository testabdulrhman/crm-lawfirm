// CRM-1 (فحص 2026-11-17): الدوال التي تنزّل ملفاً برابطٍ يرسله الموظف كانت تنزّله بمفتاح الخادم بلا سؤال —
// فموظف يعرف مسار مستند في ملف محجوب عنه يطلب تحليله فيقرأ محتواه. هنا يُسأل: هل يحق للمتصل قراءته؟
// بصلاحياته هو (RPC stored_url_readable: رفعه هو، أو يرى سجلاً يشير إليه). والرابط من خارج مخزننا:
// https إلى مضيف عام فقط (لا عناوين IP ولا localhost ولا أسماء داخلية).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const PUBLIC_PREFIX = `${SUPABASE_URL}/storage/v1/object/public/documents/`;

/** مسار الكائن في مخزن documents من رابطه العام أو الموقّع، أو null */
export function documentsPath(url: string): string | null {
  return url.match(/\/storage\/v1\/object\/(?:public|sign)\/documents\/([^?#]+)/)?.[1] ?? null;
}

function publicHostOk(url: string): boolean {
  let u: URL;
  try { u = new URL(url); } catch { return false; }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes(".") || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":") || h.startsWith("[")) return false; // IP حرفي (v4/v6)
  return true;
}

/**
 * auth: ترويسة Authorization للموظف المتصل، أو null لنداء خادمي/داخلي (لا فحص — صاحبه موثوق).
 * يُرجع true إن جاز تنزيل الرابط لهذا المتصل.
 */
export async function storedUrlAllowed(url: string, auth: string | null): Promise<boolean> {
  const path = documentsPath(url);
  if (!path) return publicHostOk(url);
  if (!auth) return true;
  const client = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: auth.startsWith("Bearer ") ? auth : `Bearer ${auth}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.rpc("stored_url_readable", { p_url: PUBLIC_PREFIX + path });
  return !error && data === true;
}
