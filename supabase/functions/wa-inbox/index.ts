import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// =============================================================
// wa-inbox — صندوق «العملاء»: الموظف يقرأ محادثة العميل على الواتساب ويردّ عليه من النظام
// (قرار المدير 2026-10-06). النقاشات تبقى للفريق؛ والإرسال للعميل من هنا وحده.
//
//   thread {phone}               ⇒ المحادثة كاملة من الـHub (law_thread): الوارد، وردود البوت،
//                                   وردود موظفينا (بأسمائهم من wa_outbox)، وردود لوحة هاتف — ونافذة الـ24 ساعة.
//   send   {phone, body, mode}   ⇒ نصٌّ حر داخل النافذة؛ وخارجها (mode='template') داخل القالب
//                                   المعتمد «followup» (حياك الله … {{1}} … شكراً لك).
//   to_request {phone, request_id} ⇒ ينسخ مرفقات المحادثة ونصّها إلى ملفات طلب وارد (2026-10-14).
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

// ---------- محادثة ← طلب وارد (2026-10-14) ----------
// «طلب جديد» من رأس المحادثة: بعد إنشاء الطلب تُنسخ مرفقات الواتساب (من العميل ومنّا) إلى ملفات الطلب
// في مخزننا — روابط هاتف (voxa على Aliyun) لا نملك بقاءها — ومعها نص المحادثة ملفاً يقرؤه ملخص الذكاء.
// يُعاد تشغيله بأمان: مسار كل مرفق مشتق من رابطه، فما نُسخ قبلُ لا يتكرر.

const MAX_MEDIA = 30;
const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
const phoneKey = (p: string | null | undefined) => String(p ?? '').replace(/\D/g, '').slice(-9);
const EXT_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/mp4': 'mp4',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx', 'application/msword': 'doc',
};
/** نص رسالة المستند هو اسم ملفه — يصير اسمه في الطلب ولا يُكرَّر في السطر */
const isFileName = (t: string) => /\.[a-z0-9]{2,5}$/i.test(t) && t.length < 120;
const KIND_LABEL = (mime: string, type: string | null) =>
  mime.startsWith('image/') || type === 'image' ? 'صورة'
  : mime.startsWith('audio/') || type === 'audio' || type === 'voice' ? 'مقطع صوتي'
  : mime.startsWith('video/') || type === 'video' ? 'مقطع مرئي'
  : 'مستند';

async function sha(s: string) {
  const h = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 16);
}
const riyadh = (iso: string) =>
  new Date(Date.parse(iso) + 3 * 3600_000).toISOString().slice(0, 16).replace('T', ' ');

// deno-lint-ignore no-explicit-any
async function copyToRequest(asUser: any, phone: string, requestId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('طلب غير صالح');
  // الطلب بصلاحيات الموظف نفسه — ورقمه رقم المحادثة، فلا تُلصق محادثة بطلب غيرها
  const { data: r } = await asUser.from('incoming_requests').select('id, client_phone').eq('id', requestId).maybeSingle();
  if (!r) throw new Error('لا صلاحية على هذا الطلب أو غير موجود');
  if (r.client_phone && phoneKey(r.client_phone) !== phoneKey(phone)) throw new Error('رقم الطلب غير رقم المحادثة');

  const hub = await hubThread(phone);
  const msgs = hub.messages.filter((m) => m.type !== 'sticker' && m.type !== 'reaction');
  const { data: existing } = await admin.from('request_documents').select('file_url')
    .eq('request_id', requestId).is('deleted_at', null);
  const have = new Set((existing ?? []).map((d: { file_url: string }) => d.file_url));
  const pub = (path: string) => `${URL_}/storage/v1/object/public/documents/${path}`;

  const copied: string[] = [];
  const failed: string[] = [];
  const lines: string[] = [];
  let n = 0;
  for (const m of msgs) {
    const who = m.direction === 'in' ? 'العميل' : 'المكتب';
    const text = (m.body ?? m.rendered ?? '').trim();
    let note = '';
    if (m.media && n < MAX_MEDIA) {
      n++;
      const mime = String(m.mime ?? '').split(';')[0].toLowerCase();
      const urlExt = (m.media.split('?')[0].match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? '').toLowerCase();
      const ext = EXT_BY_MIME[mime] ?? (urlExt || 'bin');
      const label = `${KIND_LABEL(mime, m.type)} ${m.direction === 'in' ? 'من العميل' : 'من المكتب'} — ${riyadh(m.at).slice(0, 10).replace(/-/g, '/')}`;
      // اسم الملف كما أرسله العميل إن جاء نصاً بامتداد (المستندات غالباً)، وإلا وصفٌ بنوعه وتاريخه
      const name = isFileName(text) ? text : `${label}.${ext}`;
      const path = `request_documents/wa/${requestId}/${await sha(m.media)}.${ext}`;
      note = ` [📎 ${name}]`;
      if (!have.has(pub(path))) {
        try {
          const res = await fetch(m.media, { signal: AbortSignal.timeout(30_000) });
          if (!res.ok) throw new Error(String(res.status));
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length > MAX_MEDIA_BYTES) throw new Error('حجم');
          const type = mime || (res.headers.get('content-type') ?? '').split(';')[0] || 'application/octet-stream';
          const up = await admin.storage.from('documents').upload(path, bytes, { contentType: type, upsert: true });
          if (up.error) throw new Error(up.error.message);
          const { error } = await asUser.from('request_documents').insert({
            request_id: requestId, name, file_url: pub(path), file_type: type, file_size: bytes.length,
          });
          if (error) throw new Error(error.message);
          have.add(pub(path));
          copied.push(name);
        } catch (e) {
          console.error('wa media', (e as Error).message);
          failed.push(name);
        }
      }
    }
    if (text || note) lines.push(`[${riyadh(m.at)}] ${who}: ${m.media && isFileName(text) ? '' : text}${note}`.trim());
  }

  // نص المحادثة ملفاً واحداً يُستبدل في كل نسخ (آخر حالة للمحادثة)
  let chat = false;
  if (lines.length) {
    const body = `محادثة الواتساب مع ${phone} — حتى ${riyadh(new Date().toISOString())} (بتوقيت الرياض)\n\n${lines.join('\n')}\n`;
    const bytes = new TextEncoder().encode('\uFEFF' + body);
    const path = `request_documents/wa/${requestId}/chat.txt`;
    const up = await admin.storage.from('documents').upload(path, bytes, { contentType: 'text/plain; charset=utf-8', upsert: true });
    if (!up.error) {
      if (!have.has(pub(path))) {
        await asUser.from('request_documents').insert({
          request_id: requestId, name: 'نص محادثة الواتساب.txt', file_url: pub(path), file_type: 'text/plain', file_size: bytes.length,
        });
      } else {
        await admin.from('request_documents').update({ file_size: bytes.length }).eq('request_id', requestId).eq('file_url', pub(path));
      }
      chat = true;
    }
  }
  return { ok: true, copied, failed, chat, messages: msgs.length };
}

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

    if (b.action === 'to_request') {
      return json(await copyToRequest(asUser, phone, String(b.request_id ?? '')));
    }

    return fail(400, 'فعل غير معروف');
  } catch (e) {
    console.error('wa-inbox', b.action, e);
    return fail(500, String((e as Error).message).slice(0, 300));
  }
});
