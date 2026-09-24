// معطّلة — انتهت مهمتها.
Deno.serve(() => new Response(JSON.stringify({ disabled: true }), { status: 410, headers: { "Content-Type": "application/json" } }));