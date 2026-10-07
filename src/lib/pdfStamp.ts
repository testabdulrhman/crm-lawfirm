// دمج التوقيع/الختم داخل ملف PDF في المتصفح (pdf-lib) — لا يغادر الملف النظام.
// الموضع: كتلة التوقيع أسفل يسار آخر صفحة (مكان اسم الشركة في خطاباتنا).
// المكتبة تُحمَّل ديناميكياً عند أول استخدام كي لا تُثقل حزمة التطبيق.

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('تعذّر جلب الملف')
  return res.arrayBuffer()
}

// أبعاد الختم/التوقيع بنقاط PDF — تُستخدم أيضاً في واجهة اختيار الموضع
export const STAMP_WIDTH_PT = 115
export const SIGNATURE_WIDTH_PT = 150

// موضع مركز الختم: رقم الصفحة (1-أساس) + كسور 0..1 من أعلى يسار الصفحة
export interface StampPosition {
  page: number
  x: number
  y: number
}

// ما الذي يُطبَّق على الخطاب
export type ApplyMode = 'both' | 'stamp' | 'signature'

export const APPLY_MODE_LABELS: Record<ApplyMode, string> = {
  both: 'ختم وتوقيع',
  stamp: 'ختم فقط',
  signature: 'توقيع فقط',
}

export const applyModeLabel = (m: string | null | undefined): string =>
  APPLY_MODE_LABELS[(m as ApplyMode) ?? 'both'] ?? APPLY_MODE_LABELS.both

// الافتراضي التاريخي: أسفل يسار آخر صفحة (يُستخدم عند غياب موضع مختار)
export const DEFAULT_STAMP_POS = { x: 0.22, y: 0.86 }

// مستطيل عنصر على الصفحة بالنقاط — الأصل أعلى-يسار
export interface LayoutRect {
  x: number
  y: number
  w: number
  h: number
}

// ⚠️ مصدر الحقيقة الوحيد لمواضع الختم/التوقيع — تستخدمه معاينة السحب والدمج النهائي
// معاً حتى يتطابقا بالمليمتر. aspect = ارتفاع الصورة ÷ عرضها.
export function computeLayout(args: {
  pageW: number
  pageH: number
  pos: { x: number; y: number } // مركز الكتلة بكسور 0..1 من أعلى يسار
  stampAspect: number | null // null = بلا ختم
  sigAspect: number | null // null = بلا توقيع
  /**
   * مركز التوقيع مستقلاً عن الختم (طلب المدير 2026-10-07: «أقدر أغير مكان التوقيع ما يكون مكانهم
   * مرتبطين»). null/غائب = الترتيب القديم: التوقيع فوق الختم بتداخل خفيف.
   */
  sigPos?: { x: number; y: number } | null
  /** كتلة رقم الصادر تحت التوقيع مباشرة (وتحت الختم إن لم يكن توقيع) — نسبة ارتفاعها لعرضها */
  numberAspect?: number | null
}): { stamp?: LayoutRect; sig?: LayoutRect; num?: LayoutRect } {
  const { pageW, pageH, pos } = args
  const cx = pos.x * pageW
  const cyTop = pos.y * pageH
  const out: { stamp?: LayoutRect; sig?: LayoutRect; num?: LayoutRect } = {}

  let stampH = 0
  if (args.stampAspect != null) {
    const w = STAMP_WIDTH_PT
    stampH = args.stampAspect * w
    out.stamp = { x: cx - w / 2, y: cyTop - stampH / 2, w, h: stampH }
  }
  if (args.sigAspect != null) {
    const w = SIGNATURE_WIDTH_PT
    const h = args.sigAspect * w
    if (args.sigPos) {
      out.sig = { x: args.sigPos.x * pageW - w / 2, y: args.sigPos.y * pageH - h / 2, w, h }
    } else if (out.stamp) {
      // فوق الختم بتداخل خفيف (نفس معادلة الدمج التاريخية)
      const bottomFromBottom =
        pageH - cyTop - stampH / 2 + Math.max(stampH * 0.55, 30)
      out.sig = { x: cx - w / 2 - 20, y: pageH - bottomFromBottom - h, w, h }
    } else {
      out.sig = { x: cx - w / 2, y: cyTop - h / 2, w, h }
    }
  }
  if (args.numberAspect != null) {
    const anchor = out.sig ?? out.stamp
    if (anchor) {
      const w = NUMBER_WIDTH_PT
      const h = args.numberAspect * w
      out.num = { x: anchor.x + anchor.w / 2 - w / 2, y: anchor.y + anchor.h + 1, w, h }
    }
  }
  return out
}

// ---------- رقم الصادر تحت التوقيع ----------
// pdf-lib لا يشكّل الحروف العربية، فيُرسم النص في لوحة المتصفح (التي تشكّله بخط الهوية) ويُدمج صورة.
export const NUMBER_WIDTH_PT = 150
const NUMBER_SCALE = 4 // كثافة الصورة: ٤ بكسلات لكل نقطة
const NUMBER_FONT_PT = 8.5
const NUMBER_LINE_PT = 11.5

