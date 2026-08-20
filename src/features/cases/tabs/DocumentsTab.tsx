import { useCallback, useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Plus,
  Trash2,
  Loader2,
  FileText,
  FileImage,
  File as FileIcon,
  Paperclip,
  Eye,
  FolderOpen,
  CheckCircle2,
  XCircle,
  RotateCw,
  X,
  AlertTriangle,
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

import { fmtDatePref, fmtFileSize, fmtNumber, todayISO } from '@/lib/format'
import { pickFile } from '@/lib/files'
import { DropZone } from '@/components/DropZone'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import {
  useCaseDocuments,
  useAddDocument,
  useDeleteDocument,
  addDocumentDirect,
} from '@/hooks/useCaseDocuments'
import type { CaseDocument } from '@/types/db'

/* ===== تقرير رفع الدفعة — دائم حتى يُغلق، لأن المستخدم يحذف الأصل من جهازه ===== */

interface BatchItem {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'ok' | 'failed'
  error?: string
}

function BatchReport({
  batch,
  uploading,
  onRetry,
  onClose,
}: {
  batch: BatchItem[]
  uploading: boolean
  onRetry: () => void
  onClose: () => void
}) {
  const ok = batch.filter((b) => b.status === 'ok').length
  const failed = batch.filter((b) => b.status === 'failed').length
  const total = batch.length
  const allOk = !uploading && ok === total

  return (
    <div
      className={
        failed > 0 && !uploading
          ? 'space-y-2 rounded-xl border-2 border-destructive/60 bg-destructive/5 p-4'
          : 'space-y-2 rounded-xl border p-4 ' + (allOk ? 'border-green-600/40 bg-green-500/5' : 'bg-card')
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
              جارٍ الرفع… {fmtNumber(ok + failed)}/{fmtNumber(total)}
            </>
          ) : failed > 0 ? (
            <>
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-destructive">
                {fmtNumber(failed)} من {fmtNumber(total)} لم يُرفع — لا تحذف هذه
                الملفات من جهازك
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              رُفعت كل الملفات ({fmtNumber(total)}) — يمكنك حذفها من جهازك بأمان
            </>
          )}
        </p>
        <div className="flex items-center gap-1.5">
          {failed > 0 && !uploading && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetry}>
              <RotateCw className="h-3.5 w-3.5" />
              إعادة محاولة الفاشلة
            </Button>
          )}
          {!uploading && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={onClose}
              aria-label="إغلاق التقرير"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {uploading && (
        <p className="text-xs text-muted-foreground">
          لا تغلق الصفحة حتى يكتمل الرفع ويظهر الملخّص.
        </p>
      )}

      <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border bg-card">
        {batch.map((b) => (
          <li key={b.id} className="flex items-center gap-2.5 px-3 py-2">
            {b.status === 'ok' ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
            ) : b.status === 'failed' ? (
              <XCircle className="h-4 w-4 shrink-0 text-destructive" />
            ) : b.status === 'uploading' ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border-2 border-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p
                className={
                  'truncate text-xs ' +
                  (b.status === 'failed'
                    ? 'font-semibold text-destructive'
                    : 'text-foreground')
                }
              >
                {b.file.name}
              </p>
              {b.error && (
                <p className="truncate text-xs text-destructive/80">{b.error}</p>
              )}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground">
              {fmtFileSize(b.file.size)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function docIcon(d: CaseDocument) {
  const s = `${d.file_type ?? ''} ${d.name ?? ''}`.toLowerCase()
  if (s.includes('pdf')) return FileText
  if (/(image|jpg|jpeg|png|webp|gif)/.test(s)) return FileImage
  return FileIcon
}

export function DocumentsTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError, error, refetch } = useCaseDocuments(caseId)
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const deleteM = useDeleteDocument(caseId)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [preview, setPreview] = useState<CaseDocument | null>(null)
  const [toDelete, setToDelete] = useState<CaseDocument | null>(null)

  // رفع الدفعة بتقرير دائم: المستخدم يحذف الملفات من جهازه بعد الرفع،
  // فرسالة فشل تختفي بعد ثوانٍ = خطر ضياع ملف بلا رجعة. التقرير يبقى
  // معروضاً باسم كل ملف ومصيره حتى يُغلق بيده.
  const qc = useQueryClient()
  const [batch, setBatch] = useState<BatchItem[]>([])
  const uploading = batch.some((b) => b.status === 'uploading' || b.status === 'pending')

  const runBatch = useCallback(
    async (items: BatchItem[]) => {
      for (const item of items) {
        setBatch((s) =>
          s.map((b) => (b.id === item.id ? { ...b, status: 'uploading' } : b))
        )
        try {
          await addDocumentDirect(caseId, {
            file: item.file,
            name: item.file.name,
            documentDate: todayISO(),
            description: null,
            uploadedByName: teamMember?.name ?? null,
          })
          setBatch((s) =>
            s.map((b) => (b.id === item.id ? { ...b, status: 'ok' } : b))
          )
        } catch (e) {
          setBatch((s) =>
            s.map((b) =>
              b.id === item.id
                ? { ...b, status: 'failed', error: errMessage(e) ?? 'سبب غير معروف' }
                : b
            )
          )
          // شبكة أمان: لو غادر المستخدم التبويب فتفكّك التقرير، يبقى التوست
          // (يظهر في أي شاشة وينجو من التفكيك) — لا فشل رفع صامتاً أبداً
          toast({
            variant: 'destructive',
            title: `لم يُرفع: ${item.file.name}`,
            description: errMessage(e) ?? undefined,
          })
        }
        // الشبكة تُحدَّث أولاً بأول حتى تظهر البطاقات المرفوعة فوراً
        qc.invalidateQueries({ queryKey: ['case_documents', caseId] })
      }
    },
    [caseId, teamMember?.name, qc]
  )

  // إغلاق المتصفح أثناء الرفع يقطع الدفعة بصمت — نعترض بسؤال تأكيد
  useEffect(() => {
    if (!uploading) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [uploading])

  const uploadBatch = (files: File[]) => {
    if (files.length === 0 || uploading) return
    const items: BatchItem[] = files.map((f, i) => ({
      id: `${Date.now()}-${i}`,
      file: f,
      status: 'pending',
    }))
    setBatch(items) // تقرير جديد يحل محل السابق
    void runBatch(items)
  }

  const retryFailed = () => {
    const failed = batch.filter((b) => b.status === 'failed')
    if (failed.length === 0 || uploading) return
    setBatch((s) =>
      s.map((b) => (b.status === 'failed' ? { ...b, status: 'pending', error: undefined } : b))
    )
    void runBatch(failed)
  }

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <QueryErrorState
        title="تعذّر تحميل المستندات"
        error={error}
        onRetry={() => refetch()}
      />
    )
  }

  const docs = data ?? []

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="gold" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" />
          رفع مستند
        </Button>
      </div>

      <DropZone
        onFiles={uploadBatch}
        uploadingCount={batch.filter((b) => b.status === 'pending' || b.status === 'uploading').length}
        hint="تُرفع مباشرة باسم الملف وتاريخ اليوم. للتسمية والوصف استخدم «رفع مستند»."
      />

      {batch.length > 0 && (
        <BatchReport
          batch={batch}
          uploading={uploading}
          onRetry={retryFailed}
          onClose={() => setBatch([])}
        />
      )}

      {docs.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="لا توجد مستندات"
          description="ارفع أول مستند بسحبه هنا أو عبر زر الرفع."
          actionLabel="رفع مستند"
          onAction={() => setUploadOpen(true)}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {docs.map((d) => (
            <DocCard
              key={d.id}
              doc={d}
              isDirector={isDirector}
              onPreview={() => setPreview(d)}
              onDelete={() => setToDelete(d)}
            />
          ))}
        </div>
      )}

      <UploadDialog
        caseId={caseId}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
      />

      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.file_url ?? null}
        fileName={preview?.name ?? null}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المستند</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الملف: «{toDelete?.name}». يمكن استرجاعه لاحقاً من قِبل
              المدير. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDelete)
                  deleteM.mutate({
                    id: toDelete.id,
                    deletedBy: teamMember?.name ?? null,
                  })
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

