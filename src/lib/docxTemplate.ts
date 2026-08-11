// محرّك قوالب Word العام: يكتشف متغيرات {{KEY}} داخل ملف .docx ويعبّئها.
// تؤلَّف القوالب في Word (لا في محرّر داخلي) لأن الصياغة القانونية تُحرَّر هناك.
// JSZip يُستورد ديناميكياً حتى لا يدخل الحزمة الأساسية.

// الأجزاء التي قد تحوي نصاً ظاهراً: المتن + الرؤوس + التذييلات
const TEXT_PARTS = /^word\/(document|header\d*|footer\d*)\.xml$/

/**
 * Word يشطر النص إلى runs، فقد يصير {{NAME}} في XML هكذا:
 *   <w:t>{{NA</w:t><w:t>ME}}</w:t>
 * فننزع الوسوم الواقعة داخل حدود المتغيّر قبل الاستبدال.
 * (يعالج الحالة الغالبة: القوسان سليمان والشطر بينهما.)
 */
function healTokens(xml: string): string {
  return xml.replace(/\{\{[\s\S]{0,600}?\}\}/g, (m) => m.replace(/<[^>]+>/g, ''))
}

// هروب محارف XML — القيم تدخل داخل <w:t>
const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

async function loadZip(data: ArrayBuffer) {
  const { default: JSZip } = await import('jszip')
  return JSZip.loadAsync(data)
}

/** أسماء المتغيرات الموجودة في القالب، بلا تكرار وبترتيب ورودها. */
export async function scanPlaceholders(data: ArrayBuffer): Promise<string[]> {
  const zip = await loadZip(data)
  const keys: string[] = []
  const seen = new Set<string>()

  for (const path of Object.keys(zip.files)) {
    if (!TEXT_PARTS.test(path)) continue
    const xml = healTokens(await zip.file(path)!.async('string'))
    for (const m of xml.matchAll(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g)) {
      const key = m[1]
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return keys
}

/** يعبّئ القالب بالقيم ويُرجع ملف .docx جاهزاً. المتغيّر بلا قيمة يُستبدل بـ«—». */
export async function fillDocx(
  data: ArrayBuffer,
  values: Record<string, string>
): Promise<Blob> {
  const zip = await loadZip(data)

  for (const path of Object.keys(zip.files)) {
    if (!TEXT_PARTS.test(path)) continue
    let xml = healTokens(await zip.file(path)!.async('string'))
    xml = xml.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_m, key: string) => {
      const v = values[key]
      return esc((v ?? '').trim() === '' ? '—' : v.trim())
    })
    zip.file(path, xml)
  }

  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}

/** تنزيل Blob باسم محدّد (يُستعمل بعد التوليد). */
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/* ============ تسميات عربية مقترحة للمتغيرات الشائعة ============ */
// تُعرض للموظف بدل المفتاح الإنجليزي الخام. غير المعروف يظهر بمفتاحه.
const COMMON_LABELS: Record<string, string> = {
  NAME: 'اسم الطرف الثاني',
  ID_TYPE: 'نوع الهوية',
  ID_NUM: 'رقم الهوية',
  ADDRESS: 'العنوان',
  PHONE: 'الجوال',
  EMAIL: 'البريد الإلكتروني',
  DAY: 'اليوم',
  HIJRI: 'التاريخ الهجري',
  GREG: 'التاريخ الميلادي',
  PCT: 'النسبة',
  PCT_WORDS: 'النسبة كتابةً',
  AMOUNT: 'المبلغ',
  AMOUNT_WORDS: 'المبلغ كتابةً',
  SCOPE: 'نطاق العمل',
  DURATION: 'المدة',
  CASE_NUM: 'رقم القضية',
  COURT: 'المحكمة',
}

export function suggestLabel(key: string): string {
  return COMMON_LABELS[key] ?? key
}

/** المتغيرات التي يملؤها النظام تلقائياً (لا تُعرض للموظف). */
export const AUTO_KEYS = ['DAY', 'HIJRI', 'GREG'] as const

/** قيم التاريخ التلقائية ليوم محدّد. */
export function autoDateValues(isoDate: string): Record<string, string> {
  const d = new Date(isoDate + 'T12:00:00')
  const hijri = d
    .toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
    // Intl قد يضيف «هـ» بنفسه — ننزعها ثم نضيفها مرة واحدة
    .replace(/\s*هـ\s*$/, '')
  return {
    DAY: d.toLocaleDateString('ar', { weekday: 'long' }),
    HIJRI: `${hijri}هـ`,
    GREG: `${d.toLocaleDateString('en-GB')}م`,
  }
}
