// =============================================================
// آلة حالة الواتساب — دالة صافية بلا قاعدة بيانات ولا شبكة.
// المدخل: لقطة المحادثة + المطابقات + الرسالة. المخرج: رد واحد (أو لا شيء)،
// ورقعة للمحادثة، وقرار توجيه، وإخطارات للنظامين.
// الموجّه (router.ts) هو من ينفّذ المخرج؛ وهنا القرار وحده، فيُختبر مباشرة.
// =============================================================

import {
  asksLegalOpinion, isCourtesyOnly, isNegative, isStartRequest, isStopRequest, newcomerIntent, pickName,
  parseOptionNumber, parseSystemChoice,
} from './arabic.ts';
import { isBusinessHours } from './hours.ts';
import { INTAKE_QUESTIONS, INTAKE_STEPS, IntakeStep, REQUEST_TYPES, T } from './texts.ts';

export type System = 'law' | 'bankruptcy';
export type ConvState = 'new' | 'awaiting_system' | 'bound' | 'intake' | 'intake_done';
export type Reason =
  | 'index_match' | 'customer_choice' | 'live_fallback' | 'default'
  | 'bound' | 'human_takeover' | 'rate_limited';

export interface Match {
  system: System;
  external_id: string;
  name: string | null;
  matter_ref: string | null;
  kind: string | null;
  meta: Record<string, unknown>;
}

export interface ChoiceOption { external_id: string; name: string | null; matter_ref: string | null }

export interface PendingMsg { texts: string[]; media: string[] }

export interface IntakeData {
  first_message?: string;
  media?: string[];
  law_external_id?: string | null;
  name?: string;
  request_type?: string;
  request_label?: string;
  parties?: string;
  deadlines?: string;
  has_deadline?: boolean;
  city?: string;
}

export interface ConvSnapshot {
  state: ConvState;
  assigned_system: System | null;
  bound_external_id: string | null;
  bind_expires_at: string | null;
  choice_options: ChoiceOption[] | null;
  choice_attempts: number;
  intake_step: IntakeStep | null;
  intake_data: IntakeData;
  intake_updated_at: string | null;
  pending: PendingMsg | null;
  tags: string[];
  notices: Record<string, string>;
  last_greeting_at: string | null;
  ooh_notice_at: string | null;
  human_until: string | null;
}

export interface InboundMsg {
  text: string;              // النص، أو شرح الوسائط، أو تفريغ الصوت
  mediaUrl: string | null;
  mediaLabel: string | null; // صورة/مستند… لغير النصي
}

export interface FlowInput {
  now: Date;
  conv: ConvSnapshot;
  matches: Match[];
  matchSource: 'index' | 'fallback' | 'none';
  msg: InboundMsg;
  botRepliesLastHour: number;
  botHourlyLimit: number;
  /** من lookup_values في crm-lawfirm — لا يُثبَّت في الـ Hub */
  consultationFee?: string | null;
  bookingUrl?: string;
}

export type NotifyKind =
  | 'wa_message'         // bankruptcy: حدث منسّق — الرقم والهوية جاهزان، والرد من crm-iflas
  | 'wa_client_message'  // law: رسالة عميل قائم
  | 'wa_new_lead'        // law: طلب خدمة جديد بعد التأهيل
  | 'wa_lead_message'    // law: رسالة لاحقة من صاحب طلب
  | 'wa_unrouted';       // أيّهما: لم يُحسم النظام أو الدائن

export interface Notify {
  system: System;
  kind: NotifyKind;
  external_id: string | null;
  payload: Record<string, unknown>;
}

export interface Route {
  system: System | 'both' | null;
  external_id: string | null;
  reason: Reason;
  confidence: number;
  detail?: Record<string, unknown>;
}

export interface FlowOutput {
  reply: string | null;
  /** طلب العميل إيقاف الرسائل أو إعادتها — ينفّذه الموجّه على قائمة الإيقاف */
  optOut?: 'stop' | 'start';
  patch: Partial<ConvSnapshot>;
  route: Route;
  notify: Notify[];
}

