import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  Upload,
  CheckCircle2,
  RotateCcw,
  ScrollText,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

import { fmtDate } from '@/lib/format'
import { pickFile } from '@/lib/files'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useCaseMemos,
  useAddMemo,
  useUpdateMemo,
  useDeleteMemo,
  useToggleMemoSubmitted,
  useAddMemoDocument,
  useDeleteMemoDocument,
} from '@/hooks/useCaseMemos'
import {
  MEMO_METHOD_OPTIONS,
  MEMO_PARTY_OPTIONS,
  memoMethodLabel,
  memoPartyBadge,
  memoPartyLabel,
} from '@/lib/caseLabels'
import type { Memo, MemoDocument } from '@/types/db'

export function MemosTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useCaseMemos(caseId)
  const deleteM = useDeleteMemo(caseId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Memo | null>(null)
  const [toDelete, setToDelete] = useState<Memo | null>(null)
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

  const memos = data ?? []

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
          مذكرة جديدة
        </Button>
      </div>

      {memos.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-3">
          {memos.map((m) => (
            <MemoCard
              key={m.id}
              memo={m}
              caseId={caseId}
              onEdit={() => {
                setEditing(m)
                setFormOpen(true)
              }}
              onDelete={() => setToDelete(m)}
              onPreview={setPreview}
            />
          ))}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <MemoForm caseId={caseId} memo={editing} onDone={() => setFormOpen(false)} />
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
            <AlertDialogTitle>تأكيد حذف المذكرة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف المذكرة «{toDelete?.title}». هل أنت متأكد؟
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

function MemoCard({
  memo: m,
  caseId,
  onEdit,
  onDelete,
  onPreview,
}: {
  memo: Memo
  caseId: string
  onEdit: () => void
  onDelete: () => void
  onPreview: (p: { url: string; name: string }) => void
}) {
  const isDirector = useIsDirector()
  const { teamMember } = useAuth()
  const toggleM = useToggleMemoSubmitted(caseId)
  const addDocM = useAddMemoDocument(caseId)
  const delDocM = useDeleteMemoDocument(caseId)
  const [toDeleteDoc, setToDeleteDoc] = useState<MemoDocument | null>(null)

  const submitted = !!m.is_submitted
  const docs = m.documents ?? []

  const onUpload = async () => {
    const f = await pickFile()
    if (f) addDocM.mutate({ memoId: m.id, file: f })
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{m.title || 'مذكرة'}</p>
            {m.memo_type && (
              <p className="text-xs text-muted-foreground">{m.memo_type}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={memoPartyBadge(m.party_side)}>
              {memoPartyLabel(m.party_side)}
            </Badge>
            <Badge variant={submitted ? 'success' : 'warning'}>
              {submitted ? 'مُقدّمة' : 'مسودة'}
            </Badge>
            <Badge variant="outline">{memoMethodLabel(m.submit_method)}</Badge>
          </div>
        </div>

        {m.description && (
          <p className="whitespace-pre-wrap text-sm text-foreground">
            {m.description}
          </p>
        )}

        {submitted && m.submit_date && (
          <p className="text-xs text-muted-foreground">
            تاريخ التقديم: {fmtDate(m.submit_date)}
          </p>
        )}

        {/* المرفقات */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground">
              المرفقات
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={onUpload}
              disabled={addDocM.isPending}
            >
              {addDocM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              رفع مرفق
            </Button>
          </div>
          {docs.length === 0 ? (
            <p className="text-xs text-muted-foreground">لا مرفقات.</p>
          ) : (
            docs.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5"
              >
                <button
                  className="flex min-w-0 items-center gap-2 text-sm hover:text-gold"
                  onClick={() =>
                    d.file_url &&
                    onPreview({ url: d.file_url, name: d.name ?? 'ملف' })
                  }
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="truncate">{d.name ?? 'ملف'}</span>
                </button>
                {isDirector && (
                  <button
                    className="shrink-0 text-destructive"
                    onClick={() => setToDeleteDoc(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toggleM.mutate({ id: m.id, submitted: !submitted })
            }
          >
            {submitted ? (
              <>
                <RotateCcw className="h-4 w-4" />
                إرجاع لمسودة
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                تعليم كمُقدّمة
              </>
            )}
          </Button>
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

      {/* تأكيد حذف مرفق */}
      <AlertDialog
        open={!!toDeleteDoc}
        onOpenChange={(o) => !o && setToDeleteDoc(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المرفق</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الملف: «{toDeleteDoc?.name}». يمكن استرجاعه لاحقاً من قِبل
              المدير. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (toDeleteDoc)
                  delDocM.mutate({
                    id: toDeleteDoc.id,
                    deletedBy: teamMember?.name ?? null,
                  })
                setToDeleteDoc(null)
              }}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <ScrollText className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد مذكرات</p>
      <p className="text-sm text-muted-foreground">أضِف أول مذكرة عبر «مذكرة جديدة».</p>
    </div>
  )
}

/* ===================== نموذج المذكرة ===================== */

const schema = z.object({
  title: z.string().min(1, 'العنوان مطلوب'),
  memo_type: z.string().optional(),
  party_side: z.string().min(1),
  submit_method: z.string().min(1),
  description: z.string().optional(),
  is_submitted: z.boolean(),
  submit_date: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function MemoForm({
  caseId,
  memo,
  onDone,
}: {
  caseId: string
  memo: Memo | null
  onDone: () => void
}) {
  const isEdit = Boolean(memo)
  const addM = useAddMemo(caseId)
  const updateM = useUpdateMemo(caseId)
  const pending = addM.isPending || updateM.isPending

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: memo?.title ?? '',
      memo_type: memo?.memo_type ?? '',
      party_side: memo?.party_side === 'defendant' ? 'defendant' : 'plaintiff',
      submit_method: memo?.submit_method === 'electronic' ? 'electronic' : 'manual',
      description: memo?.description ?? '',
      is_submitted: memo?.is_submitted ?? false,
      submit_date: memo?.submit_date ?? '',
    },
  })

  const isSubmitted = watch('is_submitted')

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const base = {
      title: values.title.trim(),
      memo_type: t(values.memo_type),
      party_side: values.party_side,
      submit_method: values.submit_method,
      description: t(values.description),
      is_submitted: values.is_submitted,
      submit_date: values.is_submitted ? values.submit_date || null : null,
    }
    if (isEdit && memo) {
      await updateM.mutateAsync({ id: memo.id, input: base })
    } else {
      await addM.mutateAsync({ case_id: caseId, ...base })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل مذكرة' : 'مذكرة جديدة'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="m_title">العنوان *</Label>
          <Input id="m_title" {...register('title')} />
          {errors.title && (
            <p className="text-xs text-destructive">{errors.title.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="m_type">النوع</Label>
          <Input
            id="m_type"
            placeholder="مثل: مذكرة المدعي، توصية الأمين…"
            {...register('memo_type')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>الصفة</Label>
            <Controller
              control={control}
              name="party_side"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMO_PARTY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
          <div className="space-y-1.5">
            <Label>طريقة التقديم</Label>
            <Controller
              control={control}
              name="submit_method"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEMO_METHOD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="m_desc">الوصف</Label>
          <Textarea id="m_desc" rows={4} {...register('description')} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={isSubmitted}
            onCheckedChange={(v) => setValue('is_submitted', v)}
          />
          مُقدّمة
        </label>
        {isSubmitted && (
          <div className="space-y-1.5">
            <Label htmlFor="m_subdate">تاريخ التقديم</Label>
            <Input id="m_subdate" type="date" {...register('submit_date')} />
          </div>
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
