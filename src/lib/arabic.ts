// تطبيع عربي للبحث — «محكمه» تجد «المحكمة» و«احمد» يجد «أحمد».
// نفس القاعدة في دالة ar_norm() بقاعدة البيانات (بحث الشريط العلوي)
// وString.arNorm في تطبيق iOS — عدّل الثلاثة معاً إن غيّرت شيئاً.
//
// normalize('NFC') أولاً عمداً: بعض المدخلات تصل بهمزات مفككة
// (NFD: ا + همزة عائمة) فتفلت من المطابقة الحرفية بدون الجمع.

const HAMZA = /[أإآٱ]/g // أ إ آ ٱ
const TAA = /ة/g // ة
const ALIF_MAQSURA = /ى/g // ى
const DIACRITICS = /[ً-ْٰـ]/g // تشكيل + خنجرية + تطويل

/** توحيد الهمزات والتاء المربوطة والألف المقصورة + إسقاط التشكيل والتطويل */
export const arNorm = (s: string): string =>
  s
    .normalize('NFC') // يجمع الهمزة المفككة قبل التوحيد
    .toLowerCase()
    .replace(DIACRITICS, '')
    .replace(HAMZA, 'ا') // ا
    .replace(TAA, 'ه') // ه
    .replace(ALIF_MAQSURA, 'ي') // ي

/**
 * بحث غير حساس للهمزات/التاء المربوطة/حالة الأحرف.
 * `needle` يُطبَّع داخلياً — مرر نص البحث كما كتبه المستخدم.
 */
export const arIncludes = (
  hay: string | null | undefined,
  needle: string
): boolean => !!hay && arNorm(hay).includes(arNorm(needle))
