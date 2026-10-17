// خطاب Word بترويسة المكتب من نص «الباحث» (2026-10-17): الشعار واسم المكتب أعلى الصفحة، والعنوان والجوال
// والسجل والرقم الضريبي أسفلها، والمتن من الإجابة (Markdown مبسّط: عناوين ونقاط وترقيم وعريض وجداول).
// يُنزَّل ليُراجَع ويُعدَّل؛ ورقم الصادر وتاريخه يُطبعان عند التوقيع على PDF (pdfStamp) فلا يُكتبان هنا.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, ImageRun, Packer, Paragraph, TextRun,
} from 'docx'

import type { OfficeInfo } from '@/types/db'

const FONT = 'Traditional Arabic'
const BODY = 32 // نصف نقاط = 16pt
const SMALL = 22

const run = (text: string, opts: { bold?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({
    text,
    bold: opts.bold,
    boldComplexScript: opts.bold,
    size: opts.size ?? BODY,
    sizeComplexScript: opts.size ?? BODY,
    color: opts.color,
    font: FONT,
    rightToLeft: true,
    language: { bidirectional: 'ar-SA' },
  })

/** «**عريض** وعادي» ⇒ مقاطع؛ والروابط [نص](رابط) تبقى نصها */
function inline(text: string, size = BODY): TextRun[] {
  const clean = text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`([^`]+)`/g, '$1')
  return clean.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part) =>
    part.startsWith('**') && part.endsWith('**') ? run(part.slice(2, -2), { bold: true, size }) : run(part.replace(/\*([^*]+)\*/g, '$1'), { size })
  )
}

const para = (children: TextRun[], opts: { align?: (typeof AlignmentType)[keyof typeof AlignmentType]; before?: number; after?: number; indent?: number } = {}) =>
  new Paragraph({
    children,
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.BOTH,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 120, line: 360 },
    indent: opts.indent ? { start: opts.indent } : undefined,
  })

/** متن الخطاب من Markdown — سطراً سطراً، بلا سطر «للتحقق:» إن وُجد */
function bodyParagraphs(md: string): Paragraph[] {
  const out: Paragraph[] = []
  const lines = md.replace(/\r/g, '').split('\n')
  for (const raw of lines) {
    const line = raw.trimEnd()
    const t = line.trim()
    if (!t) continue
    if (/^للتحقق\s*:/.test(t)) continue
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) continue
    if (/^\|?\s*:?-{3,}/.test(t)) continue // فاصل الجدول
    const h = t.match(/^(#{1,6})\s+(.*)$/)
    if (h) {
      const size = h[1].length <= 2 ? 34 : BODY
      out.push(para([run(h[2].replace(/\*\*/g, ''), { bold: true, size })], {
        // «start» لا يفهمه كل برنامج (عرض أبل يضعه يساراً)؛ والضبط في فقرة RTL يبدأ من اليمين في كلها
        align: h[1].length === 1 ? AlignmentType.CENTER : AlignmentType.BOTH, before: 200,
      }))
      continue
    }
    if (t.startsWith('|')) {
      const cells = t.split('|').map((c) => c.trim()).filter(Boolean)
      out.push(para(inline(cells.join(' — '))))
      continue
    }
    const bullet = t.match(/^[-*•]\s+(.*)$/)
    if (bullet) {
      out.push(para([run('• '), ...inline(bullet[1])], { indent: 360, after: 60 }))
      continue
    }
    const num = t.match(/^(\d+)[.)-]\s+(.*)$/)
    if (num) {
      out.push(para([run(`${num[1]}- `), ...inline(num[2])], { indent: 360, after: 60 }))
      continue
    }
    const quote = t.match(/^>\s?(.*)$/)
    out.push(para(inline(quote ? quote[1] : t)))
  }
  return out
}

async function logoImage(url: string | null): Promise<ImageRun | null> {
  if (!url) return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const type = blob.type.includes('png') ? 'png' : blob.type.includes('jpeg') || blob.type.includes('jpg') ? 'jpg' : null
    if (!type) return null
    const data = new Uint8Array(await blob.arrayBuffer())
    // نسبة الأبعاد من الصورة نفسها — ارتفاع ثابت ٧٠ نقطة
    const bmp = await createImageBitmap(blob).catch(() => null)
    const h = 70
    const w = bmp ? Math.round((bmp.width / bmp.height) * h) : 70
    return new ImageRun({ type, data, transformation: { width: Math.min(w, 260), height: h } })
  } catch {
    return null
  }
}

export async function buildLetterDocx(params: { office: OfficeInfo | null; body: string }): Promise<Blob> {
  const o = params.office
  const logo = await logoImage(o?.logo_url ?? null)
  const headerChildren: Paragraph[] = []
  if (logo) headerChildren.push(new Paragraph({ children: [logo], alignment: AlignmentType.CENTER, bidirectional: true }))
  if (o?.office_name) {
    headerChildren.push(new Paragraph({
      children: [run(o.office_name, { bold: true, size: 26 })],
      alignment: AlignmentType.CENTER,
      bidirectional: true,
      spacing: { after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'C9A982', space: 4 } },
    }))
  }
  const footerBits = [
    o?.address,
    o?.phone ? `جوال: ${o.phone}` : null,
    o?.commercial_register ? `س.ت: ${o.commercial_register}` : null,
    o?.tax_number ? `الرقم الضريبي: ${o.tax_number}` : null,
  ].filter(Boolean) as string[]

  const doc = new Document({
    creator: o?.office_name ?? 'المكتب',
    styles: { default: { document: { run: { font: FONT, size: BODY, rightToLeft: true } } } },
    sections: [{
      properties: {
        page: { margin: { top: 1700, bottom: 1300, left: 1250, right: 1250, header: 500, footer: 450 } },
      },
      headers: { default: new Header({ children: headerChildren }) },
      footers: {
        default: new Footer({
          children: footerBits.length ? [new Paragraph({
            children: [run(footerBits.join('  ·  '), { size: SMALL - 4, color: '6B7280' })],
            alignment: AlignmentType.CENTER,
            bidirectional: true,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: 'C9A982', space: 4 } },
          })] : [],
        }),
      },
      children: bodyParagraphs(params.body),
    }],
  })
  return Packer.toBlob(doc)
}

/** اسم ملف من أول سطر للنص — بلا رموز لا يقبلها نظام الملفات */
export function letterFileName(body: string): string {
  const first = body.split('\n').map((l) => l.replace(/[#*>|`]/g, '').trim()).find((l) => l.length > 3) ?? 'خطاب'
  return `${first.replace(/[\\/:*?"<>|]/g, ' ').slice(0, 60).trim()}.docx`
}
