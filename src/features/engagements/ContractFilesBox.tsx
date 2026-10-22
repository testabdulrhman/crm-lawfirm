// ملفات العقد في نموذج «عقد جديد» (طلب المدير 2026-10-22: «العقد يكون عندي نسختين pdf + وورد، ودي أقدر
// اضيفهم كلهم + ودي الذكاء يستخرج البيانات من العقد ويعبي المعلومات، مو لازم اعبيهم انا»).
// يُسقط الموظف النسختين معاً ⇒ تُرفعان فوراً ⇒ تُقرآن معاً (extract-contract) ⇒ يُعبَّأ النموذج.
import { useRef, useState } from 'react'
import { FileText, FileType2, ImageIcon, Loader2, RotateCw, Sparkles, Upload, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { errMessage } from '@/lib/errors'
import { uploadFile } from '@/lib/files'
import { cn } from '@/lib/utils'
import { useExtractContract, type ContractExtraction } from '@/hooks/useAiAnalysis'

export interface ContractFile {
  key: string
  name: string
  kind: 'word' | 'pdf' | 'image' | 'other'
  url: string | null
  uploading: boolean
  error?: string
}

const kindOf = (f: File): ContractFile['kind'] => {
  const n = f.name.toLowerCase()
  if (n.endsWith('.docx') || f.type.includes('wordprocessingml')) return 'word'
  if (n.endsWith('.pdf') || f.type === 'application/pdf') return 'pdf'
  if (f.type.startsWith('image/')) return 'image'
  return 'other'
}

const KIND_LABEL: Record<ContractFile['kind'], string> = { word: 'Word', pdf: 'PDF', image: 'صورة', other: 'ملف' }

export function ContractFilesBox({
  files,
  setFiles,
  existing,
  onExtracted,
}: {
  files: ContractFile[]
  setFiles: (fn: (f: ContractFile[]) => ContractFile[]) => void
  /** في التعديل: يوجد ملف مرفق سابقاً */
  existing?: boolean
  onExtracted: (r: ContractExtraction) => void
}) {
  const extractM = useExtractContract()
  const [drag, setDrag] = useState(false)
  const [done, setDone] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // رقم آخر طلب قراءة — ملف أُضيف أثناء القراءة يعيدها بالنسخ كلها، وتُهمل النتيجة الأقدم
  const runRef = useRef(0)
  const filesRef = useRef(files)
  filesRef.current = files

  const extract = (urls: string[]) => {
    const run = ++runRef.current
    setDone(false)
    extractM.mutate(urls, {
      onSuccess: (r) => {
        if (run !== runRef.current) return
        onExtracted(r)
        setDone(true)
      },
    })
  }

  const add = async (list: FileList | File[] | null) => {
    const picked = Array.from(list ?? []).slice(0, 4)
    if (!picked.length) return
    const added: ContractFile[] = picked.map((f) => ({
      key: crypto.randomUUID(), name: f.name, kind: kindOf(f), url: null, uploading: true,
    }))
    setFiles((cur) => [...cur, ...added])
    const urls = await Promise.all(
      picked.map(async (f, i) => {
        const key = added[i].key
        try {
          const { publicUrl } = await uploadFile(f, { folder: 'engagements' })
          setFiles((cur) => cur.map((x) => (x.key === key ? { ...x, url: publicUrl, uploading: false } : x)))
          return { url: publicUrl, kind: added[i].kind }
        } catch (e) {
          setFiles((cur) => cur.map((x) => (x.key === key ? { ...x, uploading: false, error: errMessage(e) ?? 'تعذّر الرفع' } : x)))
          return null
        }
      })
    )
    // القراءة بكل النسخ المرفوعة حتى الآن (السابقة والجديدة معاً) — ما لم يُحذف منها
    const kept = new Set(filesRef.current.map((x) => x.key))
    const all = [...new Set([
      ...filesRef.current.filter((x) => x.url && x.kind !== 'other').map((x) => x.url!),
      ...urls.filter((u, i): u is { url: string; kind: ContractFile['kind'] } => !!u && u.kind !== 'other' && kept.has(added[i].key)).map((u) => u.url),
    ])]
    if (all.length) extract(all)
  }

  const readable = files.filter((f) => f.url && f.kind !== 'other').map((f) => f.url!)
  const busy = extractM.isPending || files.some((f) => f.uploading)

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void add(e.dataTransfer.files) }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        className={cn(
          'flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors',
          drag ? 'border-gold bg-gold/10' : 'border-gold/40 bg-gold/[0.04] hover:bg-gold/10'
        )}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gold/15">
          <Upload className="h-4 w-4 text-gold" />
        </span>
        <p className="text-sm font-semibold">أسقط ملفات العقد هنا — PDF وWord معاً</p>
        <p className="text-xs text-muted-foreground">
          {existing ? 'يُستبدل بها الملف المرفق، ' : ''}ويقرؤها الذكاء ويعبّئ الحقول والبنود والدفعات — راجعها قبل الحفظ
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
          className="hidden"
          onChange={(e) => { void add(e.target.files); e.target.value = '' }}
        />
      </div>

      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((f) => (
            <span
              key={f.key}
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-xs',
                f.error ? 'border-destructive/40 text-destructive' : 'bg-muted/40'
              )}
              title={f.error ?? f.name}
            >
              {f.uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : f.kind === 'word' ? (
                <FileType2 className="h-3.5 w-3.5 text-sky-600" />
              ) : f.kind === 'image' ? (
                <ImageIcon className="h-3.5 w-3.5" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-rose-600" />
              )}
              <span className="font-medium">{KIND_LABEL[f.kind]}</span>
              <span className="max-w-[180px] truncate text-muted-foreground">{f.error ?? f.name}</span>
              <button
                type="button"
                aria-label="إزالة"
                className="rounded p-0.5 hover:bg-muted"
                onClick={() => setFiles((cur) => cur.filter((x) => x.key !== f.key))}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {extractM.isPending && (
        <p className="flex items-center gap-2 rounded-lg bg-gold/10 px-3 py-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 animate-pulse text-gold" />
          يقرأ العقد ويعبّئ الحقول… (نصف دقيقة تقريباً)
        </p>
      )}
      {extractM.isError && !busy && readable.length > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 px-3 py-2 text-sm">
          <span className="text-destructive">تعذّرت قراءة العقد — {errMessage(extractM.error)}</span>
          <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => extract(readable)}>
            <RotateCw className="h-3.5 w-3.5" /> أعد المحاولة
          </Button>
        </div>
      )}
      {done && !busy && (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          <Sparkles className="h-4 w-4" />
          عبّأ الذكاء الحقول من العقد — راجعها قبل الحفظ.
        </p>
      )}
    </div>
  )
}
