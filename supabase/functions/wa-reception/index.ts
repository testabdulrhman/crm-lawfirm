// =============================================================
// wa-reception — مكتب الاستقبال على الواتساب: المحاماة ترد عن نفسها.
//
// قرار المدير 2026-09-23: «الـ Hub لا يكتب ردوداً أبداً؛ كل نظام يرد عن نفسه كما يفعل
// crm-iflas». فالـ Hub يستقبل ويتحقق ويسجّل ويعرّف الرقم، ثم يمرّر إلى هنا حدثاً منسّقاً
// موقّعاً (الرقم والهوية جاهزان)، وهنا يُقرَّر الرد ويُرسل عبر send-message في الـ Hub.
//
// ما انتقل إلى هنا من الـ Hub كما هو (flow.ts / arabic.ts / texts.ts / hours.ts):
//   التحية والصيغة المحايدة «حياكم الله»، وسعر الساعة وعرض الحجز (منطق v9)، والتأهيل،
//   وفحص معقولية الاسم، وقاعدة الإغلاق، وطمأنة صاحب الطلب، وسؤال من في النظامين.
// وما يُبنى هنا: مهلة التجميع، وحالة المحادثة (wa_reception_*)، والتسجيل عبر hub_ingest المحلي.
//
// النشر:  npx supabase functions deploy wa-reception --project-ref zwaahunavepleczuamuy --no-verify-jwt
// الأسرار: HUB_URL · HUB_SEND_KEY (مفتاح المحاماة في send-message) · HUB_EVENT_SECRET (توقيع الحدث)
//          HUB_RPC_SECRET (سرّ hub_ingest نفسه) · اختياري: BURST_WAIT_MS · BOT_HOURLY_LIMIT
// =============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { isCourtesyOnly } from './arabic.ts';
import { BrainOutput, think, vet } from './brain.ts';
import { ConvSnapshot, decide, FlowOutput, LEAD_FOLLOWUP_DAYS, Match } from './flow.ts';
import { isBusinessHours } from './hours.ts';
import { REQUEST_TYPES, T } from './texts.ts';

const supa = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`missing env ${k}`);
  return v;
};
const BURST_MS = () => Number(Deno.env.get('BURST_WAIT_MS') ?? 8_000);
const BOT_HOURLY = () => Number(Deno.env.get('BOT_HOURLY_LIMIT') ?? 20);
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json; charset=utf-8' } });

// ---------- التوقيع ----------
async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

interface HubEvent {
  hub_event: string; ref: string; ts: number; test?: boolean; ai?: boolean;
  text: string; media: string[]; media_label: string | null; message_type: string; received_at: string;
  phone_e164: string; phone_local: string; contact_name: string | null;
  hub_conversation_id: string; hatif_conversation_id: string | null; hatif_contact_id: string | null;
  matches: Match[]; match_source: 'index' | 'fallback' | 'none';
  human_until: string | null;
}

// ---------- الحالة ----------
type ConvRow = ConvSnapshot & { phone_e164: string; version: number; hub_conversation_id: string | null };
const COLS: (keyof ConvSnapshot)[] = [
  'state', 'assigned_system', 'bound_external_id', 'bind_expires_at', 'choice_options', 'choice_attempts',
  'intake_step', 'intake_data', 'intake_updated_at', 'pending', 'tags', 'notices', 'last_greeting_at', 'ooh_notice_at',
];

async function loadConv(key: string, hubConv: string): Promise<ConvRow> {
  const { data } = await supa.from('wa_reception_conversations').select('*').eq('phone_e164', key).maybeSingle();
  if (data) return data as ConvRow;
  await supa.from('wa_reception_conversations')
    .upsert({ phone_e164: key, hub_conversation_id: hubConv }, { onConflict: 'phone_e164', ignoreDuplicates: true });
  const { data: row, error } = await supa.from('wa_reception_conversations').select('*').eq('phone_e164', key).single();
  if (error) throw new Error(`conv load: ${error.message}`);
  return row as ConvRow;
}

// ---------- إعدادات المكتب (محلياً من lookup_values، لا تُثبَّت في أي مكان آخر) ----------
async function lookup(type: string, label: string): Promise<string | null> {
  const { data } = await supa.from('lookup_values').select('value').eq('type', type).eq('label', label).limit(1).maybeSingle();
  const v = String(data?.value ?? '').trim();
  return v || null;
}

