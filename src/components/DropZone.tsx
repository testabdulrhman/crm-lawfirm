import { useState } from 'react'
import { Loader2, UploadCloud } from 'lucide-react'

import { cn } from '@/lib/utils'
import { fmtNumber } from '@/lib/format'
import { pickFile, pickFiles } from '@/lib/files'

// منطقة سحب وإفلات موحّدة: الإفلات (أو الضغط ← منتقي ملفات) يمرّر الملفات للأب.
// الأب مسؤول عن الرفع الفعلي ويمرّر uploadingCount لعرض التقدم.
export function DropZone({
  onFiles,
  uploadingCount = 0,
  hint,
  multiple = true,
  className,
}: {
  onFiles: (files: File[]) => void
  uploadingCount?: number
  hint?: string
  multiple?: boolean
  className?: string
}) {
  const [depth, setDepth] = useState(0)
  const busy = uploadingCount > 0

  const pick = async () => {
    if (busy) return
    if (multiple) {
      const files = await pickFiles()
      if (files.length) onFiles(files)
    } else {
      const f = await pickFile()
      if (f) onFiles([f])
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={pick}
      onDragEnter={(e) => {
        e.preventDefault()
        setDepth((d) => d + 1)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        setDepth((d) => Math.max(0, d - 1))
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDepth(0)
        if (busy) return
        const files = Array.from(e.dataTransfer.files)
        if (files.length) onFiles(multiple ? files : files.slice(0, 1))
      }}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-6 text-center transition-colors',
        depth > 0
          ? 'border-gold bg-gold/10'
          : 'border-border hover:border-gold/50 hover:bg-muted/40',
        className
      )}
    >
      {busy ? (
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-gold" />
          {uploadingCount > 1
            ? `جارٍ رفع ${fmtNumber(uploadingCount)} من الملفات…`
            : 'جارٍ الرفع…'}
        </span>
      ) : (
        <>
          <UploadCloud
            className={cn(
              'h-6 w-6',
              depth > 0 ? 'text-gold' : 'text-muted-foreground'
            )}
          />
          <span className="text-sm font-medium text-foreground">
            {multiple
              ? 'اسحب الملفات وأفلتها هنا — أو اضغط للاختيار'
              : 'أفلت الملف هنا — أو اضغط للاختيار'}
          </span>
          {hint && (
            <span className="text-xs text-muted-foreground">{hint}</span>
          )}
        </>
      )}
    </button>
  )
}
