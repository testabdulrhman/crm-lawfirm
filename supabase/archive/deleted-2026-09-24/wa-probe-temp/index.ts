// مُعطّلة. كانت دالة فحص لمرة واحدة (أرشيف Evolution وتسليم الوسائط). تُحذف من لوحة Supabase.
Deno.serve(() => new Response(JSON.stringify({ error: "gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