export async function renderNumberBlock(lines: string[]): Promise<{ png: Blob; aspect: number }> {
  const font = `600 ${NUMBER_FONT_PT * NUMBER_SCALE}px "IBM Plex Sans Arabic", system-ui, sans-serif`
  try {
    await document.fonts?.load(font)
  } catch {
    /* الخط الاحتياطي يكفي */
  }
  const w = NUMBER_WIDTH_PT * NUMBER_SCALE
  const h = Math.ceil((lines.length * NUMBER_LINE_PT + 3) * NUMBER_SCALE)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.direction = 'rtl'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  ctx.fillStyle = '#1f2937'
  lines.forEach((line, i) => ctx.fillText(line, w / 2, (1.5 + i * NUMBER_LINE_PT) * NUMBER_SCALE))
  const png = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('تعذّر رسم رقم الصادر'))), 'image/png')
  )
  return { png, aspect: h / w }
}

/** سطرا رقم الصادر كما يُطبعان تحت التوقيع */
export const numberLines = (letterNumber: string, hijriDate: string) => [
  `رقم الصادر: ${letterNumber}`,
  `التاريخ: ${hijriDate}`,
]

export async function stampPdf(
  fileUrl: string,
  opts: {
    stampUrl?: string | null
    signatureUrl?: string | null
    position?: StampPosition | null
    // تواقيع إضافية بمواضع مستقلة (وقد تكون في صفحات مختلفة)
    extraSignatures?: StampPosition[] | null
    /** مركز التوقيع الأساسي مستقلاً عن الختم (في صفحة الختم نفسها) — null = فوق الختم كالسابق */
    sigPosition?: { x: number; y: number } | null
    /** سطور رقم الصادر تحت التوقيع مباشرة */
    numberLines?: string[] | null
  }
): Promise<Blob> {
  if (!opts.stampUrl && !opts.signatureUrl)
    throw new Error('لا يوجد ختم أو توقيع مرفوع — ارفعهما من الإعدادات ← بيانات المكتب')

  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await fetchBytes(fileUrl), {
    ignoreEncryption: true,
  })

  const pageCount = doc.getPageCount()
  const pageIndex = opts.position
    ? Math.min(Math.max(opts.position.page, 1), pageCount) - 1
    : pageCount - 1
  const page = doc.getPage(pageIndex)
  const { width, height } = page.getSize()

  const embed = async (url: string) => {
    const bytes = await fetchBytes(url)
    try {
      return await doc.embedPng(bytes)
    } catch {
      return await doc.embedJpg(bytes)
    }
  }

  // الرسم من computeLayout نفسها التي تعرضها معاينة السحب — تطابق تام
  const stampImg = opts.stampUrl ? await embed(opts.stampUrl) : null
  const sigImg = opts.signatureUrl ? await embed(opts.signatureUrl) : null

  const pos = {
    x: opts.position?.x ?? DEFAULT_STAMP_POS.x,
    y: opts.position?.y ?? DEFAULT_STAMP_POS.y,
  }
  const numBlock = opts.numberLines?.length ? await renderNumberBlock(opts.numberLines) : null
  const numImg = numBlock ? await doc.embedPng(await numBlock.png.arrayBuffer()) : null
  const layout = computeLayout({
    pageW: width,
    pageH: height,
    pos,
    stampAspect: stampImg ? stampImg.height / stampImg.width : null,
    sigAspect: sigImg ? sigImg.height / sigImg.width : null,
    sigPos: opts.sigPosition ?? null,
    numberAspect: numBlock?.aspect ?? null,
  })
  if (numImg && layout.num) {
    const r = layout.num
    page.drawImage(numImg, { x: r.x, y: height - (r.y + r.h), width: r.w, height: r.h })
  }

  // تحويل أعلى-يسار → أصل pdf-lib أسفل-يسار: y = pageH - (top + h)
  if (stampImg && layout.stamp) {
    const r = layout.stamp
    page.drawImage(stampImg, {
      x: r.x,
      y: height - (r.y + r.h),
      width: r.w,
      height: r.h,
      opacity: 0.92,
    })
  }
  if (sigImg && layout.sig) {
    const r = layout.sig
    page.drawImage(sigImg, {
      x: r.x,
      y: height - (r.y + r.h),
      width: r.w,
      height: r.h,
      opacity: 0.95,
    })

    // التواقيع الإضافية: كلٌّ يتمركز على موضعه (في صفحته هو) بنفس الحاسبة
    for (const sig of opts.extraSignatures ?? []) {
      const p2 = doc.getPage(Math.min(Math.max(sig.page, 1), pageCount) - 1)
      const { width: w2, height: h2 } = p2.getSize()
      const l2 = computeLayout({
        pageW: w2,
        pageH: h2,
        pos: sig,
        stampAspect: null,
        sigAspect: sigImg.height / sigImg.width,
      })
      if (l2.sig) {
        p2.drawImage(sigImg, {
          x: l2.sig.x,
          y: h2 - (l2.sig.y + l2.sig.h),
          width: l2.sig.w,
          height: l2.sig.h,
          opacity: 0.95,
        })
      }
    }
  }

  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}
