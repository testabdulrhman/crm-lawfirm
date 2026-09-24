// مُعطّلة: كانت فحصاً لمرة واحدة (هل تدعم هاتف إنشاء قوالب واتساب برمجياً؟ الجواب: لا).
// تُحذف من لوحة Supabase — واجهة MCP لا تحذف الدوال.
Deno.serve(() => new Response(JSON.stringify({ disabled: true }), { status: 410, headers: { "Content-Type": "application/json" } }));
