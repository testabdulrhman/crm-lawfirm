// جلب كل الصفوف على صفحات — Supabase يقطع أي استعلام عند ١٠٠٠ صف بصمت (max-rows)، فقائمة تتجاوزها
// تختفي آخرها بلا خطأ (مراجعة 2026-11-15: الوكالات ٥١٢ وتقترب). الترتيب يجب أن يكون ثابتاً (أضف .order('id')).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchAllRows<T>(build: (from: number, to: number) => PromiseLike<{ data: any; error: any }>): Promise<T[]> {
  const PAGE = 1000
  const out: T[] = []
  for (let from = 0; from < 50000; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < PAGE) break
  }
  return out
}
