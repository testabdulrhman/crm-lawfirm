import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================
// wa-inbox — صندوق «العملاء»: الموظف يقرأ محادثة العميل على الواتساب ويردّ عليه من النظام
// (قرار المدير 2026-10-06). النقاشات تبقى للفريق؛ والإرسال للعميل من هنا وحده.
//
//   thread {phone}               ⇒ المحادثة كاملة من الـHub (law_thread): الوارد، وردود البوت،
//                                   وردود موظفينا (بأسمائهم من wa_outbox)، وردود لوحة هاتف — ونافذة الـ24 ساعة.
//   send   {phone, body, mode}   ⇒ نصٌّ حر داخل النافذة؛ وخارجها (mode='template') داخل القالب
//                                   المعتمد «followup» (حياك الله … {{1}} … شكراً لك).
//
// الرؤية من القاعدة نفسها (can_see_wa_thread بجلسة الموظف): مسؤول الملف وفريقه، والمدير وراكان
// يرون الكل، و«غير المصنّف» لهما وحدهما.
//
// النشر:  npx supabase functions deploy wa-inbox --project-ref zwaahunavepleczuamuy
// الأسرار: HUB_URL · HUB_SEND_KEY (الإرسال) · HUB_KEY_MONITOR (القراءة) — مشتركة مع wa-reception وhub-monitor
// =============================================================

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });
const fail = (s: number, message: string, extra: Record<string, unknown> = {}) => json({ error: true, message, ...extra }, s);

const URL_ = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(URL_, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};

const FOLLOWUP = 'followup';

type HubMsg = {
  id: string; at: string; direction: 'in' | 'out'; sender: string | null; system: string | null;
  type: string | null; body: string | null; media: string | null; mime: string | null; status: string | null;
  idem: string | null; template: string | null; rendered: string | null;
};

