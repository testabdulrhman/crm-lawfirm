// عارض ملفات عام قابل لإعادة الاستخدام (الطلبات، القضايا، الوكالات...).
// يعاين PDF والصور داخل النظام، والأنواع الأخرى تعطي خيار فتح/تنزيل.
import { useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { FileQuestion, FileText, ExternalLink, Download, Loader2 } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { openExternal } from '@/lib/external'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'

type FileKind = 'pdf' | 'image' | 'other'

function kindFromExt(s: string): FileKind {
  const ext = s.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'].includes(ext))
    return 'image'
  return 'other'
}

// نعتمد على رابط الملف أولاً (يحمل الامتداد الحقيقي)، ثم على الاسم.
// (بعض المنادين يمرّرون عنواناً وصفيّاً كاسم بلا امتداد — مثل صك الحكم.)
function detectKind(url: string | null, name: string | null): FileKind {
  const fromUrl = url ? kindFromExt(url) : 'other'
  if (fromUrl !== 'other') return fromUrl
  return name ? kindFromExt(name) : 'other'
}

export interface FilePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fileUrl: string | null
  fileName: string | null
}

export function FilePreviewDialog({
  open,
  onOpenChange,
  fileUrl,
  fileName,
}: FilePreviewDialogProps) {
  // لا نعرض الـ URL الكامل كعنوان — يُقص من بدايته المهمة في RTL
  const name = fileName || 'ملف'
  const kind = fileUrl ? detectKind(fileUrl, fileName) : 'other'
  // WKWebView (تطبيق الآيفون) يعرض من PDF داخل iframe الصفحة الأولى فقط —
  // نستبدل المعاينة بزر فتح بارز عبر المتصفح
  const isNativeIos = Capacitor.getPlatform() === 'ios'
  const [downloading, setDownloading] = useState(false)

  // خاصية download في <a> تُتجاهل للروابط عابرة النطاق (تخزين Supabase) —
  // ننزّل عبر fetch → blob → رابط مؤقت باسم الملف
  const download = async () => {
    if (!fileUrl) return
    // ⚠️ WKWebView يُلغي تنزيل روابط blob بصمت (لا مدير تنزيلات ولا استثناء) —
    //    على iOS نفتح الرابط في متصفح النظام الذي يعرض المشاركة/الحفظ بنفسه
    if (isNativeIos) {
      openExternal(fileUrl)
      return
    }
    setDownloading(true)
    try {
      const res = await fetch(fileUrl)
      if (!res.ok) throw new Error(`فشل التنزيل (HTTP ${res.status})`)
      const blob = await res.blob()
      const obj = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = obj
      a.download = fileName || 'ملف'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(obj), 10_000)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'تعذّر تنزيل الملف',
        description: errMessage(e),
      })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pl-8">
            <DialogTitle dir="auto" className="truncate text-base">
              {name}
            </DialogTitle>
            {fileUrl && (
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => openExternal(fileUrl)}
              >
                <ExternalLink className="h-4 w-4" />
                فتح في تبويب جديد
              </Button>
            )}
          </div>
        </DialogHeader>

        {!fileUrl ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            لا يوجد ملف للعرض.
          </p>
        ) : kind === 'pdf' && isNativeIos ? (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <FileText className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              لعرض جميع صفحات الملف افتحه في المتصفح.
            </p>
            <Button variant="gold" onClick={() => openExternal(fileUrl)}>
              <ExternalLink className="h-4 w-4" />
              فتح الملف
            </Button>
          </div>
        ) : kind === 'pdf' ? (
          <iframe
            src={fileUrl}
            title={name}
            className="h-[70vh] w-full rounded-md border md:h-[75vh]"
          />
        ) : kind === 'image' ? (
          <div className="flex max-h-[70vh] justify-center overflow-auto md:max-h-[75vh]">
            <img
              src={fileUrl}
              alt={name}
              className="mx-auto max-h-[70vh] object-contain md:max-h-[75vh]"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 py-12 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <FileQuestion className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              لا يمكن معاينة هذا النوع من الملفات داخل النظام.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="outline" onClick={() => openExternal(fileUrl)}>
                <ExternalLink className="h-4 w-4" />
                فتح في تبويب جديد
              </Button>
              <Button variant="gold" disabled={downloading} onClick={download}>
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                تنزيل
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
