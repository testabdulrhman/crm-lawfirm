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

export async function stampPdf(
  fileUrl: string,
  opts: {
    stampUrl?: string | null
    signatureUrl?: string | null
    position?: StampPosition | null
    // تواقيع إضافية بمواضع مستقلة (وقد تكون في صفحات مختلفة)
    extraSignatures?: StampPosition[] | null
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

  // مركز الختم بنقاط PDF (الأصل أسفل-يسار)
  const cx = (opts.position?.x ?? DEFAULT_STAMP_POS.x) * width
  const cyTop = (opts.position?.y ?? DEFAULT_STAMP_POS.y) * height
  const cy = height - cyTop

  let stampH = 0
  if (opts.stampUrl) {
    const img = await embed(opts.stampUrl)
    const w = STAMP_WIDTH_PT
    stampH = (img.height / img.width) * w
    page.drawImage(img, {
      x: cx - w / 2,
      y: cy - stampH / 2,
      width: w,
      height: stampH,
      opacity: 0.92,
    })
  }
  // التوقيع: مع الختم يعلوه بتداخل خفيف (مظهر طبيعي)، وبدونه يتمركز على الموضع المختار
  if (opts.signatureUrl) {
    const img = await embed(opts.signatureUrl)
    const w = SIGNATURE_WIDTH_PT
    const h = (img.height / img.width) * w
    const x = opts.stampUrl ? cx - w / 2 - 20 : cx - w / 2
    const y = opts.stampUrl
      ? cy - stampH / 2 + Math.max(stampH * 0.55, 30)
      : cy - h / 2
    page.drawImage(img, { x, y, width: w, height: h, opacity: 0.95 })

    // التواقيع الإضافية: كلٌّ يتمركز على موضعه (في صفحته هو)
    for (const sig of opts.extraSignatures ?? []) {
      const p2 = doc.getPage(Math.min(Math.max(sig.page, 1), pageCount) - 1)
      const { width: w2, height: h2 } = p2.getSize()
      const cx2 = sig.x * w2
      const cy2 = h2 - sig.y * h2
      p2.drawImage(img, {
        x: cx2 - w / 2,
        y: cy2 - h / 2,
        width: w,
        height: h,
        opacity: 0.95,
      })
    }
  }

  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}
