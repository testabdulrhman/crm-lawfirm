import { useRef, useState } from 'react'
import { FileUp, Loader2, Sparkles, X } from 'lucide-react'

import { supabase } from '@/lib/supabase'
import { toast } from '@/hooks/use-toast'
import { errMessage } from '@/lib/errors'
import { fmtFileSize } from '@/lib/format'
import { cn } from '@/lib/utils'

/** ما تُرجعه دالة extract-case بعد قراءة المستند */
export interface ExtractedCase {
  title: string | null
  type: string | null
  client_name: string | null
  opponent_name: string | null
  court: string | null
  court_division: string | null
  court_num: string | null
  filing_date: string | null
  next_session_date: string | null
  subject: string | null
  hijri_note: string | null
}

const MAX_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp'

/** ملف → base64 خام (بلا بادئة data:) للإرسال إلى الدالة */
function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onerror = () => reject(new Error('تعذّرت قراءة الملف من جهازك'))
    r.onload = () => {
      const s = String(r.result || '')
      const i = s.indexOf(',')
      resolve(i >= 0 ? s.slice(i + 1) : s)
    }
    r.readAsDataURL(file)
  })
}

/**
 * إسقاط صحيفة الدعوى فتُملأ حقول القضية.
 *
 * الملف يُرسل **مباشرة** إلى الدالة ولا يُرفع إلى التخزين: القضية لم تُنشأ
 * بعد، والرفع قبل الحفظ يخلّف ملفاً يتيماً كلما تراجع الموظف. نحتفظ به في
 * الذاكرة، فإن حُفظت القضية رفعناه أول مستند لها.
 *
 * النتيجة **تُعرض للمراجعة ولا تُحفظ** — الاستخراج الآلي يخطئ، ولا يصح أن
 * يفتح قضية دون إقرار موظف.
 */
export function CaseDocDropzone({
  onExtracted,
  onFileChange,
}: {
  onExtracted: (data: ExtractedCase) => void
  /** الملف نفسه — ليُرفع مستنداً للقضية بعد حفظها */
  onFileChange?: (f: File | null) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [filled, setFilled] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handle = async (f: File) => {
    if (f.size > MAX_BYTES) {
      toast({
        variant: 'destructive',
        title: 'الملف كبير',
        description: `${fmtFileSize(f.size)} — الحد ١٠ ميغابايت. ارفع الصفحات المهمة فقط.`,
      })
      return
    }
    const ok =
      f.type === 'application/pdf' ||
      f.type.startsWith('image/') ||
      /\.(pdf|png|jpe?g|webp)$/i.test(f.name)
    if (!ok) {
      toast({
        variant: 'destructive',
        title: 'نوع الملف غير مدعوم',
        description: 'PDF أو صورة فقط. ملفات Word غير مقروءة — احفظها PDF.',
      })
      return
    }

    setFile(f)
    onFileChange?.(f)
    setBusy(true)
    setFilled(null)
    try {
      const doc_base64 = await toBase64(f)
      const { data, error } = await supabase.functions.invoke('extract-case', {
        body: { doc_base64, media_type: f.type, file_name: f.name },
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'تعذّر تحليل المستند')

      const parsed = data.parsed as ExtractedCase
      const count = Object.entries(parsed).filter(
        ([k, v]) => k !== 'hijri_note' && v != null && String(v).trim() !== ''
      ).length

      onExtracted(parsed)
      setFilled(count)
      toast({
        variant: 'success',
        title: `عُبِّئ ${count} حقلاً من المستند`,
        description: 'راجعها قبل الحفظ — الاستخراج الآلي قد يخطئ.',
      })
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'تعذّر تحليل المستند',
        description: errMessage(e),
      })
    } finally {
      setBusy(false)
    }
  }

  const clear = () => {
    setFile(null)
    setFilled(null)
    onFileChange?.(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (file && !busy) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/5 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Sparkles className="h-4 w-4 shrink-0 text-gold" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {filled != null
                ? `عُبِّئ ${filled} حقلاً — راجعها قبل الحفظ · يُرفق بالقضية بعد الحفظ`
                : 'لم يُستخرج شيء · يُرفق بالقضية بعد الحفظ'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={clear}
          title="إزالة الملف"
          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-destructive"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = e.dataTransfer.files?.[0]
        if (f) void handle(f)
      }}
      onClick={() => !busy && inputRef.current?.click()}
      className={cn(
        'cursor-pointer rounded-xl border border-dashed px-4 py-6 text-center transition-colors',
        dragging
          ? 'border-gold bg-gold/10'
          : 'border-border bg-card hover:border-gold/50 hover:bg-muted/40',
        busy && 'cursor-wait opacity-70'
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handle(f)
        }}
      />
      {busy ? (
        <>
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
          <p className="mt-2 text-sm text-foreground">يقرأ المستند…</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            قد يستغرق نصف دقيقة للمستندات الطويلة
          </p>
        </>
      ) : (
        <>
          <FileUp className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-foreground">
            أفلِت صحيفة الدعوى هنا، أو انقر للاختيار
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            يقرأها الذكاء الاصطناعي ويملأ ما يستطيع — تراجعه قبل الحفظ · PDF أو
            صورة، حتى ١٠ ميغابايت
          </p>
        </>
      )}
    </div>
  )
}
