// توليد عقد جاهز من قالب Word — تعبئة الحقول داخل docx (استبدال نصي في XML)
// القالب في public/templates ويُحمَّل عند الطلب، وJSZip يُستورد ديناميكياً

export interface DebtContractInput {
  name: string
  idType: string // سجل مدني / سجل تجاري / إقامة
  idNum: string
  address: string
  phone: string
  email: string
  pct: number
  signedDate: string // ISO yyyy-mm-dd
}

// تفقيط النسبة (1–99) بصيغة تناسب «... بالمائة»
const UNITS = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
]
const TEENS = [
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
]
const TENS = [
  '',
  '',
  'عشرون',
  'ثلاثون',
  'أربعون',
  'خمسون',
  'ستون',
  'سبعون',
  'ثمانون',
  'تسعون',
]

export function pctWords(n: number): string {
  if (n < 1 || n > 99) return String(n)
  if (n < 10) return UNITS[n]
  if (n < 20) return TEENS[n - 10]
  const t = Math.floor(n / 10)
  const u = n % 10
  return u === 0 ? TENS[t] : `${UNITS[u]} و${TENS[t]}`
}

// هروب محارف XML — القيم تدخل داخل <w:t>
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

export async function generateDebtContract(
  input: DebtContractInput
): Promise<Blob> {
  const { default: JSZip } = await import('jszip')

  const res = await fetch(
    `${import.meta.env.BASE_URL}templates/debt-collection-contract.docx`
  )
  if (!res.ok) throw new Error('تعذّر تحميل قالب العقد من الخادم')
  const zip = await JSZip.loadAsync(await res.arrayBuffer())

  const docPath = 'word/document.xml'
  let xml = await zip.file(docPath)!.async('string')

  const d = new Date(input.signedDate + 'T12:00:00')
  const day = d.toLocaleDateString('ar', { weekday: 'long' })
  const hijri = d.toLocaleDateString('ar-SA-u-ca-islamic-umalqura-nu-latn', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
  const greg = d.toLocaleDateString('en-GB') // dd/mm/yyyy

  // Intl قد يضيف لاحقة «هـ» بنفسه — ننزعها ثم نضيفها مرة واحدة
  const hijriClean = hijri.replace(/\s*هـ\s*$/, '')

  const values: Record<string, string> = {
    DAY: day,
    HIJRI: `${hijriClean}هـ`,
    GREG: `${greg}م`,
    NAME: input.name,
    ID_TYPE: input.idType,
    ID_NUM: input.idNum,
    ADDRESS: input.address,
    PHONE: input.phone,
    EMAIL: input.email || '—',
    PCT: String(input.pct),
    PCT_WORDS: pctWords(input.pct),
  }
  for (const [key, val] of Object.entries(values)) {
    xml = xml.replaceAll(`{{${key}}}`, esc(val.trim()))
  }

  zip.file(docPath, xml)
  return zip.generateAsync({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
}