// ---------- مهلة التجميع ----------
// من يكتب مشكلته على رسائل متتابعة يستحق رداً واحداً على مجموعها. ننتظر قليلاً، فإن جاء
// وارد أحدث تركنا القرار له ودخل نصّنا في نصّه — ولا تُلتقط بقيةُ كلامه جواباً لسؤالٍ لم يقصده.
async function settleBurst(key: string, msgId: number, at: string, text: string):
  Promise<{ superseded: true } | { superseded: false; text: string }> {
  if (BURST_MS() > 0) await new Promise((r) => setTimeout(r, BURST_MS()));
  const { data: newer } = await supa.from('wa_reception_messages').select('id')
    .eq('phone_e164', key).eq('direction', 'in').gt('created_at', at).limit(1);
  if (newer?.length) {
    await supa.from('wa_reception_messages').update({ superseded: true, decision: { superseded: true } }).eq('id', msgId);
    return { superseded: true };
  }
  // الدفعة = ما انتظر هذا الوارد وحده: كل ما جاء بعد آخر واردٍ قُرِّر عليه (غير منسوخ).
  // فما وصل أثناء تولّي موظفٍ قد قُرِّر عليه (بصمت) ولا يُضمّ — ولو لم يعقبه ردٌّ آلي.
  const { data: lastDecided } = await supa.from('wa_reception_messages').select('created_at')
    .eq('phone_e164', key).eq('direction', 'in').eq('superseded', false).lt('created_at', at)
    .order('created_at', { ascending: false }).limit(1);
  const since = lastDecided?.[0]?.created_at ?? new Date(Date.now() - 600_000).toISOString();
  const { data: ins } = await supa.from('wa_reception_messages').select('body')
    .eq('phone_e164', key).eq('direction', 'in').gt('created_at', since).lte('created_at', at)
    .order('created_at').limit(8);
  const joined = (ins ?? []).map((m: { body: string | null }) => (m.body ?? '').trim()).filter(Boolean).join('\n');
  return { superseded: false, text: joined.slice(0, 1500) || text };
}

// ---------- الرد الذكي (brain.ts) ----------
// RECEPTION_AI = off | sandbox | on — وفي sandbox لا يعمل إلا لأرقام RECEPTION_AI_PHONES.
const aiEnabledFor = (phone: string) => {
  const mode = (Deno.env.get('RECEPTION_AI') ?? 'off').trim();
  if (mode === 'on') return true;
  if (mode !== 'sandbox') return false;
  return (Deno.env.get('RECEPTION_AI_PHONES') ?? '').split(',').map((x) => x.trim()).includes(phone);
};

const TYPE_LABEL: Record<string, string> = {
  case: REQUEST_TYPES[0].label, consultation: REQUEST_TYPES[1].label, contract: REQUEST_TYPES[2].label,
  collection: REQUEST_TYPES[3].label, other: REQUEST_TYPES[4].label,
};

/** ما دار في المحادثة: الوارد بنصّه المجمَّع يوم قُرِّر عليه، والصادر كما أُرسل */
async function historyOf(key: string, before: string) {
  const { data } = await supa.from('wa_reception_messages')
    .select('direction, body, superseded, decision, created_at')
    .eq('phone_e164', key).lt('created_at', before).order('created_at', { ascending: false }).limit(24);
  return (data ?? []).reverse()
    .filter((m) => !(m.direction === 'in' && m.superseded))
    .map((m) => ({
      who: (m.direction === 'in' ? 'client' : 'office') as 'client' | 'office',
      text: String((m.direction === 'in' ? m.decision?.text : null) ?? m.body ?? '').slice(0, 600),
    }))
    .filter((h) => h.text.trim());
}