function DocCard({
  doc: d,
  isDirector,
  onPreview,
  onDelete,
}: {
  doc: CaseDocument
  isDirector: boolean
  onPreview: () => void
  onDelete: () => void
}) {
  const Icon = docIcon(d)
  const name = d.name ?? 'ملف'
  const meta = [
    d.document_date ? fmtDatePref(d.document_date) : null,
    fmtFileSize(d.file_size),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        {/* الأيقونة + الاسم (قابلة للنقر للمعاينة) */}
        {/* button لا يقبل إلا phrasing content — لذلك span بدل p */}
        <button
          className="flex flex-1 flex-col items-center gap-2 text-center"
          onClick={onPreview}
          title="معاينة"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/10">
            <Icon className="h-6 w-6 text-gold" />
          </span>
          <span
            title={name}
            className="block w-full truncate text-sm font-medium text-foreground"
          >
            {name}
          </span>
          {d.category && (
            <span className="inline-flex items-center rounded-full bg-gold/10 px-2 py-0.5 text-[11px] font-medium text-gold-700 dark:text-gold-300">
              {d.category}
            </span>
          )}
          {meta && (
            <span className="block w-full truncate text-xs text-muted-foreground">
              {meta}
            </span>
          )}
          {d.uploaded_by_name && (
            <span className="block w-full truncate text-xs text-muted-foreground">
              رفعه: {d.uploaded_by_name}
            </span>
          )}
        </button>

        {/* الإجراءات */}
        <div className="mt-auto flex items-center justify-center gap-1 border-t pt-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="معاينة"
            onClick={onPreview}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {/* الحذف للمدير فقط */}
          {isDirector && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive"
              title="حذف"
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function UploadDialog({
  caseId,
  open,
  onOpenChange,
}: {
  caseId: string
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { teamMember } = useAuth()
  const addM = useAddDocument(caseId)
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')

  const reset = () => {
    setFile(null)
    setName('')
    setDate(todayISO())
    setDescription('')
  }

  const submit = () => {
    if (!file) return
    addM.mutate(
      {
        file,
        name: name || file.name,
        documentDate: date,
        description,
        uploadedByName: teamMember?.name ?? null,
      },
      {
        onSuccess: () => {
          reset()
          onOpenChange(false)
        },
      }
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // لا إغلاق أثناء الرفع — الإغلاق يوهم أن الرفع أُلغي بينما يستمر خلف الكواليس
        if (addM.isPending) return
        if (!o) reset()
        onOpenChange(o)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفع مستند</DialogTitle>
        </DialogHeader>

        <div className="my-3 space-y-3">
          <div className="space-y-1.5">
            <Label>الملف *</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const f = await pickFile()
                  if (f) {
                    setFile(f)
                    if (!name) setName(f.name)
                  }
                }}
              >
                <Paperclip className="h-4 w-4" />
                اختيار ملف
              </Button>
              {file && (
                <span className="truncate text-xs text-muted-foreground">
                  {file.name}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="d_name">الاسم</Label>
            <Input
              id="d_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DualDatePicker
            label="تاريخ المستند"
            value={date || null}
            onChange={(v) => setDate(v ?? '')}
          />
          <div className="space-y-1.5">
            <Label htmlFor="d_desc">الوصف</Label>
            <Textarea
              id="d_desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="gold"
            disabled={!file || addM.isPending}
            onClick={submit}
          >
            {addM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            رفع
          </Button>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={addM.isPending}
          >
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