// ---------- ضوابط ----------
export const GREET_EVERY_H = 12;          // ترحيب مرة كل 12 ساعة، وما بينها يُمرَّر بصمت
export const NOTICE_EVERY_H = 2;          // تنبيه (حارس الرأي/البوابة) مرة كل ساعتين
export const BIND_DAYS = 7;               // مدة ربط المحادثة بنظام/دائن
export const MAX_CHOICE_ATTEMPTS = 2;     // بعدها: إخطار الطرفين وإقرار عام
export const INTAKE_STALE_H = 48;         // تأهيل متروك يبدأ من جديد
export const LEAD_FOLLOWUP_DAYS = 7;      // رسائل صاحب الطلب تُلحق بطلبه
export const DEFAULTED_QUIET_H = 12;      // بعد تعذّر الاختيار: لا نعيد السؤال

const H = 3_600_000;
const ago = (now: Date, iso: string | null | undefined) =>
  iso ? now.getTime() - new Date(iso).getTime() : Number.POSITIVE_INFINITY;
const iso = (d: Date) => d.toISOString();
const plus = (d: Date, ms: number) => new Date(d.getTime() + ms).toISOString();

function uniqByExternal(ms: Match[]): Match[] {
  const seen = new Map<string, Match>();
  for (const m of ms) if (!seen.has(m.external_id)) seen.set(m.external_id, m);
  return [...seen.values()];
}

function confidenceFor(reason: Reason): number {
  switch (reason) {
    case 'customer_choice': return 1;
    case 'index_match': return 0.95;
    case 'bound': return 0.9;
    case 'live_fallback': return 0.9;
    case 'human_takeover': return 0.9;
    case 'rate_limited': return 0.5;
    default: return 0.4;
  }
}