/** قرار النموذج ⇒ مخرجٌ بصيغة flow.ts نفسها، فتمضي الآثار (الإرسال والتسجيل) كما هي */
function fromBrain(b: BrainOutput, conv: ConvRow, ev: HubEvent, text: string, media: string[],
  meta: Record<string, unknown>): FlowOutput {
  const iso = new Date().toISOString();
  const notices = { ...(conv.notices ?? {}) } as Record<string, string>;
  const data = { ...(conv.intake_data ?? {}) } as Record<string, any>;
  // ما ليس مسألة قانونية (توظيف، تسويق، رسالة خاطئة): ردٌّ واحد يُغلق، ولا تأهيل ولا طلب للفريق
  if (b.legal_matter === false && conv.state !== 'intake_done') {
    if (b.action === 'reply') notices.salam_at = iso;
    notices.closed_at = iso;
    return {
      reply: b.action === 'reply' ? b.reply.trim() : null,
      patch: { notices, ...(conv.state === 'intake' ? {} : { state: 'new' as const }) },
      notify: [],
      route: { system: 'law', external_id: null, reason: 'default', confidence: 0.7,
               detail: { ai: true, language: b.language, not_legal: true, ...meta } },
    };
  }
  const c = b.collected ?? ({} as BrainOutput['collected']);
  if (c.name) data.name = c.name.slice(0, 80);
  if (c.request_type) {
    data.request_type = c.request_type === 'consultation' ? 'consultation' : 'case';
    data.request_label = TYPE_LABEL[c.request_type] ?? TYPE_LABEL.other;
  }
  // الطلب ما فهمه النموذج طلباً قانونياً (request_summary) — لا كل نصٍّ وارد: فرسالة توظيف
  // أو تسويق لا تصير «تأهيلاً جارياً» يرسله الكنس للفريق طلباً ناقصاً.
  if (c.request_summary) data.first_message = c.request_summary.slice(0, 1500);
  if (c.parties) data.parties = c.parties.slice(0, 300);
  if (c.deadlines) { data.deadlines = c.deadlines.slice(0, 300); data.has_deadline = !/^(لا|no|none)$/i.test(c.deadlines.trim()); }
  if (c.city) data.city = c.city.slice(0, 80);
  if (media.length) data.media = [...(data.media ?? []), ...media];
  const lawMatch = (ev.matches ?? []).find((m) => m.system === 'law');
  if (!data.law_external_id && lawMatch) data.law_external_id = lawMatch.external_id;

  const patch: Partial<ConvSnapshot> = { intake_data: data as ConvSnapshot['intake_data'] };
  const notify: FlowOutput['notify'] = [];
  const wasDone = conv.state === 'intake_done';
  const hasNeed = Boolean(data.request_type || data.first_message);
  const missing = !data.name ? 'name' : !hasNeed ? 'request_type' : !data.city ? 'city' : null;

  if (!wasDone && b.intake_complete && !missing) {
    patch.state = 'intake_done';
    patch.intake_step = null;
    patch.intake_updated_at = iso;
    patch.tags = [...new Set([...(conv.tags ?? []), 'طلب جديد'])];
    notify.push({ system: 'law', kind: 'wa_new_lead', external_id: data.law_external_id ?? null,
      payload: { ...data, source: 'واتساب', text, media, media_label: ev.media_label } });
  } else if (!wasDone && hasNeed) {
    patch.state = 'intake';
    patch.intake_step = missing as ConvSnapshot['intake_step'];
    patch.intake_updated_at = iso;
  } else if (wasDone && text && !b.closing && !isCourtesyOnly(text)) {
    // بعد اكتمال الطلب: كل جديدٍ ذي مضمون يصل الفريق مضافاً إلى طلبه
    notify.push({ system: 'law', kind: 'wa_lead_message', external_id: data.law_external_id ?? null,
      payload: { text, media, media_label: ev.media_label, name: data.name ?? null } });
  }
  if (b.handoff && !notify.length) {
    notify.push({ system: 'law', kind: 'wa_lead_message', external_id: data.law_external_id ?? null,
      payload: { text: `⚠️ يطلب موظفاً: ${text}`, media, media_label: ev.media_label, name: data.name ?? null } });
  }
  if (b.action === 'reply') notices.salam_at = iso;
  if (b.closing) notices.closed_at = iso;
  patch.notices = notices;

  return {
    reply: b.action === 'reply' ? b.reply.trim() : null,
    patch,
    notify,
    route: { system: 'law', external_id: data.law_external_id ?? null, reason: 'default', confidence: 0.7,
             detail: { ai: true, language: b.language, closing: b.closing || undefined, handoff: b.handoff || undefined, ...meta } },
  };
}

