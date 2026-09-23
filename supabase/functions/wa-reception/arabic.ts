// تطبيع النص العربي للمطابقة: لا يُعرض للمستخدم، يُستعمل للفهم فقط.

const DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4', '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4', '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export function toAsciiDigits(s: string): string {
  return s.replace(/[٠-٩۰-۹]/g, (d) => DIGIT_MAP[d] ?? d);
}

export function normalizeArabic(s: string): string {
  return toAsciiDigits(String(s ?? ''))
    .replace(/[ً-ْٰ]/g, '') // التشكيل
    .replace(/ـ/g, '') // التطويل
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[؟?!.,،:;"'()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// الكلمة القصيرة (≤3 أحرف) تُطابَق كلمةً كاملة — وإلا التقطت «كم» من «لكم»
const has = (t: string, words: string[]) => {
  const tokens = t.split(' ');
  return words.some((w) => {
    const word = w.trim();
    if (word.includes(' ') || word.length > 3) return t.includes(word);
    return tokens.some((tok) => tok === word || tok === `و${word}`);
  });
};

// طلب رأي قانوني أو تقدير فرص أو تسعير أو وعد بنتيجة
const LEGAL_OPINION = [
  'رايك', 'رايكم', 'وش تشوف', 'ايش تشوف', 'تنصحني', 'تنصحوني', 'نصيحه',
  'هل يحق', 'يحق لي', 'هل احق', 'هل يجوز', 'قانوني او لا', 'هل هذا قانوني', 'نظامي او لا', 'هل هذا نظامي',
  'هل اكسب', 'بكسب', 'اكسب القضيه', 'فرصه', 'فرص', 'نسبه النجاح', 'نسبه الفوز', 'احتمال', 'مضمون', 'تضمن',
  'اتعاب', 'كم السعر', 'التكلفه', 'تكلف', 'بكم', 'كم تاخذ', 'كم الرسوم', 'تسعير', 'عرض سعر',
  'وش الحل', 'ايش الحل', 'وش اسوي', 'ايش اسوي', 'ماذا افعل', 'ماذا اعمل',
  'كم ياخذ', 'كم تطول', 'متي يصدر الحكم', 'هل بيحكم', 'هل سيحكم',
];
export function asksLegalOpinion(text: string): boolean {
  return has(normalizeArabic(text), LEGAL_OPINION);
}

// سؤال الدائن عن حالة مطالبة أو مبلغ أو موعد أو توزيع — ممنوع الإفصاح عبر الواتساب
const CLAIM_DETAILS = [
  'مبلغ', 'المبلغ', 'كم', 'متي', 'موعد', 'توزيع', 'صرف', 'حاله', 'وين وصل', 'وش صار', 'ايش صار',
  'نسبه', 'مستحق', 'تحويل', 'حواله', 'قبول', 'رفض', 'مقبوله', 'مرفوضه', 'اعتراض', 'استلم', 'فلوس',
];
export function asksClaimDetails(text: string): boolean {
  return has(normalizeArabic(text), CLAIM_DETAILS);
}

// نوايا مسار الرقم الجديد (منطق v9)
const GREET_SALAM = /^(ال)?سلام عليكم|^سلام( عليكم)?$|^السلام$/;
const GREET_MORNING = /^صباح (الخير|النور|الورد)/;
const GREET_EVENING = /^مساء (الخير|النور|الورد)/;
const GREET_HELLO = /^(هلا|هلا والله|اهلا|اهلين|مرحبا|مرحبتين|هاي|هلو)/;
const THANKS = ['شكر', 'مشكور', 'يعطيك العافيه', 'جزاك الله', 'تسلم'];
const YES = /^(نعم|ايه|ايوه|اي|اكيد|تمام|زين|طيب|موافق|ابي|ابغي|ابغى|يالله|اوك|ok|yes)( .*)?$/;

export type NewcomerIntent =
  | 'free_consult' | 'fee' | 'yes' | 'salam' | 'morning' | 'evening' | 'hello' | 'thanks' | 'content';

/** ما الذي يريده صاحب الرقم الجديد من رسالته؟ */
export function newcomerIntent(raw: string): NewcomerIntent {
  const t = normalizeArabic(raw);
  const short = t.split(' ').length <= 5;
  // سؤال الاستشارة يسبق كل شيء ولو جاء داخل كلام طويل
  if (/استشار/.test(t)) {
    if (/مجاني|مجانا|ببلاش|بلاش|بدون مقابل/.test(t)) return 'free_consult';
    if (/كم|سعر|تكلفه|رسوم|قيمه|اسعار/.test(t)) return 'fee';
  }
  if (/(كم|سعر|تكلفه|رسوم|اتعاب)/.test(t) && /(استشار|ساعه|موعد|زياره)/.test(t)) return 'fee';
  if (has(t, THANKS) && isCourtesyOnly(raw)) return 'thanks';
  if (short && YES.test(t)) return 'yes';
  if (!short) return 'content';
  if (GREET_SALAM.test(t)) return 'salam';
  if (GREET_MORNING.test(t)) return 'morning';
  if (GREET_EVENING.test(t)) return 'evening';
  if (GREET_HELLO.test(t)) return 'hello';
  return 'content';
}

/** رقم خيار من 1..max — يقبل «2» و«٢» و«رقم 2» و«الخيار الثاني» */
const ORDINALS: Record<string, number> = {
  'الاول': 1, 'اول': 1, 'الثاني': 2, 'ثاني': 2, 'الثالث': 3, 'ثالث': 3, 'الرابع': 4, 'الخامس': 5,
  'واحد': 1, 'اثنين': 2, 'اثنان': 2, 'ثلاثه': 3, 'اربعه': 4, 'خمسه': 5,
};
export function parseOptionNumber(text: string, max: number): number | null {
  const t = normalizeArabic(text);
  const m = t.match(/^\D{0,12}?(\d{1,2})\D{0,12}$/);
  if (m) {
    const n = Number(m[1]);
    return n >= 1 && n <= max ? n : null;
  }
  for (const [w, n] of Object.entries(ORDINALS)) {
    if (t === w || t.endsWith(` ${w}`) || t.startsWith(`${w} `)) return n <= max ? n : null;
  }
  return null;
}

/** اختيار النظام: 1=الإفلاس، 2=المكتب — بالرقم أو بالكلمة */
export function parseSystemChoice(text: string): 'bankruptcy' | 'law' | null {
  const n = parseOptionNumber(text, 2);
  if (n === 1) return 'bankruptcy';
  if (n === 2) return 'law';
  const t = normalizeArabic(text);
  const bk = has(t, ['افلاس', 'مطالب', 'دائن', 'الاجراء', 'امين']);
  const law = has(t, ['المكتب', 'مكتب', 'ملفي', 'قضيه', 'قضيتي', 'محامي', 'موكل', 'وكاله']);
  if (bk && !law) return 'bankruptcy';
  if (law && !bk) return 'law';
  return null;
}

// طلب الإيقاف — يُطابَق على الرسالة القصيرة وحدها، فلا تُفهم جملةٌ طويلة فيها
// كلمة «إيقاف» (مثل «أرجو إيقاف إجراءات التنفيذ») طلبَ إيقافِ رسائل.
const STOP_WORDS = [
  'ايقاف', 'أيقاف', 'توقف', 'توقفوا', 'لا تراسلني', 'لا ترسلوا', 'لا تراسلوني',
  'الغاء الاشتراك', 'الغاء الرسائل', 'ازالة رقمي', 'احذف رقمي', 'stop', 'unsubscribe',
];
const START_WORDS = ['تفعيل', 'اشتراك', 'ابدا الرسائل', 'start', 'subscribe'];

export function isStopRequest(text: string): boolean {
  const t = normalizeArabic(text);
  if (!t || t.split(' ').length > 4) return false;
  return STOP_WORDS.some((w) => t === normalizeArabic(w) || t.startsWith(normalizeArabic(w) + ' '));
}

export function isStartRequest(text: string): boolean {
  const t = normalizeArabic(text);
  if (!t || t.split(' ').length > 3) return false;
  return START_WORDS.some((w) => t === normalizeArabic(w));
}

export function isNegative(text: string): boolean {
  const t = normalizeArabic(text);
  return /^(لا|لاء|لا يوجد|لايوجد|ما في|مافي|ما فيه|مافيه|ابد|ابدا|لا شي|لاشي|ليس لدي|ليس هناك|لا يوجد شي)( .*)?$/.test(t);
}


// ---------- هل هذا اسمٌ أم بقيةُ كلام؟ ----------
// من يصف مشكلته على رسالتين تُلتقط ثانيتُه اسماً له، فيُسجَّل الطلب باسمٍ
// ليس باسم (حدث فعلاً 2026-09-22: «بدون ما أترحل»). فنقبل ما يشبه الاسم فقط.
const NOT_NAME = /(^|\s)(ما|مب|مو|بدون|بلا|أريد|اريد|ابغى|أبغى|عشان|علشان|لأن|لان|عندي|عندى|فيه|في\s|هل|كيف|متى|وش|ليش|لكن|بس|الله يعافيك|من فضلك|please|want|need)(\s|$)/u;
// أجوبةٌ لأسئلةٍ أخرى لا تكون اسماً: خيارات نوع الطلب، والنفي والإثبات
const NOT_NAME_WHOLE = /^(اخري|أخرى|اخرى|لا|لا يوجد|نعم|ايه|قضيه|استشاره|عقد|تنفيذ|[0-9٠-٩])$/u;
const HAS_DIGIT = /[0-9٠-٩]/;

export function looksLikeName(raw: string): boolean {
  const t = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < 2 || t.length > 60) return false;
  if (isCourtesyOnly(t)) return false;         // «تمام» و«شكراً» ليست اسماً
  if (NOT_NAME_WHOLE.test(t)) return false;
  const words = t.split(' ').filter(Boolean);
  if (words.length > 4) return false;          // الاسم الرباعي حدُّه أربع كلمات
  if (HAS_DIGIT.test(t)) return false;
  if (/[.،؟?!]/.test(t)) return false;         // ترقيمٌ ⇒ جملة لا اسم
  if (NOT_NAME.test(` ${t} `)) return false;
  return true;
}


// ---------- مجاملةٌ خالصة أم كلامٌ فيه مضمون؟ ----------
// قاعدة الإغلاق (طلب المدير 2026-09-23): المجاملة الأولى تُقابَل بردٍّ قصير، وما بعده
// من مجاملات أو إيموجي لا يُرد عليه — إلا أن يحمل سؤالاً أو طلباً جديداً.
// فالحكم هنا: كل كلمات الرسالة من معجم المجاملة، ولا علامة استفهام فيها.
const COURTESY_WORDS = new Set([
  // الشكر والدعاء
  'شكرا', 'شكر', 'الشكر', 'مشكور', 'مشكوره', 'مشكورين', 'مشكورون', 'تسلم', 'تسلمون', 'تسلمين', 'تسلمي',
  'يسلمو', 'يسلموا', 'يسلمك', 'يعطيك', 'يعطيكم', 'العافيه', 'عافيه', 'الف', 'جزيلا', 'جزاك', 'جزاكم', 'يجزاك',
  'يجزيك', 'يجزاكم', 'الله', 'خير', 'خيرا', 'الخير', 'بارك', 'فيك', 'فيكم', 'يسعدك', 'يسعدكم', 'يحفظك', 'يحفظكم',
  'يوفقك', 'يوفقكم', 'يخليك', 'يخليكم', 'يعافيك', 'يعافيكم', 'ما', 'قصرت', 'قصرتو', 'قصرتوا', 'ماقصرت', 'ماقصرتو',
  'كل', 'كثير', 'كثيرا', 'مره', 'والله', 'بالتوفيق', 'موفق', 'موفقين', 'وياك', 'واياك', 'وياكم', 'واياكم',
  'العفو', 'عفوا', 'الغالي', 'الغاليه', 'اخوي', 'اخي', 'اختي', 'استاذ', 'استاذه', 'يا', 'حبيبي', 'يعطيكم',
  // الموافقة العامة
  'تمام', 'طيب', 'اوكي', 'اوك', 'اوكيه', 'حاضر', 'ابشر', 'ابشري', 'ابشروا', 'زين', 'ممتاز', 'جميل', 'رائع',
  'كويس', 'خلاص', 'تم', 'ان', 'شاء', 'انشاء', 'انشالله', 'انشاءالله', 'باذن', 'باذنه', 'تعالي',
  // التحية والوداع
  'سلام', 'السلام', 'عليكم', 'وعليكم', 'ورحمه', 'وبركاته', 'صباح', 'مساء', 'النور', 'الورد', 'هلا', 'اهلا',
  'اهلين', 'مرحبا', 'حياك', 'حياكم', 'في', 'امان', 'مع', 'السلامه', 'السلامة', 'يومك', 'سعيد',
  // الإنجليزية
  'thanks', 'thank', 'you', 'thx', 'ty', 'ok', 'okay', 'okey', 'k', 'good', 'great', 'nice', 'cool',
  'perfect', 'alright', 'bye', 'welcome', 'much', 'so', 'lol', 'haha',
  'a', 'lot', 'alot', 'very', 'many', 'appreciate', 'appreciated', 'it', 'noted', 'sure', 'great', 'goodbye',
]);
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️❤♥]/gu;
const LAUGH_RE = /^(ه{2,}|ها{2,}|(ha){2,}|h+)$/;

