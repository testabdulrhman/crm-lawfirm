import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Gavel,
  FileText,
  Paperclip,
  Sparkles,
  AlertTriangle,
  ArrowUp,
  ChevronDown,
  Hourglass,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { FilePreviewDialog } from '@/components/FilePreviewDialog'
import { DualDatePicker } from '@/components/DualDatePicker'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState } from '@/components/EmptyState'
import { Ltr } from '@/components/Ltr'

import { fmtDatePref, fmtNumber, todayISO } from '@/lib/format'
import { cn } from '@/lib/utils'
import { pickFile, uploadFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { hijriTextToISO } from '@/lib/hijri'
import { useExtractRuling } from '@/hooks/useAiAnalysis'
import {
  useCaseRulings,
  useAddRuling,
  useUpdateRuling,
  useDeleteRuling,
  useObjectionTask,
  useRulingOutcomes,
} from '@/hooks/useCaseRulings'
import type { Ruling, RulingInput } from '@/types/db'

export function RulingsTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError, error, refetch } = useCaseRulings(caseId)
  const deleteM = useDeleteRuling(caseId)
  useRulingOutcomes(caseId, data)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Ruling | null>(null)
  const [toDelete, setToDelete] = useState<Ruling | null>(null)
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(
    null
  )

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <QueryErrorState
        title="تعذّر تحميل الأحكام"
        error={error}
        onRetry={() => refetch()}
      />
    )
  }

  const rulings = data ?? []

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          variant="gold"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-4 w-4" />
          حكم جديد
        </Button>
      </div>

      {rulings.length === 0 ? (
        <EmptyState
          icon={Gavel}
          title="لا توجد أحكام"
          description="سجّل الأحكام الصادرة في القضية وأرفق صكوكها."
          actionLabel="حكم جديد"
          onAction={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        />
      ) : (
        <>
          <DeadlineBanner ruling={rulings[0]} />
          {/* خط زمني من الأحدث: الابتدائي ← الاستئناف ← العليا */}
          <div className="relative pr-7">
            <span className="absolute bottom-8 right-[9px] top-5 border-r-2 border-border" aria-hidden />
            {rulings.map((r, i) => {
              const older = rulings[i + 1]
              const appealed = older && rulingLevel(r).rank > rulingLevel(older).rank
              return (
                <div key={r.id}>
                  <div className="relative">
                    <span
                      className={cn(
                        'absolute -right-[25px] top-5 h-3.5 w-3.5 rounded-full border-[3px] border-background',
                        i === 0 ? 'bg-gold' : 'bg-muted-foreground/40'
                      )}
                      aria-hidden
                    />
                    <RulingCard
                      ruling={r}
                      latest={i === 0}
                      onEdit={() => {
                        setEditing(r)
                        setFormOpen(true)
                      }}
                      onDelete={() => setToDelete(r)}
                      onPreview={setPreview}
                    />
                  </div>
                  {older && (
                    <p className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
                      {appealed && (
                        <>
                          <ArrowUp className="h-3.5 w-3.5" />
                          استُؤنف
                        </>
                      )}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <RulingForm
            caseId={caseId}
            ruling={editing}
            onDone={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.url ?? null}
        fileName={preview?.name ?? null}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الحكم</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الحكم «{toDelete?.title || toDelete?.ruling_number || 'حكم'}».
              هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete) deleteM.mutate(toDelete.id)
                setToDelete(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** درجة الحكم من اسم المحكمة — بلا حقل جديد */
function rulingLevel(r: Ruling): { rank: number; label: string; title: string; next: string | null } {
  const t = `${r.court_name ?? ''} ${r.title ?? ''}`
  if (/العليا/.test(t)) return { rank: 3, label: 'عليا', title: 'حكم المحكمة العليا', next: null }
  if (/استئناف/.test(t)) return { rank: 2, label: 'استئناف', title: 'حكم الاستئناف', next: 'المحكمة العليا' }
  return { rank: 1, label: 'ابتدائي', title: 'الحكم الابتدائي', next: 'محكمة الاستئناف' }
}

const daysUntil = (iso: string) => Math.round((Date.parse(iso) - Date.parse(todayISO())) / 864e5)

/** شريط المهلة: آخر حكم ما زالت مهلة الاعتراض عليه قائمة — والمكلّف بمهمتها */
function DeadlineBanner({ ruling }: { ruling: Ruling | undefined }) {
  const until = ruling?.objection_until ?? null
  const days = until ? daysUntil(until) : -1
  const { data: task } = useObjectionTask(until && days >= 0 ? ruling!.id : null)
  if (!ruling || !until || days < 0) return null
  const lv = rulingLevel(ruling)
  const urgent = days <= 7
  const who = task?.assignee?.short_name || task?.assignee?.name
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-4 py-3',
        urgent
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300'
      )}
    >
      <Hourglass className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          مهلة الاعتراض على {lv.rank === 1 ? 'الحكم الابتدائي' : 'حكم الاستئناف'}
          {lv.next ? ` أمام ${lv.next}` : ''}
        </p>
        <p className="mt-0.5 text-xs opacity-90">
          تنتهي {fmtDatePref(until)}
          {task
            ? task.status === 'done'
              ? ' — مهمة الاعتراض أُنجزت'
              : ` — مهمة «${task.title.split(' — ')[0]}»${who ? ` عند ${who}` : ''}`
            : ' — لا مهمة اعتراض مسجّلة'}
        </p>
      </div>
      <p className="shrink-0 text-2xl font-bold tabular-nums">
        {days === 0 ? 'اليوم' : fmtNumber(days)}
        {days > 0 && <span className="text-xs font-normal"> {days <= 10 ? 'أيام' : 'يوماً'}</span>}
      </p>
    </div>
  )
}

function RulingCard({
  ruling: r,
  latest,
  onEdit,
  onDelete,
  onPreview,
}: {
  ruling: Ruling
  latest: boolean
  onEdit: () => void
  onDelete: () => void
  onPreview: (p: { url: string; name: string }) => void
}) {
  const [open, setOpen] = useState(false)
  const lv = rulingLevel(r)
  // العنوان القصير كما هو، والطويل (يعيد موضوع القضية) يُستبدل بدرجة الحكم
  const title = r.title && r.title.trim().length <= 28 ? r.title.trim() : lv.title
  const reversed = /نقض|إلغاء|ألغ/.test(r.outcome_short ?? '')
  const longResult = (r.result?.length ?? 0) > 260
  const expandable = !!r.summary?.trim() || longResult
  return (
    <Card>
      <CardContent className="space-y-2.5 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  latest ? 'bg-gold/15 text-gold-700 dark:text-gold-300' : 'bg-muted text-muted-foreground'
                )}
              >
                {lv.label}
              </span>
              <p className="font-semibold text-foreground" title={r.title ?? undefined}>
                {title}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {r.ruling_number && <Ltr>{r.ruling_number}</Ltr>}
              {r.ruling_date && <span>{fmtDatePref(r.ruling_date)}</span>}
              {r.court_name && <span>{r.court_name}</span>}
            </div>
          </div>
          {r.outcome_short && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                reversed
                  ? 'bg-destructive/10 text-destructive'
                  : latest
                    ? 'bg-gold/15 text-gold-700 dark:text-gold-300'
                    : 'bg-muted text-muted-foreground'
              )}
            >
              <Gavel className="h-3 w-3" />
              {r.outcome_short}
            </span>
          )}
        </div>

        {r.result && (
          <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <p className="text-[11px] text-muted-foreground">المنطوق</p>
            <p className={cn('whitespace-pre-wrap leading-7 text-foreground', !open && 'line-clamp-3')}>{r.result}</p>
          </div>
        )}
        {open && r.summary && (
          <p className="whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{r.summary}</p>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
          {expandable && (
            <Button variant="outline" size="sm" onClick={() => setOpen((o) => !o)}>
              <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
              {open ? 'إخفاء الأسباب' : 'عرض الأسباب'}
            </Button>
          )}
          {r.document_url && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                onPreview({ url: r.document_url!, name: r.title || 'صك الحكم' })
              }
            >
              <FileText className="h-4 w-4" />
              صك الحكم
            </Button>
          )}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            تعديل
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
            حذف
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ===================== نموذج الحكم ===================== */

const schema = z.object({
  title: z.string().optional(),
  ruling_number: z.string().optional(),
  ruling_date: z.string().optional(),
  court_name: z.string().optional(),
  result: z.string().optional(),
  summary: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function RulingForm({
  caseId,
  ruling,
  onDone,
}: {
  caseId: string
  ruling: Ruling | null
  onDone: () => void
}) {
  const isEdit = Boolean(ruling)
  const { teamMember } = useAuth()
  const addM = useAddRuling(caseId)
  const updateM = useUpdateRuling(caseId)
  const extractM = useExtractRuling()
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  // رابط الصك المرفوع (يُعاد استخدامه بين الاستخراج والحفظ لتفادي رفع مزدوج)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [hijriHint, setHijriHint] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const pending = addM.isPending || updateM.isPending || uploading

  const {
    register,
    handleSubmit,
    control,
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: ruling?.title ?? '',
      ruling_number: ruling?.ruling_number ?? '',
      ruling_date: ruling?.ruling_date ?? todayISO(), // الافتراضي: اليوم
      court_name: ruling?.court_name ?? '',
      result: ruling?.result ?? '',
      summary: ruling?.summary ?? '',
    },
  })

  // عند اختيار ملف جديد: ألغِ رابط الرفع السابق
  const onPickFile = (f: File | null) => {
    setFile(f)
    setUploadedUrl(null)
  }

  // يضمن وجود رابط للصك (يرفع الملف إن لزم) للاستخراج/الحفظ
  const ensureDocUrl = async (f?: File | null): Promise<string | null> => {
    if (uploadedUrl) return uploadedUrl
    const theFile = f ?? file
    if (theFile) {
      setUploading(true)
      try {
        const { publicUrl } = await uploadFile(theFile, {
          folder: `case_rulings/${caseId}`,
        })
        setUploadedUrl(publicUrl)
        return publicUrl
      } finally {
        setUploading(false)
      }
    }
    return ruling?.document_url ?? null
  }

  // تعبئة الحقول من نتيجة الاستخراج (قيم غير فارغة فقط).
  // يفتح منتقي الملفات إن لم يُرفق صكّ بعد.
  const handleExtract = async () => {
    let f = file
    if (!f && !uploadedUrl && !ruling?.document_url) {
      f = await pickFile()
      if (!f) return
      setFile(f)
      setUploadedUrl(null)
    }
    const url = await ensureDocUrl(f)
    if (!url) return
    // الهوك يُظهر سبب الفشل في toast — نلتقط الرمي حتى لا يبقى وعد مرفوض معلّقاً
    let parsed
    try {
      parsed = await extractM.mutateAsync(url)
    } catch {
      return
    }
    if (!parsed) return
    const set = (k: keyof FormValues, v: string | null | undefined) => {
      if (v && String(v).trim() !== '') setValue(k, String(v).trim())
    }
    set('title', parsed.title)
    set('ruling_number', parsed.ruling_number)
    set('court_name', parsed.court_name)
    set('result', parsed.result)
    set('summary', parsed.summary)
    // التاريخ: الهجري المقروء يُحوَّل هنا بأم القرى (النموذج يخطئ في التحويل بيوم — 2026-10-07)،
    // وميلادي النموذج احتياطٌ لصكٍّ ميلادي التاريخ أصلاً. التقويم المزدوج يخزّن ميلادي.
    const fromHijri = hijriTextToISO(parsed.ruling_date_hijri)
    if (fromHijri) {
      setValue('ruling_date', fromHijri)
    } else if (parsed.ruling_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.ruling_date.trim())) {
      setValue('ruling_date', parsed.ruling_date.trim())
    }
    setHijriHint(parsed.ruling_date_hijri ?? null)
  }

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)

    // حد أدنى قبل الحفظ — كل الحقول اختيارية، وبدونه يُنشأ حكم فارغ تماماً
    const hasContent =
      t(values.title) ||
      t(values.ruling_number) ||
      t(values.result) ||
      file ||
      uploadedUrl ||
      ruling?.document_url
    if (!hasContent) {
      setFormError('أدخل بيانات الحكم (عنوان أو رقم أو نتيجة) أو أرفق الصك.')
      return
    }
    setFormError(null)

    let documentUrl: string | null | undefined = uploadedUrl ?? undefined
    let uploadedByName: string | null | undefined =
      uploadedUrl ? (teamMember?.name ?? null) : undefined

    if (!documentUrl && file) {
      setUploading(true)
      try {
        const { publicUrl } = await uploadFile(file, {
          folder: `case_rulings/${caseId}`,
        })
        documentUrl = publicUrl
        uploadedByName = teamMember?.name ?? null
      } finally {
        setUploading(false)
      }
    }

    const base: Partial<RulingInput> = {
      title: t(values.title),
      ruling_number: t(values.ruling_number),
      ruling_date: t(values.ruling_date),
      court_name: t(values.court_name),
      result: t(values.result),
      summary: t(values.summary),
    }
    if (documentUrl) {
      base.document_url = documentUrl
      base.uploaded_by_name = uploadedByName
    }

    if (isEdit && ruling) {
      await updateM.mutateAsync({ id: ruling.id, input: base })
    } else {
      await addM.mutateAsync({ case_id: caseId, ...base })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل حكم' : 'حكم جديد'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 max-h-[60vh] space-y-3 overflow-y-auto pl-1 pr-1">
        {/* تعبئة تلقائية من الصك بالذكاء الاصطناعي */}
        <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/40 dark:bg-violet-950/20">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-violet-500" />
            تعبئة تلقائية من الصك
          </div>
          <p className="text-xs text-muted-foreground">
            أرفق صورة/ملف الحكم أو الصك، والنظام يقرأه ويملأ الحقول. راجِعها قبل
            الحفظ.
          </p>
          <Button
            type="button"
            size="sm"
            className="bg-violet-600 text-white hover:bg-violet-700"
            disabled={extractM.isPending || uploading}
            onClick={handleExtract}
          >
            {extractM.isPending || uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {extractM.isPending || uploading
              ? 'جارٍ قراءة الصك وتعبئة الحقول...'
              : file || uploadedUrl || ruling?.document_url
                ? 'استخراج البيانات من المرفق'
                : 'إرفاق الصك واستخراج البيانات'}
          </Button>
          {hijriHint && (
            <p className="text-xs text-muted-foreground">
              التاريخ الهجري المقروء: <span className="font-medium">{hijriHint}</span>{' '}
              — تأكّد من التاريخ الميلادي في الحقل.
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="r_title">العنوان</Label>
          <Input id="r_title" {...register('title')} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="r_num">رقم الحكم</Label>
            <Input id="r_num" dir="ltr" {...register('ruling_number')} />
          </div>
          <Controller
            control={control}
            name="ruling_date"
            render={({ field }) => (
              <DualDatePicker
                label="تاريخ الحكم"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r_court">المحكمة المُصدِرة</Label>
          <Input id="r_court" {...register('court_name')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r_result">النتيجة / المنطوق</Label>
          <Textarea id="r_result" rows={3} {...register('result')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="r_summary">الملخّص</Label>
          <Textarea id="r_summary" rows={2} {...register('summary')} />
        </div>

        <FilePicker
          label="صك الحكم (اختياري)"
          file={file}
          existing={ruling?.document_url}
          onPick={onPickFile}
        />

        {formError && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {formError}
          </p>
        )}
      </div>

      <DialogFooter className="gap-2">
        <Button type="submit" variant="gold" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? 'حفظ' : 'إضافة'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          إلغاء
        </Button>
      </DialogFooter>
    </form>
  )
}

/* ===================== اختيار ملف ===================== */

export function FilePicker({
  label,
  file,
  existing,
  onPick,
}: {
  label: string
  file: File | null
  existing?: string | null
  onPick: (f: File | null) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            const f = await pickFile()
            if (f) onPick(f)
          }}
        >
          <Paperclip className="h-4 w-4" />
          اختيار ملف
        </Button>
        {file ? (
          <span className="truncate text-xs text-muted-foreground">
            {file.name}
          </span>
        ) : existing ? (
          <span className="text-xs text-muted-foreground">يوجد ملف مرفق</span>
        ) : null}
        {file && (
          <button
            type="button"
            className="text-xs text-destructive"
            onClick={() => onPick(null)}
          >
            إزالة
          </button>
        )}
      </div>
    </div>
  )
}