// ---------- الآثار: الرد والتسجيل والتسليم ----------
async function sendReply(ev: HubEvent, body: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${env('HUB_URL')}/functions/v1/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-key': env('HUB_SEND_KEY') },
    body: JSON.stringify({ system: 'law', phone_e164: ev.phone_e164, body, idempotency_key: `rx:${ev.ref}` }),
    signal: AbortSignal.timeout(20_000),
  });
  const out = await res.json().catch(() => ({}));
  // الموقوف (403) وقاطع الطوارئ (429) قرارٌ نهائي لا يُعاد؛ وما عداهما من فشلٍ يُعاد بإعادة الحدث
  if (!res.ok && res.status !== 403 && res.status !== 429) {
    throw new Error(`send-message ${res.status}: ${String(out?.message ?? '').slice(0, 200)}`);
  }
  return { status: res.status, ...out };
}

async function ingest(ev: HubEvent, out: FlowOutput, n: FlowOutput['notify'][number]) {
  const { data, error } = await supa.rpc('hub_ingest', {
    p_secret: env('HUB_RPC_SECRET'),
    p_ref: `rx:${ev.ref}:${n.kind}`,
    p_kind: n.kind,
    p_payload: {
      ...n.payload,
      external_id: n.external_id,
      phone_e164: ev.phone_e164, phone_local: ev.phone_local,
      hub_conversation_id: ev.hub_conversation_id, hatif_conversation_id: ev.hatif_conversation_id,
      hatif_contact_id: ev.hatif_contact_id, message_type: ev.message_type, received_at: ev.received_at,
      tags: out.patch.tags ?? [],
    },
  });
  if (error) throw new Error(`hub_ingest ${n.kind}: ${error.message}`);
  return data;
}

