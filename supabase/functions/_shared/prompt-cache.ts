// التخزين المؤقت للتعليمات الثابتة (prompt caching) — أدوات صغيرة مشتركة بلا استيرادات خارجية.
//
// المبدأ: الطلب يُعرض بالترتيب tools ← system ← messages، والتخزين مطابقة بادئة؛ فأي بايت يتغيّر داخل
// الجزء الثابت يبطل ما بعده. لذا: الثابت أولاً بنقطة تخزين على آخر جزء ثابت، وما يتغيّر (اسم الموظف،
// التاريخ، المرفق، سياق الطلب) بعدها. والمحادثات متعددة الجولات تُضاف لها نقطة تلقائية أعلى الطلب.
// الحد الأدنى للبادئة المخزّنة: ٥١٢ توكن (Opus 5.5)، و١٠٢٤ (Sonnet 5)، و٤٠٩٦ (Haiku 4.5) — وما دونه يُتجاهل بصمت.

export type CacheTTL = "5m" | "1h";

export const ephemeral = (ttl: CacheTTL = "5m") =>
  ttl === "1h" ? { type: "ephemeral" as const, ttl: "1h" as const } : { type: "ephemeral" as const };

/** نصٌّ ثابت بنقطة تخزين عليه — يوضع في system قبل أي جزء متغيّر */
export function cachedText(text: string, ttl: CacheTTL = "5m") {
  return { type: "text" as const, text, cache_control: ephemeral(ttl) };
}

/** نسخة من قائمة الأدوات بنقطة تخزين على آخرها — بلا تعديل الكائنات المشتركة بين الدوال */
export function withCachedLastTool<T extends Record<string, unknown>>(tools: T[], ttl: CacheTTL = "5m"): T[] {
  if (!tools.length) return tools;
  const last = tools[tools.length - 1];
  return [...tools.slice(0, -1), { ...last, cache_control: ephemeral(ttl) }];
}

/** سطر واحد لكل طلب: كم كُتب في المخزن وكم قُرئ منه وكم بلا تخزين */
export function logCacheUsage(label: string, usage: Record<string, unknown> | null | undefined) {
  if (!usage) return;
  console.log(JSON.stringify({
    prompt_cache: label,
    input_tokens: usage.input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
  }));
}
