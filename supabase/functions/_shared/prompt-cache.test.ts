// اختبار التخزين المؤقت — npx deno test --allow-net --allow-env supabase/functions/_shared/prompt-cache.test.ts
// الجزء الأول بلا شبكة (شكل الطلب)، والثاني حيّ: طلبان متتاليان ببادئة واحدة (بلا بيانات حقيقية)،
// والثاني يجب أن يقرأ من المخزن. يُتخطّى الحيّ إن لم يُضبط ANTHROPIC_API_KEY.
import { cachedText, ephemeral, logCacheUsage, withCachedLastTool } from "./prompt-cache.ts";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

Deno.test("cachedText: نقطة تخزين على النص الثابت، والساعة عند طلبها", () => {
  const a = cachedText("ثابت");
  assert(a.type === "text" && a.text === "ثابت", "النص");
  assert(JSON.stringify(a.cache_control) === JSON.stringify({ type: "ephemeral" }), "5 دقائق افتراضاً");
  assert(JSON.stringify(cachedText("x", "1h").cache_control) === JSON.stringify({ type: "ephemeral", ttl: "1h" }), "ساعة");
  assert(JSON.stringify(ephemeral()) === '{"type":"ephemeral"}', "ephemeral");
});

Deno.test("withCachedLastTool: آخر أداة فقط، والكائنات الأصلية لا تُمسّ", () => {
  const shared = [{ name: "a", input_schema: {} }, { name: "b", input_schema: {} }];
  const out = withCachedLastTool(shared);
  assert(!("cache_control" in out[0]), "الأولى بلا نقطة");
  assert(JSON.stringify((out[1] as Record<string, unknown>).cache_control) === '{"type":"ephemeral"}', "الأخيرة بنقطة");
  assert(!("cache_control" in shared[1]), "المشترك لم يُعدَّل");
  assert(withCachedLastTool([]).length === 0, "الفارغ");
});

Deno.test("logCacheUsage لا يرمي على usage ناقص", () => {
  logCacheUsage("test", { input_tokens: 5 });
  logCacheUsage("test", null);
});

const KEY = Deno.env.get("ANTHROPIC_API_KEY");
Deno.test({
  name: "حيّ: الطلب الثاني ببادئة مطابقة يقرأ من المخزن",
  ignore: !KEY,
  async fn() {
    // بادئة ثابتة اصطناعية فوق الحد الأدنى لـ Sonnet 5 (١٠٢٤ توكن) — لا بيانات حقيقية
    const prefix = Array.from({ length: 220 }, (_, i) => `قاعدة تجريبية رقم ${i + 1}: هذا نص ثابت لاختبار التخزين المؤقت فقط.`).join("\n");
    const call = async (q: string) => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": KEY!, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-5",
          max_tokens: 64,
          system: [cachedText(prefix), { type: "text", text: `سؤال متغيّر: ${q}` }],
          messages: [{ role: "user", content: `أجب بكلمة واحدة: ${q}` }],
        }),
      });
      const d = await res.json();
      assert(res.ok, `HTTP ${res.status}: ${JSON.stringify(d).slice(0, 300)}`);
      logCacheUsage("test", d.usage);
      return d.usage;
    };
    const first = await call("واحد");
    const second = await call("اثنان");
    assert((first.cache_creation_input_tokens ?? 0) + (first.cache_read_input_tokens ?? 0) > 0, "الأول كتب أو قرأ");
    assert((second.cache_read_input_tokens ?? 0) > 0, `الثاني لم يقرأ من المخزن: ${JSON.stringify(second)}`);
  },
});
