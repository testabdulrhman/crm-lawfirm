// تفقيط المبالغ بالعربية — «فقط خمسة وأربعون ألف ريال سعودي لا غير»
// يغطي حتى مئات الملايين؛ يكفي أتعاب المكتب بمراحل.

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر',
  'سبعة عشر', 'ثمانية عشر', 'تسعة عشر']
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون']
const HUNDREDS = ['', 'مئة', 'مئتان', 'ثلاثمئة', 'أربعمئة', 'خمسمئة', 'ستمئة', 'سبعمئة', 'ثمانمئة', 'تسعمئة']

function under1000(n: number): string {
  const parts: string[] = []
  const h = Math.floor(n / 100)
  const r = n % 100
  if (h) parts.push(HUNDREDS[h])
  if (r) {
    if (r < 20) parts.push(ONES[r])
    else {
      const o = r % 10
      const t = Math.floor(r / 10)
      parts.push(o ? `${ONES[o]} و${TENS[t]}` : TENS[t])
    }
  }
  return parts.join(' و')
}

function scale(n: number, forms: [string, string, string]): string {
  // forms: [مفرد، مثنى، جمع] — «ألف/ألفان/آلاف»
  if (n === 1) return forms[0]
  if (n === 2) return forms[1]
  if (n >= 3 && n <= 10) return `${under1000(n)} ${forms[2]}`
  return `${under1000(n)} ${forms[0]}`
}

export function tafqitSAR(amount: number): string {
  const whole = Math.floor(Math.abs(amount))
  const halalas = Math.round((Math.abs(amount) - whole) * 100)
  if (whole === 0 && halalas === 0) return ''

  const parts: string[] = []
  const millions = Math.floor(whole / 1_000_000)
  const thousands = Math.floor((whole % 1_000_000) / 1000)
  const rest = whole % 1000
  if (millions) parts.push(scale(millions, ['مليون', 'مليونان', 'ملايين']))
  if (thousands) parts.push(scale(thousands, ['ألف', 'ألفان', 'آلاف']))
  if (rest) parts.push(under1000(rest))

  let s = `فقط ${parts.join(' و')} ريال سعودي`
  if (halalas) s += ` و${under1000(halalas)} هللة`
  return s + ' لا غير'
}
