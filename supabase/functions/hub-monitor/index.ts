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
const ACTIONS = new Set(['summary', 'phone', 'event', 'templates', 'staff_list', 'staff_set']);

// ---------- قسمان من المحاماة نفسها ----------
// مكتب الاستقبال انتقل إلى هنا (wa-reception، 2026-09-23)، فطلباته وتأهيله المتوقف في هذه
// القاعدة لا في الـ Hub. تُؤخذ اللوحة من الـ Hub كما هي، ويُستبدل بهذين القسمين ما هنا.
const riyadh = (iso: string | null) => {
  if (!iso) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

async function lawSections() {
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: reqs } = await admin.from('incoming_requests')
    .select('id, client_name, client_phone, case_type, description, created_at')
    .eq('created_by', 'redwan-hub').gte('created_at', since)
    .order('created_at', { ascending: false }).limit(50);
  const bot_requests = (reqs ?? []).map((r) => ({
    at: riyadh(r.created_at),
    phone: r.client_phone,
    name: r.client_name,
    request_label: r.case_type,
    city: /المدينة: (.+)/.exec(r.description ?? '')?.[1]?.trim() ?? null,
    partial: /غير مكتمل/.test(r.description ?? ''),
    status: 'delivered',          // الطلب هنا ⇒ وصل
    request_id: r.id,
  }));

  const twoH = new Date(Date.now() - 2 * 3_600_000).toISOString();
  const { data: convs } = await admin.from('wa_reception_conversations')
    .select('phone_e164, intake_step, intake_data, intake_updated_at')
    .eq('state', 'intake').lt('intake_updated_at', twoH).not('phone_e164', 'like', 'test:%')
    .order('intake_updated_at', { ascending: true }).limit(50);
  const stalled_intakes = (convs ?? []).map((c) => ({
    phone: c.phone_e164,
    step: c.intake_step,
    name: c.intake_data?.name ?? null,
    since: riyadh(c.intake_updated_at),
    hours: Math.round((Date.now() - Date.parse(c.intake_updated_at)) / 3_600_000),
  }));
  return { bot_requests, stalled_intakes };
}

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
    if (action === 'summary' && res.ok) {
      try {
        const out = JSON.parse(text);
        if (out?.data) Object.assign(out.data, await lawSections());
        return json(out);
      } catch (e) {
        console.error('hub-monitor law sections', e);   // تعذّر القسمان ⇒ تبقى لوحة الـ Hub كما هي
      }
    }
    return new Response(text, {
      status: res.status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('hub-monitor', e);
    return json({ error: 'hub_unreachable', message: 'تعذّر الوصول إلى الـ Hub' }, 502);
  }
});
