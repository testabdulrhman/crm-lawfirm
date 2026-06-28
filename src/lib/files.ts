// طبقة تجريد لاختيار/رفع الملفات (جاهزية Capacitor — القسم 1.1 بند 6).
// تلفّ منطق اختيار الملف ورفعه إلى Supabase Storage. عند التغليف بـ Capacitor
// نضيف Camera/Filesystem هنا دون لمس مكوّنات الواجهة.

import { supabase, DOCS_BUCKET, publicUrl } from '@/lib/supabase'

export interface PickFileOptions {
  accept?: string // مثل 'image/*' أو '.pdf'
  multiple?: boolean
}

// اختيار ملف عبر input مخفي (الويب). لاحقاً: Capacitor Camera/Filesystem.
export function pickFile(options: PickFileOptions = {}): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (options.accept) input.accept = options.accept
    input.multiple = false
    input.onchange = () => {
      const file = input.files?.[0] ?? null
      resolve(file)
    }
    // إن أُغلق المنتقي دون اختيار لا يصدر حدث؛ نعتمد على onchange فقط.
    input.click()
  })
}

// اختيار عدّة ملفات دفعة واحدة (multiple). يُرجع مصفوفة (فارغة إن أُلغي).
export function pickFiles(options: PickFileOptions = {}): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    if (options.accept) input.accept = options.accept
    input.multiple = true
    input.onchange = () => {
      resolve(input.files ? Array.from(input.files) : [])
    }
    input.click()
  })
}

export interface UploadResult {
  path: string
  publicUrl: string
}

// رفع ملف إلى Supabase Storage وإرجاع المسار والرابط العام.
export async function uploadFile(
  file: File,
  opts: { folder?: string; bucket?: string } = {}
): Promise<UploadResult> {
  const bucket = opts.bucket ?? DOCS_BUCKET
  const folder = opts.folder ? `${opts.folder.replace(/\/$/, '')}/` : ''
  const safeName = file.name.replace(/[^\w.\-]+/g, '_')
  const path = `${folder}${Date.now()}_${safeName}`

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  })
  if (error) throw error

  return { path, publicUrl: publicUrl(path) }
}

// اختيار + رفع في خطوة واحدة. يُرجع null إن لم يُختر ملف.
export async function pickAndUpload(
  options: PickFileOptions & { folder?: string; bucket?: string } = {}
): Promise<UploadResult | null> {
  const file = await pickFile(options)
  if (!file) return null
  return uploadFile(file, { folder: options.folder, bucket: options.bucket })
}