export function decide(input: FlowInput): FlowOutput {
  const { now, conv, msg } = input;
  const text = (msg.text ?? '').trim();
  const media = msg.mediaUrl ? [msg.mediaUrl] : [];
  const bk = uniqByExternal(input.matches.filter((m) => m.system === 'bankruptcy'));
  const lawAll = uniqByExternal(input.matches.filter((m) => m.system === 'law'));
  const lawClients = lawAll.filter((m) => m.kind === 'client');
  const idReason: Reason =
    input.matchSource === 'fallback' ? 'live_fallback' : input.matchSource === 'index' ? 'index_match' : 'default';

  const patch: Partial<ConvSnapshot> = {};
  const notify: Notify[] = [];
  const notices = { ...conv.notices };
  let reply: string | null = null;
  let closing = false;   // ردُّ إغلاق: قصيرٌ ولا يُلحق به سطر خارج الدوام
  let route: Route = { system: null, external_id: null, reason: idReason, confidence: confidenceFor(idReason) };

  const basePayload = (extra: Record<string, unknown> = {}) => ({
    text, media, media_label: msg.mediaLabel, ...extra,
  });
  const bindValid = conv.state === 'bound' && conv.assigned_system &&
    (!conv.bind_expires_at || new Date(conv.bind_expires_at) > now);
  const greetedRecently = ago(now, conv.last_greeting_at) < GREET_EVERY_H * H;
  const noticeDue = (key: string) => ago(now, notices[key]) >= NOTICE_EVERY_H * H;
  const markNotice = (key: string) => { notices[key] = iso(now); };
  const bind = (system: System, externalId: string | null) => {
    patch.state = 'bound';
    patch.assigned_system = system;
    patch.bound_external_id = externalId;
    patch.bind_expires_at = plus(now, BIND_DAYS * 24 * H);
    patch.choice_options = null;
    patch.choice_attempts = 0;
  };

  // أفضل تخمين للنظام حين لا نرد (موظف يتولى / حد المعدل)
  const guessSystem = (): { system: System | 'both'; external_id: string | null } => {
    if (bindValid) return { system: conv.assigned_system!, external_id: conv.bound_external_id };
    if (bk.length && lawClients.length) return { system: 'both', external_id: null };
    if (bk.length) return { system: 'bankruptcy', external_id: bk.length === 1 ? bk[0].external_id : null };
    return { system: 'law', external_id: lawAll[0]?.external_id ?? conv.intake_data?.law_external_id ?? null };
  };
  const forwardSilently = (reason: Reason) => {
    const g = guessSystem();
    route = { ...g, reason, confidence: confidenceFor(reason) };
    const targets: System[] = g.system === 'both' ? ['bankruptcy', 'law'] : [g.system];
    for (const s of targets) {
      const kind: NotifyKind = s === 'bankruptcy'
        ? 'wa_message'
        : (lawClients.length || g.external_id ? 'wa_client_message' : 'wa_unrouted');
      notify.push({
        system: s, kind, external_id: s === g.system ? g.external_id : null,
        payload: basePayload({
          silent_reason: reason,
          candidates: s === 'bankruptcy' ? bk.map((m) => ({ external_id: m.external_id, name: m.name, matter_ref: m.matter_ref })) : undefined,
        }),
      });
    }
  };

  // ---------- ٠أ) طلب الإيقاف يسبق كل شيء ----------
  // من طلب الإيقاف لا يُحاور ولا يُؤهَّل ولا يُمرَّر لنظام: إقرارٌ واحد ثم صمت.
  // وهو حقٌّ للمرسِل لا خيارٌ لنا، فلا يُعطَّل بحد المعدل ولا بتولّي موظف.
  if (text && isStopRequest(text)) {
    patch.notices = { ...notices, stop_at: iso(now) };
    return { reply: T.stopAck, patch, optOut: 'stop',
             route: { system: null, external_id: null, reason: 'default', confidence: 1, detail: { opt_out: 'stop' } },
             notify: [] };
  }
  if (text && isStartRequest(text)) {
    patch.notices = { ...notices, start_at: iso(now) };
    return { reply: T.startAck, patch, optOut: 'start',
             route: { system: null, external_id: null, reason: 'default', confidence: 1, detail: { opt_out: 'start' } },
             notify: [] };
  }

  // ---------- ٠) موظف يتولى المحادثة من لوحة هاتف: البوت يصمت ----------
  if (conv.human_until && new Date(conv.human_until) > now) {
    forwardSilently('human_takeover');
    return { reply: null, patch, route, notify };
  }

  // ---------- ٠ج) قاعدة الإغلاق في مسار الرقم الجديد ----------
  // المجاملة الأولى تُقابَل بردٍّ قصير واحد يُغلق الحديث؛ وما بعده من مجاملات أو إيموجي
  // لا يُرد عليه ولا يُزعج به الفريق — إلا أن يحمل سؤالاً أو طلباً جديداً فيُفتح الحديث من جديد.
  const newcomerPath = !bk.length && !lawClients.length && !bindValid &&
    (conv.state === 'new' || conv.state === 'intake_done');
  const courtesy = text ? isCourtesyOnly(text) : msg.mediaLabel === 'ملصق';
  if (newcomerPath && !courtesy && (text || media.length)) delete notices.closed_at;
  if (newcomerPath && courtesy && ago(now, notices.closed_at) < GREET_EVERY_H * H) {
    const g = guessSystem();
    return {
      reply: null, patch, notify: [],
      route: { ...g, reason: conv.state === 'intake_done' ? 'bound' : idReason,
               confidence: confidenceFor(idReason), detail: { closing: 'silent_after_close' } },
    };
  }
  const closingReply = () => {
    closing = true;
    notices.closed_at = iso(now);
    return T.thanksReply;
  };

  // ---------- ٠ب) حد الرسائل الآلية في الساعة (منع الحلقات) ----------
  if (input.botRepliesLastHour >= input.botHourlyLimit) {
    forwardSilently('rate_limited');
    return { reply: null, patch, route, notify };
  }

  // ---------- مسارات النظامين ----------
  /**
   * الإفلاس: الـ Hub لا يردّ ولا يسمّي أحداً — يتحقق ويوحّد ويحدد الهوية،
   * ثم يمرّر حدثاً منسّقاً (الرقم والهوية جاهزان) إلى crm-iflas ليردّ بمنطقه
   * (الذكاء، تصنيف الحساسية، تذاكر اعتماد الأمين) عبر send-message.
   * وتعدد الدائنين لرقم واحد يُحسم هناك حيث المطالبات، لا هنا.
   */
  const bankruptcyFlow = (reason: Reason, pendingTexts: string[] = [], includeCurrent = true) => {
    const single = bk.length === 1 ? bk[0] : null;
    route = { system: 'bankruptcy', external_id: single?.external_id ?? null, reason, confidence: confidenceFor(reason) };
    const allTexts = [...pendingTexts, includeCurrent ? text : ''].filter(Boolean);
    notify.push({
      system: 'bankruptcy',
      kind: 'wa_message',
      external_id: single?.external_id ?? null,
      payload: basePayload({
        text: allTexts.join('\n'),
        name: single?.name ?? null,
        matter_ref: single?.matter_ref ?? null,
        candidates: bk.map((m) => ({ external_id: m.external_id, name: m.name, matter_ref: m.matter_ref })),
        also_law_client: lawClients.length > 0,
      }),
    });
  };

  const lawClientFlow = (client: Match | null, reason: Reason, pendingTexts: string[] = [], includeCurrent = true) => {
    route = { system: 'law', external_id: client?.external_id ?? null, reason, confidence: confidenceFor(reason) };
    const allTexts = [...pendingTexts, includeCurrent ? text : ''].filter(Boolean);
    if (!greetedRecently) {
      reply = client ? T.lawClientGreeting(client.name, client.meta) : T.unroutedAck;
      patch.last_greeting_at = iso(now);
    } else if (includeCurrent && text && asksLegalOpinion(text) && noticeDue('legal')) {
      reply = T.legalGuard;
      markNotice('legal');
    }
    patch.tags = [...new Set([...(conv.tags ?? []), 'عميل قائم'])];
    notify.push({
      system: 'law', kind: 'wa_client_message', external_id: client?.external_id ?? null,
      payload: basePayload({ text: allTexts.join('\n'), name: client?.name ?? null, tag: 'عميل قائم' }),
    });
  };

  const BOOKING_DEFAULT = 'https://app.redwan.sa/#/book';

  /**
   * الرد المتجاوب (منطق v9): التحية تُردّ بمثلها، وسؤال السعر يُجاب بقيمة الساعة
   * وعرض الحجز، و«نعم» بعده يرسل الرابط. ووصف المشكلة وحده يمضي إلى التأهيل.
   * ولا يسري إلا على الرقم الجديد: العميل القائم والدائن والفريق لهم مساراتهم.
   */
  const newcomerReply = (): { reply: string; offeredBooking: boolean } | null => {
    if (!text) return courtesy ? { reply: closingReply(), offeredBooking: false } : null;   // ملصق
    const fee = (input.consultationFee ?? '').trim();
    const url = input.bookingUrl || BOOKING_DEFAULT;
    const intent = newcomerIntent(text);
    // السلام يُبتدأ به مرة في المحادثة؛ وإن سبق فالرد يبدأ بالمضمون
    const salamSaid = ago(now, notices.salam_at) < GREET_EVERY_H * H;
    const withSalam = (body: string) => (salamSaid ? body : `${T.salamPrefix}\n${body}`);
    switch (intent) {
      case 'free_consult':
        return fee ? { reply: withSalam(T.freeConsultBody(fee)), offeredBooking: true } : null;
      case 'fee':
        return fee ? { reply: withSalam(T.feeBody(fee)), offeredBooking: true } : null;
      case 'yes':
        // «نعم/تمام» بعد عرض الحجز موافقةٌ عليه — يُرسل الرابط مرة ويُطوى العرض،
        // فلا تعيده «تمام» ثانية. وبلا عرضٍ قائم: مجاملةٌ تُغلق، أو بداية حديث.
        if (notices.booking_offered) {
          delete notices.booking_offered;
          return { reply: T.bookingLink(url), offeredBooking: false };
        }
        return courtesy ? { reply: closingReply(), offeredBooking: false } : null;
      // تحيةٌ ثانية في المحادثة نفسها لا تُقابَل بتحيةٍ مكرّرة، بل يُمضى إلى المضمون (التأهيل)
      case 'salam':   return salamSaid ? null : { reply: T.greetSalam, offeredBooking: false };
      case 'morning': return salamSaid ? null : { reply: T.greetMorning, offeredBooking: false };
      case 'evening': return salamSaid ? null : { reply: T.greetEvening, offeredBooking: false };
      case 'hello':   return salamSaid ? null : { reply: T.greetHello, offeredBooking: false };
      case 'thanks':  return { reply: closingReply(), offeredBooking: false };
      default:
        // إيموجي أو مجاملةٌ أخرى ⇒ إغلاق؛ ووصفُ مشكلة ⇒ التأهيل
        return courtesy ? { reply: closingReply(), offeredBooking: false } : null;
    }
  };

  const startIntake = (restart = false) => {
    route = { system: 'law', external_id: lawAll[0]?.external_id ?? null, reason: idReason === 'index_match' ? 'index_match' : 'default', confidence: 0.6 };
    // ردٌّ متجاوب يسبق الأسئلة: تحيةٌ أو سؤال سعر لا يُقابَل باستجوابٍ عن الأطراف والمدينة
    const quick = newcomerReply();
    if (quick) {
      reply = quick.reply;
      if (quick.offeredBooking) notices.booking_offered = iso(now);
      // أي ردّ في مسار الرقم الجديد يفتح المحادثة؛ فلا يُبتدأ بالسلام بعده
      notices.salam_at = iso(now);
      return;
    }
    patch.state = 'intake';
    patch.intake_step = 'name';
    patch.intake_updated_at = iso(now);
    patch.intake_data = {
      first_message: text || undefined,
      media,
      law_external_id: lawAll[0]?.external_id ?? null,
    };
    patch.assigned_system = 'law';
    const parts = [restart ? T.intakeRestart : T.intakeWelcome];
    if (text && asksLegalOpinion(text)) parts.push(T.legalGuard);
    parts.push(INTAKE_QUESTIONS.name);
    reply = parts.join('\n\n');
  };

  const continueIntake = () => {
    route = { system: 'law', external_id: conv.intake_data?.law_external_id ?? null, reason: 'bound', confidence: confidenceFor('bound') };
    const step = (conv.intake_step ?? 'name') as IntakeStep;
    const data: IntakeData = { ...conv.intake_data };
    patch.intake_updated_at = iso(now);
    if (media.length) data.media = [...(data.media ?? []), ...media];

    if (!text) {
      patch.intake_data = data;
      reply = `${T.answerInText}\n${INTAKE_QUESTIONS[step]}`;
      return;
    }
    if (asksLegalOpinion(text)) {
      patch.intake_data = data;
      reply = `${T.legalGuard}\n\n${INTAKE_QUESTIONS[step]}`;
      return;
    }

    let ok = true;
    switch (step) {
      case 'name': {
        const picked = pickName(text);
        const name = picked ?? text.replace(/^(انا|أنا|اسمي|معك|معاك)\s+/u, '').trim();
        if (!picked) {
          // ليس اسماً بل بقيةُ وصفٍ للمشكلة: يُضاف إلى الوصف، ويُعاد السؤال مرة واحدة
          data.first_message = [data.first_message, text].filter(Boolean).join('\n').slice(0, 1500);
          const asked = Number(conv.notices?.name_reasked ?? 0);
          patch.intake_data = data;
          if (asked >= 1) { data.name = name.slice(0, 80); break; }   // لا نلحّ أكثر من مرة
          notices.name_reasked = '1';
          reply = T.nameReask;
          return;
        }
        data.name = name;
        break;
      }
      case 'request_type': {
        const n = parseOptionNumber(text, REQUEST_TYPES.length);
        const rt = n ? REQUEST_TYPES[n - 1] : null;
        if (rt) { data.request_type = rt.request_type; data.request_label = rt.label; }
        else if (text.length >= 2) { data.request_type = 'case'; data.request_label = `أخرى: ${text.slice(0, 120)}`; }
        else ok = false;
        break;
      }
      case 'parties':
        data.parties = isNegative(text) ? 'لا يوجد' : text.slice(0, 300);
        break;
      case 'deadlines':
        data.has_deadline = !isNegative(text);
        data.deadlines = data.has_deadline ? text.slice(0, 300) : 'لا';
        break;
      case 'city':
        data.city = text.slice(0, 80);
        break;
    }
    patch.intake_data = data;
    if (!ok) { reply = INTAKE_QUESTIONS[step]; return; }

    const next = INTAKE_STEPS[INTAKE_STEPS.indexOf(step) + 1];
    if (next) {
      patch.intake_step = next;
      reply = INTAKE_QUESTIONS[next];
      return;
    }
    // اكتمل التأهيل ⇒ طلب خدمة جديد في نظام المحاماة
    patch.state = 'intake_done';
    patch.intake_step = null;
    patch.tags = [...new Set([...(conv.tags ?? []), 'طلب جديد'])];
    reply = T.intakeDone(data.name ?? '');
    notify.push({
      system: 'law', kind: 'wa_new_lead', external_id: data.law_external_id ?? null,
      payload: { ...data, source: 'واتساب' },
    });
  };

  const choiceFailed = (attempts: number) => attempts >= MAX_CHOICE_ATTEMPTS;
  const pendingOf = (p: PendingMsg | null): PendingMsg => ({ texts: [...(p?.texts ?? [])], media: [...(p?.media ?? [])] });

  // ---------- ١) بانتظار اختيار النظام ----------
  if (conv.state === 'awaiting_system') {
    const pick = parseSystemChoice(text);
    const pend = pendingOf(conv.pending);
    if (pick) {
      patch.pending = null;
      if (pick === 'bankruptcy') {
        bind('bankruptcy', bk.length === 1 ? bk[0].external_id : null);
        bankruptcyFlow('customer_choice', pend.texts, false);
      } else {
        const client = lawClients[0] ?? lawAll[0] ?? null;
        bind('law', client?.external_id ?? null);
        lawClientFlow(client, 'customer_choice', pend.texts, false);
      }
      route.detail = { choice: pick, attempts: conv.choice_attempts + 1 };
      return finish();
    }
    const attempts = conv.choice_attempts + 1;
    pend.texts.push(text); pend.media.push(...media);
    if (!choiceFailed(attempts)) {
      patch.choice_attempts = attempts;
      patch.pending = pend;
      reply = T.systemChoiceRetry;
      route = { system: null, external_id: null, reason: idReason, confidence: 0.5, detail: { awaiting: 'system', attempts } };
      return finish();
    }
    // تعذّر الاختيار ⇒ إخطار الطرفين، وإقرار عام، ولا نعيد السؤال 12 ساعة
    patch.state = 'new'; patch.pending = null; patch.choice_attempts = 0; patch.choice_options = null;
    notices.choice_defaulted = iso(now);
    reply = T.unroutedAck;
    route = { system: 'both', external_id: null, reason: 'default', confidence: 0.3, detail: { choice_failed: true } };
    for (const s of ['bankruptcy', 'law'] as System[]) {
      notify.push({
        system: s, kind: s === 'bankruptcy' ? 'wa_message' : 'wa_unrouted', external_id: null,
        payload: basePayload({
          text: pend.texts.join('\n'), media: pend.media, choice_failed: true,
          candidates: s === 'bankruptcy' ? bk.map((m) => ({ external_id: m.external_id, name: m.name, matter_ref: m.matter_ref })) : undefined,
        }),
      });
    }
    return finish();
  }

  // ---------- ٣) ربط ساري ----------
  if (bindValid) {
    if (conv.assigned_system === 'bankruptcy') {
      bankruptcyFlow('bound');
    } else {
      const c = lawAll.find((m) => m.external_id === conv.bound_external_id) ?? lawClients[0] ?? null;
      lawClientFlow(c, 'bound');
    }
    return finish();
  }

  // ---------- ٤) تأهيل جارٍ أو طلب مكتمل ----------
  const knownNow = bk.length > 0 || lawClients.length > 0;
  if (conv.state === 'intake' && !knownNow) {
    if (ago(now, conv.intake_updated_at) < INTAKE_STALE_H * H) { continueIntake(); return finish(); }
    startIntake(true); return finish();
  }
  if (conv.state === 'intake_done' && !knownNow && ago(now, conv.intake_updated_at) < LEAD_FOLLOWUP_DAYS * 24 * H) {
    route = { system: 'law', external_id: conv.intake_data?.law_external_id ?? null, reason: 'bound', confidence: confidenceFor('bound') };
    if (courtesy) { reply = closingReply(); return finish(); }   // لا يُزعج الفريق بمجاملة
    if (text && asksLegalOpinion(text) && noticeDue('legal')) { reply = T.legalGuard; markNotice('legal'); }
    else if (!greetedRecently) { reply = T.leadFollowup; patch.last_greeting_at = iso(now); }
    notify.push({
      system: 'law', kind: 'wa_lead_message', external_id: conv.intake_data?.law_external_id ?? null,
      payload: basePayload({ name: conv.intake_data?.name ?? null }),
    });
    return finish();
  }

  // ---------- ٥) توجيه جديد بالهوية ----------
  if (bk.length && lawClients.length) {
    if (ago(now, notices.choice_defaulted) < DEFAULTED_QUIET_H * H) {
      forwardSilently('default');
      return finish();
    }
    patch.state = 'awaiting_system';
    patch.choice_attempts = 0;
    patch.choice_options = null;
    patch.pending = { texts: text ? [text] : [], media };
    reply = T.systemChoicePrompt;
    route = { system: null, external_id: null, reason: idReason, confidence: 0.5, detail: { awaiting: 'system' } };
    return finish();
  }
  if (bk.length) {
    bind('bankruptcy', bk.length === 1 ? bk[0].external_id : null);
    bankruptcyFlow(idReason);
    return finish();
  }
  if (lawClients.length) {
    const c = lawClients[0];
    bind('law', c.external_id);
    // صاحب طلب قائم (اكتسب الصفة بطلبٍ نشط لا بكونه موكّلاً): يُطمأن على طلبه
    if (String(c.meta?.via ?? '') === 'active_request') {
      route = { system: 'law', external_id: c.external_id, reason: idReason, confidence: confidenceFor(idReason) };
      if (!greetedRecently) {
        reply = T.openRequestAck(c.name, c.matter_ref);
        patch.last_greeting_at = iso(now);
      } else if (text && asksLegalOpinion(text) && noticeDue('legal')) {
        reply = T.legalGuard;
        markNotice('legal');
      }
      notify.push({
        system: 'law', kind: 'wa_lead_message', external_id: c.external_id,
        payload: basePayload({ name: c.name, request_ref: c.matter_ref, open_request: true }),
      });
      return finish();
    }
    lawClientFlow(c, idReason);
    return finish();
  }
  startIntake(conv.state === 'intake');
  return finish();

  // ---------- مساعدات تحتاج الإغلاق ----------
  function finish(): FlowOutput {
    if (reply && !closing && !isBusinessHours(now) && ago(now, conv.ooh_notice_at) >= GREET_EVERY_H * H) {
      reply = `${reply}\n\n${T.oohLine}`;
      patch.ooh_notice_at = iso(now);
    }
    if (JSON.stringify(notices) !== JSON.stringify(conv.notices ?? {})) patch.notices = notices;
    return { reply, patch, route, notify };
  }
}