export function isCourtesyOnly(raw: string): boolean {
  const s = String(raw ?? '');
  if (/[؟?]/.test(s)) return false;                          // استفهامٌ صريح ⇒ ليس مجاملة
  const t = normalizeArabic(s.replace(EMOJI_RE, ' '));
  if (!t) return true;                                       // إيموجي أو ترقيم وحده
  return t.split(' ').every((w) => {
    if (COURTESY_WORDS.has(w) || LAUGH_RE.test(w)) return true;
    // «وشكرا» «والله» «ويعطيك»: واو العطف لا تغيّر الحكم
    return w.length > 2 && w.startsWith('و') && COURTESY_WORDS.has(w.slice(1));
  });
}

/**
 * الاسم من جوابٍ قد يجمع أكثر من رسالة (مهلة التجميع تضمّ ما تتابع): يُختار آخر سطرٍ
 * يشبه الاسم، فـ«أخرى\nفاطمة الزهراء» تعطي «فاطمة الزهراء». ولا سطر يشبهه ⇒ null.
 */
export function pickName(raw: string): string | null {
  const lines = String(raw ?? '').split('\n')
    .map((l) => l.replace(/^(انا|أنا|اسمي|معك|معاك)\s+/u, '').trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) if (looksLikeName(lines[i])) return lines[i];
  return null;
}