async function handoff(ev: HubEvent, out: FlowOutput, n: FlowOutput['notify'][number]) {
  const res = await fetch(`${env('HUB_URL')}/functions/v1/route-control`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-hub-key': env('HUB_SEND_KEY') },
    body: JSON.stringify({
      action: 'handoff_bankruptcy', phone_e164: ev.phone_e164, external_id: n.external_id,
      bind: out.patch.assigned_system === 'bankruptcy', ref: `${ev.ref}:${n.kind}`,
      text: n.payload.text, media: n.payload.media, media_label: n.payload.media_label,
      candidates: n.payload.candidates,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`route-control ${res.status}: ${String(body?.message ?? '').slice(0, 200)}`);
  return body;
}

// ---------- الكنس الدوري (كان في الـ Hub/hub-worker، وانتقل مع مكتب الاستقبال) ----------
// الـ Hub يرسل «نبضة» موقّعة كل ربع ساعة، ويُقرَّر هنا ما يُكنس:
//  (أ) من في النظامين لم يختر خلال 6 ساعات ⇒ يُسلَّم ما كتبه للفريقين بصمت، وتعود حالته جديدة.
//  (ب) تأهيلٌ متروك 24 ساعة ⇒ طلبٌ ناقص للفريق مرة واحدة (wa_partial_lead).
const localPhone = (e164: string) => (e164.startsWith('9665') ? `0${e164.slice(3)}` : e164);

async function hubAction(body: Record<string, unknown>) {
  const res = await fetch(`${env('HUB_URL')}/functions/v1/route-control`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-key': env('HUB_SEND_KEY') },
    body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`route-control ${res.status}: ${String(out?.message ?? '').slice(0, 200)}`);
  return out;
}

async function rpcIngest(ref: string, kind: string, payload: Record<string, unknown>) {
  const { data, error } = await supa.rpc('hub_ingest', { p_secret: env('HUB_RPC_SECRET'), p_ref: ref, p_kind: kind, p_payload: payload });
  if (error) throw new Error(`hub_ingest ${kind}: ${error.message}`);
  return data;
}

async function sweep() {
  const done = { unrouted: 0, partial: 0, errors: [] as string[] };
  const sixH = new Date(Date.now() - 6 * 3_600_000).toISOString();
  const { data: waiting } = await supa.from('wa_reception_conversations').select('*')
    .eq('state', 'awaiting_system').not('pending', 'is', null).lt('updated_at', sixH)
    .not('phone_e164', 'like', 'test:%').limit(50);
  for (const c of waiting ?? []) {
    try {
      const payload = {
        text: (c.pending?.texts ?? []).join('\n'), media: c.pending?.media ?? [], phone_e164: c.phone_e164,
        phone_local: localPhone(c.phone_e164), hub_conversation_id: c.hub_conversation_id, stale_reason: 'no_choice_6h',
      };
      await rpcIngest(`stale:${c.phone_e164}:${c.version}:law`, 'wa_unrouted', payload);
      await hubAction({ ...payload, action: 'unrouted_bankruptcy', ref: `stale:${c.phone_e164}:${c.version}` });
      await supa.from('wa_reception_conversations').update({
        state: 'new', pending: null, choice_attempts: 0, choice_options: null, version: c.version + 1, updated_at: new Date().toISOString(),
      }).eq('phone_e164', c.phone_e164).eq('version', c.version);
      done.unrouted++;
    } catch (e) { done.errors.push(String((e as Error).message).slice(0, 160)); }
  }

  const dayAgo = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { data: intakes } = await supa.from('wa_reception_conversations').select('*')
    .eq('state', 'intake').lt('intake_updated_at', dayAgo).is('notices->partial_lead', null)
    .not('phone_e164', 'like', 'test:%').limit(50);
  for (const c of intakes ?? []) {
    try {
      await rpcIngest(`partial:${c.phone_e164}:${c.intake_updated_at}`, 'wa_partial_lead', {
        ...(c.intake_data ?? {}), source: 'واتساب', partial: true,
        external_id: c.intake_data?.law_external_id ?? null,
        phone_e164: c.phone_e164, phone_local: localPhone(c.phone_e164), hub_conversation_id: c.hub_conversation_id,
      });
      await supa.from('wa_reception_conversations').update({
        notices: { ...(c.notices ?? {}), partial_lead: new Date().toISOString() }, version: c.version + 1,
      }).eq('phone_e164', c.phone_e164).eq('version', c.version);
      done.partial++;
    } catch (e) { done.errors.push(String((e as Error).message).slice(0, 160)); }
  }
  return done;
}

// ---------- الدخول ----------
Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const raw = await req.text();
  const sig = req.headers.get('x-hub-signature') ?? '';
  if (!sig || !safeEqual(sig, await hmacHex(env('HUB_EVENT_SECRET'), raw))) {
    return json({ error: 'bad_signature' }, 401);
  }
  let ev: HubEvent;
  try { ev = JSON.parse(raw); } catch { return json({ error: 'bad_json' }, 400); }
  if (Math.abs(Date.now() / 1000 - Number(ev.ts ?? 0)) > 900) return json({ ignored: 'stale_event' });
  if (ev.hub_event === 'sweep') {
    try { return json({ ok: true, ...(await sweep()) }); }
    catch (e) { return json({ error: 'sweep_failed', detail: String((e as Error).message).slice(0, 300) }, 500); }
  }
  if (ev.hub_event !== 'wa_message' || !ev.ref || !ev.phone_e164) return json({ ignored: 'unsupported_event' });

  // وضع الاختبار: حالةٌ في مجالٍ منفصل، ولا إرسال ولا تسجيل ولا تسليم — يُعاد القرار وحده
  const test = ev.test === true;
  const key = test ? `test:${ev.phone_e164}` : ev.phone_e164;
  const text = String(ev.text ?? '').trim();
  const media = Array.isArray(ev.media) ? ev.media : [];

  try {
    // ١) الوارد أولاً — ومرجع الحدث يمنع التكرار
    const { data: ins } = await supa.from('wa_reception_messages').upsert({
      phone_e164: key, event_ref: ev.ref, direction: 'in', body: text || null, media, media_label: ev.media_label,
    }, { onConflict: 'event_ref', ignoreDuplicates: true }).select('id, created_at, decision, superseded');
    let msg = ins?.[0];
    if (!msg) {
      const { data } = await supa.from('wa_reception_messages').select('id, created_at, decision, superseded')
        .eq('event_ref', ev.ref).single();
      msg = data!;
      if (msg.superseded || msg.decision?.done) return json({ ok: true, duplicate: true });
    }

    // ٢) قرارٌ محفوظ من محاولة سابقة لم تكتمل آثارها ⇒ تُكمَل الآثار ولا يُعاد القرار
    let out: FlowOutput | null = msg.decision?.out ?? null;

    if (!out) {
      // من سجّل طلبه عندنا للتوّ يصير في الفهرس «صاحب طلب قائم» — وهو طلبنا نحن. فما دام
      // تأهيله جارياً أو في مدة المتابعة، يبقى في مسار الأرقام الجديدة (قاعدة الإغلاق، والرد
      // الذكي، وإلحاق الجديد بطلبه) ولا يُعامَل صاحبَ طلبٍ قديم يُطمأن عليه.
      const { data: pre } = await supa.from('wa_reception_conversations')
        .select('state, intake_updated_at').eq('phone_e164', key).maybeSingle();
      const ownFlow = pre?.state === 'intake' || (pre?.state === 'intake_done' &&
        Date.now() - Date.parse(pre.intake_updated_at ?? '') < LEAD_FOLLOWUP_DAYS * 86_400_000);
      if (ownFlow) {
        ev.matches = (ev.matches ?? []).filter((m) =>
          !(m.system === 'law' && m.kind === 'client' && String(m.meta?.via ?? '') === 'active_request'));
      }
      // مهلة التجميع للرقم الجديد وحده (لا دائن ولا عميل)، وما لم يتولّه موظف
      const isNewcomer = !(ev.matches ?? []).some((m) =>
        m.system === 'bankruptcy' || (m.system === 'law' && m.kind === 'client'));
      let decideText = text;
      if (text && isNewcomer && !ev.human_until) {
        const b = await settleBurst(key, msg.id, msg.created_at, text);
        if (b.superseded) return json({ ok: true, superseded: true });
        decideText = b.text;
      }

      // قراءاتٌ مستقلة تُجرى معاً لا تباعاً
      const [fee, booking] = await Promise.all([
        isNewcomer ? lookup('consultation_config', 'hourly_fee') : Promise.resolve(null),
        lookup('office_info', 'booking_url'),
      ]);
      const bookingUrl = booking ?? undefined;

      // ٣) القرار على لقطةٍ بقفلٍ تفاؤلي: رسالتان متزامنتان لا تتسابقان على الحالة
      let brain: { out: BrainOutput; ms: number; usage: unknown; model: string } | null = null;
      let aiError: string | null = null;
      for (let attempt = 0; attempt < 4 && !out; attempt++) {
        const [conv, { count }] = await Promise.all([
          loadConv(key, ev.hub_conversation_id),
          supa.from('wa_reception_messages').select('id', { count: 'exact', head: true })
            .eq('phone_e164', key).eq('direction', 'out').gte('created_at', new Date(Date.now() - 3_600_000).toISOString()),
        ]);
        const snap = { ...Object.fromEntries(COLS.map((c) => [c, conv[c]])), human_until: ev.human_until } as ConvSnapshot;
        // القواعد أولاً: هي الحارس (تولّي موظف، الصمت بعد الإغلاق، حد الساعة) والبديل عند تعثّر النموذج
        let o = decide({
          now: new Date(), conv: snap, matches: ev.matches ?? [], matchSource: ev.match_source ?? 'none',
          msg: { text: decideText, mediaUrl: media[0] ?? null, mediaLabel: ev.media_label },
          botRepliesLastHour: count ?? 0, botHourlyLimit: BOT_HOURLY(),
          consultationFee: fee, bookingUrl,
        });
        // المجاملة الخالصة للقواعد وحدها: قاعدة الإغلاق (ردٌّ قصير أول مرة، ثم صمت) حكمٌ ثابت لا اجتهاد
        const courtesyOnly = isCourtesyOnly(decideText);
        if (courtesyOnly && o.reply === T.thanksReply
            && /[A-Za-z]/.test(decideText) && !/[\u0600-\u06FF]/.test(decideText)) {
          o.reply = "You're most welcome. We're here if you need anything else.";   // الإغلاق بلغة المرسل
        }
        const eligible = (aiEnabledFor(ev.phone_e164) || (test && ev.ai === true))
          && isNewcomer && !ev.human_until && decideText.trim() !== '' && !courtesyOnly
          && ['new', 'intake', 'intake_done'].includes(conv.state)
          && o.route.detail?.closing !== 'silent_after_close' && o.route.reason !== 'rate_limited';
        if (eligible) {
          try {
            brain ??= await think({
              history: await historyOf(key, msg.created_at), current: decideText,
              collected: { ...(conv.intake_data ?? {}) } as Record<string, unknown>, greeted: Boolean(conv.notices?.salam_at),
              intakeDone: conv.state === 'intake_done', businessHoursNow: isBusinessHours(new Date()),
              fee, bookingUrl: bookingUrl ?? 'https://app.redwan.sa/#/book',
              knownName: (ev.matches ?? []).find((m) => m.system === 'law')?.name ?? null,
            });
            const bad = vet(brain.out, fee, bookingUrl ?? 'https://app.redwan.sa/#/book', decideText);
            if (bad) throw new Error(`حاجز: ${bad}`);
            o = fromBrain(brain.out, conv, ev, decideText, media, { model: brain.model, ms: brain.ms });
          } catch (e) {
            aiError = String((e as Error).message).slice(0, 200);
            console.error('wa-reception brain', ev.ref, aiError);   // يمضي ردّ القواعد
            o.route.detail = { ...(o.route.detail ?? {}), ai_fallback: aiError };
          }
        }
        const patch = Object.fromEntries(Object.entries(o.patch).filter(([k]) => (COLS as string[]).includes(k)));
        const { data: upd } = await supa.from('wa_reception_conversations')
          .update({ ...patch, version: conv.version + 1, updated_at: new Date().toISOString() })
          .eq('phone_e164', key).eq('version', conv.version).select('phone_e164');
        if (upd?.length) out = o;
      }
      if (!out) throw new Error('conversation conflict: exhausted retries');
      msg.decision = { out, done: false, test, text: decideText,
        ai: brain ? { ms: brain.ms, usage: brain.usage, model: brain.model } : undefined, ai_error: aiError ?? undefined };
      await supa.from('wa_reception_messages').update({ decision: msg.decision }).eq('id', msg.id);
    }

    if (test) {
      await supa.from('wa_reception_messages').update({ decision: { ...(msg.decision ?? {}), out, done: true, test, text: msg.decision?.text } }).eq('id', msg.id);
      if (out.reply) await supa.from('wa_reception_messages').insert({ phone_e164: key, direction: 'out', body: out.reply, event_ref: `out:${ev.ref}` });
      return json({ ok: true, test: true, reply: out.reply, route: out.route, notify: out.notify.map((n) => `${n.system}:${n.kind}`), patch: out.patch });
    }

    // ٤) الآثار — كلها بمفاتيح منع تكرار، فإعادة الحدث لا تُكرّر رداً ولا طلباً
    const effects: Record<string, unknown> = {};
    if (out.reply) {
      effects.send = await sendReply(ev, out.reply);
      await supa.from('wa_reception_messages').upsert(
        { phone_e164: key, direction: 'out', body: out.reply, event_ref: `out:${ev.ref}` },
        { onConflict: 'event_ref', ignoreDuplicates: true });
    }
    // رقم الرمل (RECEPTION_SANDBOX_PHONES): لا يُسجَّل له طلبٌ ولا إخطارٌ حقيقي — يُقيَّد المقصود وحده
    const sandbox = (Deno.env.get('RECEPTION_SANDBOX_PHONES') ?? '').split(',').map((x) => x.trim()).includes(ev.phone_e164);
    for (const n of out.notify) {
      effects[`${n.system}:${n.kind}`] = sandbox ? { sandbox: true, payload: n.payload }
        : n.system === 'law' ? await ingest(ev, out, n) : await handoff(ev, out, n);
    }
    // يُضاف الأثر إلى القرار ولا يُمسح ما فيه (النص المجمَّع يقرؤه الرد الذكي تاريخاً للمحادثة)
    await supa.from('wa_reception_messages').update({ decision: { ...(msg.decision ?? {}), out, done: true, effects } }).eq('id', msg.id);
    return json({ ok: true, reply: Boolean(out.reply), route: out.route, notify: out.notify.map((n) => `${n.system}:${n.kind}`) });
  } catch (e) {
    console.error('wa-reception', ev.ref, e);
    // 500 مقصود: يعيد الـ Hub التسليم من طابوره، والقرار المحفوظ يمنع ردّاً ثانياً
    return json({ error: 'processing_failed', detail: String((e as Error).message).slice(0, 300) }, 500);
  }
});
