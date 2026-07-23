import { useState } from 'react'
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
  UploadCloud,
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

import { fmtDatePref, fmtFileSize, fmtNumber, todayISO } from '@/lib/format'
import { pickFile, pickFiles } from '@/lib/files'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useCaseDocuments,
  useAddDocument,
  useDeleteDocument,
} from '@/hooks/useCaseDocuments'
import type { CaseDocument } from '@/types/db'

function docIcon(d: CaseDocument) {
  const s = `${d.file_type ?? ''} ${d.name ?? ''}`.toLowerCase()
  if (s.includes('pdf')) return FileText
  if (/(image|jpg|jpeg|png|webp|gif)/.test(s)) return FileImage
  return FileIcon
}

export function DocumentsTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useCaseDocuments(caseId)
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const deleteM = useDeleteDocument(caseId)
  const addM = useAddDocument(caseId)

  const [uploadOpen, setUploadOpen] = useState(false)
  const [preview, setPreview] = useState<CaseDocument | null>(null)
  const [toDelete, setToDelete] = useState<CaseDocument | null>(null)

  // السحب والإفلات: عدّاد دخول/خروج لتفادي وميض التظليل، وعدّاد رفع للدفعة
  const [dragDepth, setDragDepth] = useState(0)
  const [batchLeft, setBatchLeft] = useState(0)

  // رفع مجموعة ملفات مباشرة (الاسم = اسم الملف، التاريخ = اليوم)
  const uploadBatch = async (files: File[]) => {
    if (files.length === 0 || batchLeft > 0) return
    setBatchLeft(files.length)
    for (const f of files) {
      try {
        await addM.mutateAsync({
          file: f,
          name: f.name,
          documentDate: todayISO(),
          description: null,
          uploadedByName: teamMember?.name ?? null,
        })
      } catch {
        /* الهوك يعرض سبب الفشل لكل ملف */
      }
      setBatchLeft((n) => Math.max(0, n - 1))
    }
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    )
  }

  const docs = data ?? []

  return (
    <div
      className="space-y-4"
      onDragEnter={(e) => {
        e.preventDefault()
        setDragDepth((d) => d + 1)
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        e.preventDefault()
        setDragDepth((d) => Math.max(0, d - 1))
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragDepth(0)
        uploadBatch(Array.from(e.dataTransfer.files))
      }}
    >
      <div className="flex justify-end">
        <Button variant="gold" onClick={() => setUploadOpen(true)}>
          <Plus className="h-4 w-4" />
          رفع مستند
        </Button>
      </div>

      {/* منطقة الإفلات — والضغط عليها يفتح منتقي ملفات متعدد */}
      <button
        type="button"
        onClick={async () => uploadBatch(await pickFiles())}
        disabled={batchLeft > 0}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-6 text-center transition-colors',
          dragDepth > 0
            ? 'border-gold bg-gold/10'
            : 'border-border hover:border-gold/50 hover:bg-muted/40'
        )}
      >
        {batchLeft > 0 ? (
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-gold" />
            جارٍ رفع {fmtNumber(batchLeft)} من الملفات…
          </span>
        ) : (
          <>
            <UploadCloud
              className={cn(
                'h-6 w-6',
                dragDepth > 0 ? 'text-gold' : 'text-muted-foreground'
              )}
            />
            <span className="text-sm font-medium text-foreground">
              اسحب الملفات وأفلتها هنا — أو اضغط للاختيار
            </span>
            <span className="text-xs text-muted-foreground">
              تُرفع مباشرة باسم الملف وتاريخ اليوم. للتسمية والوصف استخدم «رفع
              مستند».
            </span>
          </>
        )}
      </button>

      {docs.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        <button
          className="flex flex-1 flex-col items-center gap-2 text-center"
          onClick={onPreview}
          title="معاينة"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/10">
            <Icon className="h-6 w-6 text-gold" />
          </span>
          <p
            title={name}
            className="w-full truncate text-sm font-medium text-foreground"
          >
            {name}
          </p>
          {meta && (
            <p className="w-full truncate text-xs text-muted-foreground">
              {meta}
            </p>
          )}
          {d.uploaded_by_name && (
            <p className="w-full truncate text-xs text-muted-foreground">
              رفعه: {d.uploaded_by_name}
            </p>
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

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FolderOpen className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد مستندات</p>
      <p className="text-sm text-muted-foreground">ارفع أول مستند عبر «رفع مستند».</p>
    </div>
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