async function hubThread(phone: string): Promise<{ window_expires_at: string | null; messages: HubMsg[] }> {
  const res = await fetch(`${env('HUB_URL')}/functions/v1/monitor-read`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-key': env('HUB_KEY_MONITOR') },
    body: JSON.stringify({ action: 'law_thread', phone, actor: 'wa-inbox' }),
    signal: AbortSignal.timeout(20_000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok || !out?.data) throw new Error(`تعذّر جلب المحادثة من الـHub (${res.status}) ${out?.detail ?? out?.error ?? ''}`.trim());
  if (out.data.error) throw new Error(out.data.error);
  return { window_expires_at: out.data.window_expires_at ?? null, messages: out.data.messages ?? [] };
}

/** متغيّر القالب لا يقبل أسطراً ولا جدولة ولا أكثر من أربع مسافات متتالية (قاعدة واتساب) */
const flatten = (s: string) => s.replace(/\s*\n+\s*/g, ' — ').replace(/\t/g, ' ').replace(/ {4,}/g, '   ').trim();

const HUB_ERRORS: Record<string, string> = {
  template_required: 'انتهت نافذة الـ24 ساعة منذ آخر رسالة من العميل؛ أرسلها داخل القالب المعتمد «متابعة».',
  opted_out: 'هذا الرقم طلب إيقاف الرسائل، فلا يُرسل إليه شيء.',
  circuit_breaker: 'بلغ هذا الرقم حدّ الرسائل في الساعة أو اليوم (قاطع الطوارئ)، فأُوقف الإرسال إليه مؤقتاً.',
  send_failed: 'رفضت منصة هاتف الإرسال.',
  template_not_approved: 'القالب «متابعة» غير معتمد حالياً في الـHub.',
  outbound_disabled: 'الإرسال عبر الـHub موقوف مؤقتاً.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'POST فقط');

  const auth = req.headers.get('Authorization') ?? '';
  const jwt = auth.replace(/^Bearer\s+/i, '');
  if (!jwt) return fail(401, 'لا جلسة');
  const { data: u } = await admin.auth.getUser(jwt);
  if (!u?.user) return fail(401, 'جلسة غير صالحة');
  const { data: me } = await admin.from('team_members').select('id, name, is_active').eq('auth_id', u.user.id).maybeSingle();
  if (!me || me.is_active === false) return fail(403, 'الحساب غير نشط');

  // عميلٌ بجلسة الموظف: كل فحص رؤية يمرّ بسياسات القاعدة نفسها
  const asUser = createClient(URL_, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return fail(400, 'طلب غير صالح'); }
  const phone = String(b.phone ?? '').replace(/\D/g, '');
  if (phone.length < 9) return fail(400, 'رقم غير صالح');

  const { data: canSee, error: seeErr } = await asUser.rpc('can_see_wa_thread', { p_phone: phone });
  if (seeErr) return fail(500, `تعذّر التحقق من الصلاحية: ${seeErr.message}`);
  if (canSee !== true) return fail(403, 'هذه المحادثة ليست ضمن ملفاتك');

  try {
    if (b.action === 'thread') {
      const [hub, { data: sent }] = await Promise.all([
        hubThread(phone),
        admin.from('wa_outbox').select('idempotency_key, member_id, team_members(name)').eq('phone_e164', phone)
          .order('created_at', { ascending: false }).limit(500),
      ]);
      const byKey = new Map((sent ?? []).map((s: any) => [s.idempotency_key, s]));
      const messages = hub.messages.map((m) => {
        const mine = m.idem ? byKey.get(m.idem) : undefined;
        const who = m.direction === 'in' ? 'client'
          : mine ? 'member'
          : m.sender === 'bot' ? 'bot'
          : m.sender === 'staff' ? 'hatif_staff'
          : 'system';
        return {
          id: m.id, at: m.at, direction: m.direction, who,
          member_id: mine?.member_id ?? null, member_name: (mine as any)?.team_members?.name ?? null,
          body: m.body ?? m.rendered ?? null, type: m.type, media: m.media, mime: m.mime, status: m.status,
          template: m.template,
        };
      });
      const exp = hub.window_expires_at ? Date.parse(hub.window_expires_at) : 0;
      await asUser.rpc('wa_mark_read', { p_phone: phone });
      return json({ ok: true, window_expires_at: hub.window_expires_at, window_open: exp > Date.now() + 60_000, messages });
    }

    if (b.action === 'send') {
      const body = String(b.body ?? '').trim();
      if (!body) return fail(400, 'اكتب الرسالة أولاً');
      if (body.length > 4000) return fail(400, 'الرسالة أطول من 4000 حرف');
      const mode = b.mode === 'template' ? 'template' : 'text';
      const clientKey = String(b.client_id ?? '').replace(/[^\w-]/g, '').slice(0, 64) || crypto.randomUUID();
      const idem = `inbox:${clientKey}`;
      const payload = mode === 'template'
        ? { template: FOLLOWUP, params: [flatten(body).slice(0, 1000)] }
        : { body };

      const { data: row, error: insErr } = await admin.from('wa_outbox').upsert({
        phone_e164: phone, member_id: me.id, body, template: mode === 'template' ? FOLLOWUP : null,
        idempotency_key: idem, status: 'sending',
      }, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id').maybeSingle();
      if (insErr) throw new Error(insErr.message);
      if (!row) return json({ ok: true, duplicate: true });

      const res = await fetch(`${env('HUB_URL')}/functions/v1/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-hub-key': env('HUB_SEND_KEY') },
        body: JSON.stringify({ system: 'law', phone_e164: phone, idempotency_key: idem, ...payload }),
        signal: AbortSignal.timeout(25_000),
      });
      const out = await res.json().catch(() => ({}));
      const okSend = res.ok && out?.ok !== false;
      const reason = okSend ? null : (HUB_ERRORS[out?.error] ?? out?.message ?? `فشل الإرسال (${res.status})`);
      await admin.from('wa_outbox').update({ status: okSend ? 'sent' : 'failed', error: reason }).eq('id', row.id);
      if (!okSend) return fail(res.status === 422 ? 422 : 502, reason!, { code: out?.error ?? null });

      const preview = (mode === 'template' ? '📨 ' : '') + body.slice(0, 140);
      await admin.from('wa_threads').update({
        last_message_at: new Date().toISOString(), last_preview: preview, last_direction: 'out',
      }).eq('phone_e164', phone);
      await asUser.rpc('wa_mark_read', { p_phone: phone });
      return json({ ok: true, status: out?.status ?? 'sent' });
    }

    return fail(400, 'فعل غير معروف');
  } catch (e) {
    console.error('wa-inbox', b.action, e);
    return fail(500, String((e as Error).message).slice(0, 300));
  }
});
