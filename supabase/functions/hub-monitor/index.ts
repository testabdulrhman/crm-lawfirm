// =============================================================
// hub-monitor — وسيط صفحة مراقبة الاتصالات (redwan-hub) للمدير وحده.
//
// لماذا وسيط؟ جداول الـ Hub مقفلة على مفتاح الخدمة، ولا يجوز أن يصل المتصفحَ
// مفتاحُ خدمة ألبتة. فهنا: البوابة تتحقق من الجلسة (verify_jwt=true)، وهذه
// الدالة تتحقق من الدور (is_director && is_active) من team_members، ثم تنادي
// الـ Hub بمفتاح قراءة يسكن بيئة هذه الدالة وحدها.
//
// النشر:
//   npx supabase functions deploy hub-monitor --project-ref zwaahunavepleczuamuy
// الأسرار: HUB_URL · HUB_KEY_MONITOR
// =============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

const admin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
);

// أفعال القراءة مسموحة للمدير؛ والكتابة (staff_set) كذلك — وهي الوحيدة
const ACTIONS = new Set(['summary', 'phone', 'event', 'staff_list', 'staff_set']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  // ١) الجلسة: البوابة تحققت من التوقيع، وهنا نستخرج صاحبها
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ error: 'unauthorized', message: 'لا جلسة' }, 401);
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
  const uid = userData?.user?.id;
  if (userErr || !uid) return json({ error: 'unauthorized', message: 'جلسة غير صالحة' }, 401);

  // ٢) الدور: مدير نشط وإلا لا شيء
  const { data: member } = await admin
    .from('team_members')
    .select('id, name, is_director, is_active')
    .eq('auth_id', uid)
    .maybeSingle();

  if (!member || member.is_active === false || member.is_director !== true) {
    console.log('hub-monitor: رُفض غير مدير', uid);
    return json({ error: 'forbidden', message: 'الصفحة للمدير وحده' }, 403);
  }

  // ٣) الفعل
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const action = String(body.action ?? '');
  if (!ACTIONS.has(action)) return json({ error: 'unknown_action' }, 400);

  const hubUrl = Deno.env.get('HUB_URL');
  const hubKey = Deno.env.get('HUB_KEY_MONITOR');
  if (!hubUrl || !hubKey) return json({ error: 'not_configured', message: 'HUB_URL/HUB_KEY_MONITOR غير مضبوطين' }, 503);

  try {
    const res = await fetch(`${hubUrl}/functions/v1/monitor-read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hub-key': hubKey },
      // الفاعل يُمرَّر من هنا لا من المتصفح — فلا يُنتحل في سجل أرقام الفريق
      body: JSON.stringify({ ...body, action, actor: `${member.name} (${member.id})` }),
      signal: AbortSignal.timeout(25_000),
    });
    const text = await res.text();
    return new Response(text, {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('hub-monitor', e);
    return json({ error: 'hub_unreachable', message: 'تعذّر الوصول إلى الـ Hub' }, 502);
  }
});
