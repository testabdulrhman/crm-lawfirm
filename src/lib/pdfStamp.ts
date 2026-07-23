// دمج التوقيع/الختم داخل ملف PDF في المتصفح (pdf-lib) — لا يغادر الملف النظام.
// الموضع: كتلة التوقيع أسفل يسار آخر صفحة (مكان اسم الشركة في خطاباتنا).
// المكتبة تُحمَّل ديناميكياً عند أول استخدام كي لا تُثقل حزمة التطبيق.

async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error('تعذّر جلب الملف')
  return res.arrayBuffer()
}

export async function stampPdf(
  fileUrl: string,
  opts: { stampUrl?: string | null; signatureUrl?: string | null }
): Promise<Blob> {
  if (!opts.stampUrl && !opts.signatureUrl)
    throw new Error('لا يوجد ختم أو توقيع مرفوع — ارفعهما من الإعدادات ← بيانات المكتب')

  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await fetchBytes(fileUrl), {
    ignoreEncryption: true,
  })
  const page = doc.getPage(doc.getPageCount() - 1)
  const { width } = page.getSize()

  const embed = async (url: string) => {
    const bytes = await fetchBytes(url)
    try {
      return await doc.embedPng(bytes)
    } catch {
      return await doc.embedJpg(bytes)
    }
  }

  const x = width * 0.12
  const baseY = 58

  // التوقيع فوق الختم بتداخل خفيف (مظهر طبيعي)
  if (opts.signatureUrl) {
    const img = await embed(opts.signatureUrl)
    const w = 150
    page.drawImage(img, {
      x,
      y: baseY + 30,
      width: w,
      height: (img.height / img.width) * w,
      opacity: 0.95,
    })
  }
  if (opts.stampUrl) {
    const img = await embed(opts.stampUrl)
    const w = 115
    page.drawImage(img, {
      x: x + 20,
      y: baseY,
      width: w,
      height: (img.height / img.width) * w,
      opacity: 0.92,
    })
  }

  const bytes = await doc.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}
