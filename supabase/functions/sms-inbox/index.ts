// استقبال **كل** الرسائل الواردة من اختصار الآيفون، وتصنيفها في النظام.
//
// لماذا التصنيف هنا لا في الاختصار (طلب المستخدم 2026-08-15):
//   الاختصار كان يفلتر باسم المرسِل، واسم المرسِل يتغيّر («MOJ» ← «Najiz» ←
//   «وزارة العدل») أو لا يُضبط أصلاً، فتضيع رسائل بلا أثر. الآن يرسل الاختصار
//   كل شيء، والنظام يقرّر.
//
// ⚠️ الخصوصية: استقبال كل شيء يعني وصول رموز التحقق والرسائل الشخصية.
//    لذا: رمز التحقق يُحجب من النص قبل الحفظ (لا يُخزَّن أصلاً)، وفئتا
//    otp/personal لا يراهما إلا المدير (سياسة sms_log_select).
//
// الحماية: verify_jwt (مفتاح anon) + سر x-inbox-secret من lookup_values.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const json = (o: unknown, status = 200) =>
  new Response(JSON.stringify(o), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

function normPhone(raw: string): string {
  let p = (raw || '').replace(/[^\d+]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('00')) p = p.slice(2)
  if (p.startsWith('966')) p = p.slice(3)
  if (p.startsWith('0')) p = p.slice(1)
  return p
}

/* ===================== التصنيف ===================== */

type Category =
  | 'najiz'
  | 'government'
  | 'bank'
  | 'client'
  | 'otp'
  | 'promo'
  | 'personal'
  | 'other'

// مرسِلون معروفون (اسم المرسِل قد يتغيّر، فنفحص النص أيضاً — لا نعتمد عليه وحده)
const NAJIZ_SENDERS = ['MOJ', 'NAJIZ', 'ADLIA', 'عدل']
const GOV_SENDERS = [
  'ABSHER', 'ELM', 'GAZT', 'ZATCA', 'SBC', 'MCI', 'GOSI', 'TAMEENI',
  'MOI', 'BALADY', 'QIWA', 'MUQEEM', 'ETIMAD', 'NAFATH',
]
const BANK_SENDERS = [
  'ALRAJHI', 'RAJHI', 'SNB', 'ALAHLI', 'RIYADBANK', 'SABB', 'ALINMA',
  'ALBILAD', 'ANB', 'BSF', 'STCPAY', 'URPAY', 'BANK',
]

const NAJIZ_WORDS = [
  'ناجز', 'وزارة العدل', 'المحكمة', 'دائرة', 'جلسة', 'صحيفة دعوى',
  'التنفيذ', 'كتابة العدل', 'صك', 'إعلان قضائي', 'مذكرة',
]
const GOV_WORDS = ['أبشر', 'الزكاة', 'الضريبة', 'التأمينات', 'وزارة', 'الهيئة', 'البلدية']
const BANK_WORDS = ['حوالة', 'إيداع', 'سحب', 'رصيد', 'شراء', 'مدى', 'فاتورة', 'حسابك']
const PROMO_WORDS = [
  'خصم', 'عرض', 'اشترك', 'كوبون', 'تخفيض', 'مجاناً', 'للإلغاء', 'لإيقاف',
  'unsubscribe', 'العرض ساري', 'احجز الآن',
]
// رمز تحقق: كلمة دالّة + رقم مكوّن من ٤ إلى ٨ خانات
const OTP_WORDS = [
  'رمز', 'كلمة المرور المؤقتة', 'التحقق', 'otp', 'verification', 'code',
  'لا تشاركه', 'لا تشارك الرمز',
]

const hasAny = (hay: string, needles: string[]) =>
  needles.some((n) => hay.includes(n.toLowerCase()))

function classify(
  sender: string,
  message: string,
  matchedContact: boolean
): { category: Category; important: boolean } {
  const s = sender.toLowerCase()
  const m = message.toLowerCase()

  // ١. رمز تحقق — يُفحص أولاً لأنه الأخطر خصوصيةً
  if (hasAny(m, OTP_WORDS) && /\b\d{4,8}\b/.test(message)) {
    return { category: 'otp', important: false }
  }

  // ٢. موكّل معروف — الهوية أوثق من الكلمات: رسالة موكّل يسأل «متى الجلسة؟»
  //    ليست رسالة من ناجز. تُفحص قبل تصنيفات الكلمات المفتاحية عمداً.
  if (matchedContact) return { category: 'client', important: true }

  // ٣. ناجز والمحاكم — الأهم للمكتب
  if (hasAny(s, NAJIZ_SENDERS) || hasAny(m, NAJIZ_WORDS)) {
    return { category: 'najiz', important: true }
  }

  // ٤. جهات حكومية
  if (hasAny(s, GOV_SENDERS) || hasAny(m, GOV_WORDS)) {
    return { category: 'government', important: true }
  }

  // ٥. بنوك — مهمة (تحويلات الأتعاب والرسوم)
  if (hasAny(s, BANK_SENDERS) || hasAny(m, BANK_WORDS)) {
    return { category: 'bank', important: true }
  }

  // ٦. إعلاني
  if (hasAny(m, PROMO_WORDS)) return { category: 'promo', important: false }

  // ٧. رقم جوال شخصي غير معروف ← شخصي (لا يراه إلا المدير)
  if (normPhone(sender).length >= 9) {
    return { category: 'personal', important: false }
  }

  return { category: 'other', important: false }
}

/** يحجب رمز التحقق من النص فلا يُخزَّن أصلاً. */
function redactOtp(message: string): string {
  return message.replace(/\b\d{4,8}\b/g, '••••')
}

/* ============ موعد ناجز (كما كان) ============ */

/**
 * تحويل تاريخ هجري (أم القرى تقريباً) إلى ميلادي.
 * ⚠️ ناجز يرسل التاريخ هجرياً أحياناً وميلادياً أحياناً بنفس الصيغة DD/MM/YYYY.
 *    كان المحلّل يأخذه كما هو، فسُجّل موعد فعلي بتاريخ «1448-03-12» — أي ضاع
 *    في سنة 1448 ميلادية. الآن: سنة أقل من 1500 = هجرية فتُحوَّل.
 */
function hijriToGregorian(hy: number, hm: number, hd: number): Date {
  // الصيغة الفلكية المعتادة للتقويم الهجري (انحراف ±يوم مقبول لموعد إداري)
  const jd =
    Math.floor((11 * hy + 3) / 30) +
    354 * hy +
    30 * hm -
    Math.floor((hm - 1) / 2) +
    hd +
    1948440 -
    385
  return new Date((jd - 2440588) * 86400000)
}

function parseNajizAppointment(msg: string): {
  reqType: string
  reqNum: string
  date: string
  time: string
} | null {
  if (!msg.includes('تحديد موعد')) return null
  const dm = msg.match(/بتاريخ\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  const tm = msg.match(/الساعة\s*:\s*(\d{1,2}):(\d{2})\s*(ص|م)/)
  if (!dm || !tm) return null
  let [, dd, mm, yyyy] = dm
  // سنة هجرية (< 1500) ← حوّلها قبل الحفظ
  if (parseInt(yyyy, 10) < 1500) {
    const g = hijriToGregorian(+yyyy, +mm, +dd)
    yyyy = String(g.getUTCFullYear())
    mm = String(g.getUTCMonth() + 1)
    dd = String(g.getUTCDate())
  }
  let hour = parseInt(tm[1], 10)
  const minute = tm[2]
  if (tm[3] === 'م' && hour < 12) hour += 12
  if (tm[3] === 'ص' && hour === 12) hour = 0
  const reqType = msg.match(/لطلب\s*\(([^)]+)\)/)?.[1]?.trim() ?? 'موعد ناجز'
  const reqNum = msg.match(/رقم\s*:\s*\n?\s*(\d{6,})/)?.[1] ?? ''
  return {
    reqType,
    reqNum,
    date: `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
    time: `${String(hour).padStart(2, '0')}:${minute}`,
  }
}

// بصمة الرسالة لمنع التكرار. SHA-256 لا MD5: الأخير غير قياسي في WebCrypto
// وقد يرمي وقت التشغيل. أول 32 محرفاً تكفي للتمييز.
async function fingerprint(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  const secret = req.headers.get('x-inbox-secret') ?? ''
  const { data: cfg } = await admin
    .from('lookup_values')
    .select('value')
    .eq('type', 'sms_inbox_config')
    .limit(1)
    .maybeSingle()
  if (!cfg?.value || secret !== cfg.value) {
    return json({ error: 'سر غير صحيح' }, 401)
  }

  let body: { sender?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'JSON غير صالح' }, 400)
  }

  const sender = (body.sender ?? '').toString().trim()
  const message = (body.message ?? '').toString().trim()
  if (!message) return json({ error: 'الرسالة فارغة' }, 400)

  // منع التكرار: الاختصار قد يعيد إرسال الرسالة نفسها (إعادة تشغيل/مزامنة)
  const dedupKey = await fingerprint(`${sender}|${message}`)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: dup } = await admin
    .from('sms_log')
    .select('id')
    .eq('dedup_key', dedupKey)
    .eq('status', 'incoming')
    .gte('created_at', since)
    .limit(1)
    .maybeSingle()
  if (dup) return json({ ok: true, duplicate: true })

  // مطابقة المرسِل بجهة اتصال (يعطي الاسم والربط معاً)
  let name = sender || 'مجهول'
  let contactId: string | null = null
  const digits = normPhone(sender)
  if (digits.length >= 9) {
    const { data: contact } = await admin
      .from('contacts')
      .select('id, name')
      .ilike('phone', `%${digits.slice(-9)}%`)
      .limit(1)
      .maybeSingle()
    if (contact) {
      contactId = contact.id
      if (contact.name) name = contact.name
    }
  }

  const { category, important } = classify(sender, message, !!contactId)
  // رمز التحقق لا يُخزَّن — يُحجب قبل الإدراج
  const stored = category === 'otp' ? redactOtp(message) : message

  const { error } = await admin.from('sms_log').insert({
    recipient_name: name,
    phone: sender,
    message: stored,
    status: 'incoming',
    sent_by: 'iphone',
    category,
    is_important: important,
    contact_id: contactId,
    dedup_key: dedupKey,
  })
  if (error) return json({ error: error.message }, 500)

  // موعد ناجز → إنشاء تلقائي في التقويم (مع منع التكرار برقم الطلب)
  let appointmentCreated = false
  const appt = category === 'najiz' ? parseNajizAppointment(message) : null
  if (appt) {
    const marker = appt.reqNum ? `طلب رقم ${appt.reqNum}` : null
    let exists = false
    if (marker) {
      const { data: dupA } = await admin
        .from('appointments')
        .select('id')
        .eq('appointment_date', appt.date)
        .ilike('notes', `%${marker}%`)
        .limit(1)
        .maybeSingle()
      exists = !!dupA
    }
    if (!exists) {
      const { error: apptErr } = await admin.from('appointments').insert({
        client_name: `كتابة العدل الافتراضية — اتصال مرئي (${appt.reqType})`,
        appointment_date: appt.date,
        appointment_time: appt.time,
        duration_minutes: 30,
        notes: `${marker ?? 'موعد ناجز'} — أُنشئ تلقائياً من رسالة ناجز الواردة.`,
        status: 'confirmed',
        created_by: 'من رسائل ناجز الواردة',
      })
      appointmentCreated = !apptErr
    }
  }

  return json({
    ok: true,
    category,
    important,
    matched: name,
    appointment: appointmentCreated,
  })
})
