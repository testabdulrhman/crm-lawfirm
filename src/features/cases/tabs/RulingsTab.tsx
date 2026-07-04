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
  Ban,
  RotateCcw,
  Sparkles,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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

import { cn } from '@/lib/utils'
import { fmtDatePref, todayISO } from '@/lib/format'
import { pickFile, uploadFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { useExtractRuling } from '@/hooks/useAiAnalysis'
import {
  useCaseRulings,
  useAddRuling,
  useUpdateRuling,
  useDeleteRuling,
  useDropRuling,
  useUndropRuling,
} from '@/hooks/useCaseRulings'
import type { Ruling, RulingInput } from '@/types/db'

export function RulingsTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useCaseRulings(caseId)
  const deleteM = useDeleteRuling(caseId)
  const undropM = useUndropRuling(caseId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Ruling | null>(null)
  const [toDelete, setToDelete] = useState<Ruling | null>(null)
  const [dropFor, setDropFor] = useState<Ruling | null>(null)
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
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {rulings.map((r) => (
            <RulingCard
              key={r.id}
              ruling={r}
              onEdit={() => {
                setEditing(r)
                setFormOpen(true)
              }}
              onDelete={() => setToDelete(r)}
              onDrop={() => setDropFor(r)}
              onUndrop={() => undropM.mutate(r.id)}
              onPreview={setPreview}
            />
          ))}
        </div>
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

      <DropDialog
        caseId={caseId}
        ruling={dropFor}
        onClose={() => setDropFor(null)}
      />

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

function RulingCard({
  ruling: r,
  onEdit,
  onDelete,
  onDrop,
  onUndrop,
  onPreview,
}: {
  ruling: Ruling
  onEdit: () => void
  onDelete: () => void
  onDrop: () => void
  onUndrop: () => void
  onPreview: (p: { url: string; name: string }) => void
}) {
  const dropped = !!r.is_dropped
  return (
    <Card className={cn(dropped && 'opacity-75')}>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cn(
                'font-semibold text-foreground',
                dropped && 'line-through'
              )}
            >
              {r.title || 'حكم'}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {r.ruling_number && <span dir="ltr">رقم: {r.ruling_number}</span>}
              {r.ruling_date && <span>{fmtDatePref(r.ruling_date)}</span>}
              {r.court_name && <span>{r.court_name}</span>}
            </div>
          </div>
          {dropped && <Badge variant="destructive">مُسقط</Badge>}
        </div>

        {r.result && (
          <div className="rounded-lg bg-gold/10 p-2.5 text-sm">
            <p className="mb-0.5 text-xs font-semibold text-gold-600 dark:text-gold-300">
              منطوق / نتيجة الحكم
            </p>
            <p className="whitespace-pre-wrap text-foreground">{r.result}</p>
          </div>
        )}
        {r.summary && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {r.summary}
          </p>
        )}

        {/* معلومات الإسقاط */}
        {dropped && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-2.5 text-sm">
            <p className="text-xs font-semibold text-destructive">تفاصيل الإسقاط</p>
            {r.drop_date && (
              <p className="text-xs text-muted-foreground">
                التاريخ: {fmtDatePref(r.drop_date)}
                {r.dropped_by_name ? ` · بواسطة ${r.dropped_by_name}` : ''}
              </p>
            )}
            {r.drop_reason && (
              <p className="mt-1 whitespace-pre-wrap">{r.drop_reason}</p>
            )}
            {r.drop_document_url && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-destructive"
                onClick={() =>
                  onPreview({ url: r.drop_document_url!, name: 'مستند الإسقاط' })
                }
              >
                <Paperclip className="h-3.5 w-3.5" />
                مستند الإسقاط
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
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
          {dropped ? (
            <Button variant="outline" size="sm" onClick={onUndrop}>
              <RotateCcw className="h-4 w-4" />
              إلغاء الإسقاط
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={onDrop}>
              <Ban className="h-4 w-4" />
              إسقاط الحكم
            </Button>
          )}
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Gavel className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد أحكام</p>
      <p className="text-sm text-muted-foreground">أضِف أول حكم عبر «حكم جديد».</p>
    </div>
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
    const parsed = await extractM.mutateAsync(url)
    if (!parsed) return
    const set = (k: keyof FormValues, v: string | null | undefined) => {
      if (v && String(v).trim() !== '') setValue(k, String(v).trim())
    }
    set('title', parsed.title)
    set('ruling_number', parsed.ruling_number)
    set('court_name', parsed.court_name)
    set('result', parsed.result)
    set('summary', parsed.summary)
    // التاريخ: نقبل صيغة YYYY-MM-DD فقط (التقويم المزدوج يخزّن ميلادي)
    if (parsed.ruling_date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.ruling_date.trim())) {
      setValue('ruling_date', parsed.ruling_date.trim())
    }
    setHijriHint(parsed.ruling_date_hijri ?? null)
  }

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
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

/* ===================== نافذة الإسقاط ===================== */

function DropDialog({
  caseId,
  ruling,
  onClose,
}: {
  caseId: string
  ruling: Ruling | null
  onClose: () => void
}) {
  const { teamMember } = useAuth()
  const dropM = useDropRuling(caseId)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayISO())
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)

  const submit = async () => {
    if (!ruling) return
    let dropDocumentUrl: string | null = null
    if (file) {
      setUploading(true)
      try {
        const { publicUrl } = await uploadFile(file, {
          folder: `case_rulings/${caseId}`,
        })
        dropDocumentUrl = publicUrl
      } finally {
        setUploading(false)
      }
    }
    dropM.mutate(
      {
        id: ruling.id,
        dropDate: date,
        dropReason: reason.trim(),
        dropDocumentUrl,
        droppedByName: teamMember?.name ?? null,
      },
      {
        onSuccess: () => {
          setReason('')
          setFile(null)
          onClose()
        },
      }
    )
  }

  return (
    <Dialog open={!!ruling} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>إسقاط الحكم</DialogTitle>
        </DialogHeader>
        <div className="my-3 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="drop_reason">سبب الإسقاط *</Label>
            <Textarea
              id="drop_reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DualDatePicker
            label="تاريخ الإسقاط"
            value={date || null}
            onChange={(v) => setDate(v ?? '')}
          />
          <FilePicker
            label="مستند الإسقاط (اختياري)"
            file={file}
            onPick={setFile}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="destructive"
            disabled={dropM.isPending || uploading || reason.trim() === ''}
            onClick={submit}
          >
            {(dropM.isPending || uploading) && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            تأكيد الإسقاط
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ===================== منتقي ملف ===================== */

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
