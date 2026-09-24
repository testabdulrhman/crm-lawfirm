// مُعطّلة. كانت دالة استيراد لمرة واحدة لأرشيف آخر ١٢ شهراً (٢٠٢٥-٠٨ → اليوم، ٥٩٦ رسالة).
// تُحذف من لوحة Supabase.
Deno.serve(() => new Response(JSON.stringify({ error: "gone" }), { status: 410, headers: { "Content-Type": "application/json" } }));
