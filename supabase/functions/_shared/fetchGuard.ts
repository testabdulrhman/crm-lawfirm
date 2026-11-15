// حارس النداءات الخارجية — المراجعة الشاملة 2026-11-15 (الدفعة الرابعة، البند ٢).
// كانت نداءات مسجات وGoogle وAnthropic بلا مهلة (خدمة عالقة تُعلّق صفحة الحجز وإغلاق الجلسة معها)،
// وبلا إعادة محاولة عند ازدحام Anthropic، وفشلها لا يصل «سجل الأخطاء» إلا في ٤ دوال من ٣٦.
//
// سطر واحد في أول الدالة: guardFetch("اسم-الدالة") — يغلّف fetch العام فيضيف لكل نداء بلا signal:
//   • مهلة حسب الجهة (Anthropic ٥ دقائق، مسجات ١٥ث، Google ٢٠ث، دوالنا ٦٠ث، غيرها ٣٠ث)
//   • إعادة محاولة لـAnthropic عند 429/500/502/503/529 (مرتان، تحترم retry-after بسقف ١٠ث) — طلباتها بلا أثر جانبي
//   • تسجيل فشل الجهات الخارجية (مهلة/شبكة/5xx) في error_logs باسم الدالة، مرة كل دقيقة لكل جهة
// النداء الذي يحمل signal خاصاً به يُترك كما هو (صاحبه قرر مهلته).

type Rule = { timeoutMs: number; retry: boolean; log: boolean };

let installed = false;

function ruleFor(host: string, ownHost: string): Rule {
  if (host === "api.anthropic.com") return { timeoutMs: 300_000, retry: true, log: true }; // دراسة القضية قد تتجاوز دقيقتين
  if (host.endsWith("msegat.com")) return { timeoutMs: 15_000, retry: false, log: true };
  if (host.endsWith("googleapis.com") || host.endsWith("google.com")) return { timeoutMs: 20_000, retry: false, log: true };
  if (ownHost && host === ownHost) return { timeoutMs: 60_000, retry: false, log: false };
  return { timeoutMs: 30_000, retry: false, log: true };
}

const RETRY_STATUS = new Set([429, 500, 502, 503, 529]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Fetch = typeof fetch;
type Cfg = { supabaseUrl: string; serviceKey: string; scale?: number };

/** الغلاف نفسه — دالة نقية تُختبر بـfetch وهمي (scale يصغّر المهل والانتظار في الاختبار) */
export function makeGuardedFetch(orig: Fetch, source: string, cfg: Cfg): Fetch {
  const supabaseUrl = cfg.supabaseUrl.replace(/\/$/, "");
  const scale = cfg.scale ?? 1;
  let ownHost = "";
  try { ownHost = supabaseUrl ? new URL(supabaseUrl).host : ""; } catch { /* بلا */ }
  const lastLog = new Map<string, number>();

  const logFailure = (host: string, message: string) => {
    if (!supabaseUrl || !cfg.serviceKey) return;
    const now = Date.now();
    if ((lastLog.get(host) ?? 0) > now - 60_000) return;
    lastLog.set(host, now);
    // بالـfetch الأصلي وبلا انتظار — التسجيل لا يعطّل الدالة ولا يدخل الحارس نفسه
    orig(`${supabaseUrl}/rest/v1/error_logs`, {
      method: "POST",
      headers: {
        apikey: cfg.serviceKey,
        Authorization: `Bearer ${cfg.serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        source,
        error_type: "external",
        message: `${source} → ${host}: ${message}`.slice(0, 1000),
      }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {});
  };

  return (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    // كائن Request أو نداء يحمل مهلته الخاصة: يمر كما هو
    if (input instanceof Request || init?.signal) return orig(input, init);
    let url: URL;
    try {
      url = new URL(typeof input === "string" ? input : input.href);
    } catch {
      return orig(input, init);
    }

    const rule = ruleFor(url.host, ownHost);
    const timeoutMs = Math.max(1, Math.round(rule.timeoutMs * scale));
    const canRetry = rule.retry && (init?.body == null || typeof init.body === "string");
    const attempts = canRetry ? 3 : 1;

    let lastErr: unknown = null;
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await orig(input, { ...(init ?? {}), signal: AbortSignal.timeout(timeoutMs) });
        if (canRetry && RETRY_STATUS.has(res.status) && i < attempts - 1) {
          const ra = Number(res.headers.get("retry-after"));
          await res.body?.cancel().catch(() => {});
          await sleep((Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : 1500 * (i + 1) * (i + 1)) * scale);
          continue;
        }
        if (rule.log && res.status >= 500) logFailure(url.host, `HTTP ${res.status}`);
        return res;
      } catch (e) {
        lastErr = e;
        const name = (e as Error)?.name ?? "";
        const timedOut = name === "TimeoutError" || name === "AbortError";
        if (canRetry && i < attempts - 1) {
          await sleep(1500 * (i + 1) * (i + 1) * scale);
          continue;
        }
        if (rule.log) logFailure(url.host, timedOut ? `لم تردّ خلال ${rule.timeoutMs / 1000} ثانية` : String((e as Error)?.message ?? e));
        if (timedOut) throw new Error(`الخدمة الخارجية (${url.host}) لم تردّ خلال ${rule.timeoutMs / 1000} ثانية`);
        throw e;
      }
    }
    throw lastErr;
  }) as Fetch;
}

export function guardFetch(source: string) {
  if (installed) return;
  installed = true;
  globalThis.fetch = makeGuardedFetch(globalThis.fetch.bind(globalThis), source, {
    supabaseUrl: Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  });
}
