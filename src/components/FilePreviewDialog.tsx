// عارض ملفات عام قابل لإعادة الاستخدام (الطلبات، القضايا، الوكالات...).
// يعاين PDF والصور داخل النظام، والأنواع الأخرى تعطي خيار فتح/تنزيل.
import { FileQuestion, ExternalLink, Download } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { openExternal } from '@/lib/external'

type FileKind = 'pdf' | 'image' | 'other'

function detectKind(name: string): FileKind {
  const ext = name.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  if (ext === 'pdf') return 'pdf'
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return 'image'
  return 'other'
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
  const name = fileName || fileUrl || 'ملف'
  const kind = fileUrl ? detectKind(fileName || fileUrl) : 'other'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pl-8">
            <DialogTitle className="truncate text-base">{name}</DialogTitle>
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
              <Button variant="gold" asChild>
                <a href={fileUrl} download={fileName ?? undefined}>
                  <Download className="h-4 w-4" />
                  تنزيل
                </a>
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
