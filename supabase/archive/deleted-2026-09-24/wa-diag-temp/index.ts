// مُعطّلة. كانت تشخيصاً لمرة واحدة لانقطاع ٢٠٢٦-٠٧-٢٧ (رمز 403 من واتساب).
// تُحذف من لوحة Supabase.
Deno.serve(() => new Response(JSON.stringify({ error: "gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
