// مُعطّلة مؤقتاً. كانت تحمّل وسائط الرسائل المستوردة من Evolution.
// تُعاد عند الحاجة لتوسيع المدى، وتُحذف من لوحة Supabase بعد الانتهاء.
Deno.serve(() => new Response(JSON.stringify({ error: "gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
