import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Upload,
  CheckCircle2,
  RotateCcw,
  ScrollText,
  MoreVertical,
  BookOpen,
  Copy,
  Paperclip,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { DualDatePicker } from '@/components/DualDatePicker'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState } from '@/components/EmptyState'

import { fmtDatePref, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { pickFile } from '@/lib/files'
import { toast } from '@/hooks/use-toast'
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
  memoPartyLabel,
} from '@/lib/caseLabels'
import type { Memo, MemoDocument } from '@/types/db'

type Preview = { url: string; name: string }

/* ===================== أدوات النص ===================== */

/** المذكرة تُلصق من Word: أسطر بمسافات وجداول (tab) — تُنظّف إلى فقرات */
function memoParagraphs(text: string | null | undefined): string[] {
  return (text ?? '')
    .replace(/\r/g, '')
    .split(/\n+/)
    .map((l) => l.replace(/\t+/g, ' ').replace(/ {2,}/g, ' ').trim())
    .filter(Boolean)
}

// صيغ الافتتاح المعتادة (البسملة والتحية والمخاطَب) لا تقول شيئاً عن المذكرة
const OPENING =
  /^(بسم الله|السلام عليكم|أصحاب الفضيلة|صاحب الفضيلة|فضيلة|معالي|سعادة|الموضوع|إلى )/

/** أول فقرة تحمل مضمون المذكرة — للمقتطف في البطاقة */
function memoExcerpt(text: string | null | undefined): string {
  const ps = memoParagraphs(text).map((p) =>
    p.replace(/^بسم الله الرحمن الرحيم\s*/, '')
  )
  return (
    ps.find((p) => p.length >= 60 && !OPENING.test(p)) ??
    ps.find((p) => !OPENING.test(p)) ??
    ps[0] ??
    ''
  )
}

const wordCount = (text: string | null | undefined) =>
  (text ?? '').split(/\s+/).filter(Boolean).length

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '')

/** تاريخ المذكرة: تاريخ تقديمها إن قُدّمت، وإلا تاريخ تسجيلها */
function memoWhen(m: Memo): { date: string | null; label: string } {
  if (m.is_submitted && m.submit_date) return { date: m.submit_date, label: 'قُدّمت' }
  return { date: m.created_at, label: 'سُجّلت' }
}

const countLabel = (n: number) =>
  n === 1
    ? 'مذكرة واحدة'
    : n === 2
      ? 'مذكرتان'
      : n <= 10
        ? `${fmtNumber(n)} مذكرات`
        : `${fmtNumber(n)} مذكرة`

/* ألوان الطرفين محايدة: لا أخضر ولا أحمر، فالصفة لا تعني أن المذكرة لنا أو علينا */
const PARTY_TONE = {
  plaintiff: {
    chip: 'bg-sky-500/10 text-sky-800 dark:text-sky-300',
    dot: 'bg-sky-500',
  },
  defendant: {
    chip: 'bg-violet-500/10 text-violet-800 dark:text-violet-300',
    dot: 'bg-violet-500',
  },
} as const
const partyTone = (s: string | null | undefined) =>
  s === 'defendant' ? PARTY_TONE.defendant : PARTY_TONE.plaintiff

function PartyChip({ side }: { side: string | null | undefined }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-xs font-medium',
        partyTone(side).chip
      )}
    >
      {memoPartyLabel(side)}
    </span>
  )
}

function DraftChip() {
  return (
    <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
      مسودة
    </span>
  )
}

/* ===================== التبويب ===================== */

export function MemosTab({ caseId }: { caseId: string }) {
  const { data, isLoading, isError, error, refetch } = useCaseMemos(caseId)
  const deleteM = useDeleteMemo(caseId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Memo | null>(null)
  const [toDelete, setToDelete] = useState<Memo | null>(null)
  const [readingId, setReadingId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <QueryErrorState
        title="تعذّر تحميل المذكرات"
        error={error}
        onRetry={() => refetch()}
      />
    )
  }

  // الأحدث أولاً بتاريخ التقديم، فترتيبها يحكي تبادل المذكرات بين الطرفين
  const memos = [...(data ?? [])].sort((a, b) =>
    (memoWhen(b).date ?? '').localeCompare(memoWhen(a).date ?? '')
  )
  const drafts = memos.filter((m) => !m.is_submitted).length
  const reading = memos.find((m) => m.id === readingId) ?? null

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (m: Memo) => {
    setReadingId(null)
    setEditing(m)
    setFormOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {memos.length > 0 && (
            <>
              {countLabel(memos.length)}
              {drafts > 0 && ` · ${fmtNumber(drafts)} ${drafts === 1 ? 'مسودة' : 'مسودات'}`}
            </>
          )}
        </p>
        <Button variant="gold" onClick={openNew}>
          <Plus className="h-4 w-4" />
          مذكرة جديدة
        </Button>
      </div>

      {memos.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="لا توجد مذكرات"
          description="وثّق مذكرات الأطراف ومرفقاتها وحالة تقديمها."
          actionLabel="مذكرة جديدة"
          onAction={openNew}
        />
      ) : (
        <div className="relative pr-7">
          <span
            className="absolute bottom-8 right-[9px] top-5 border-r-2 border-border"
            aria-hidden
          />
          <div className="space-y-3">
            {memos.map((m) => (
              <div key={m.id} className="relative">
                <span
                  className={cn(
                    'absolute -right-[25px] top-5 h-3.5 w-3.5 rounded-full border-[3px] border-background',
                    partyTone(m.party_side).dot
                  )}
                  aria-hidden
                />
                <MemoCard
                  memo={m}
                  caseId={caseId}
                  onRead={() => setReadingId(m.id)}
                  onEdit={() => openEdit(m)}
                  onDelete={() => setToDelete(m)}
                  onPreview={setPreview}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      <MemoReader
        memo={reading}
        caseId={caseId}
        onClose={() => setReadingId(null)}
        onEdit={() => reading && openEdit(reading)}
        onPreview={setPreview}
      />

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

/* ===================== البطاقة ===================== */

function MemoCard({
  memo: m,
  caseId,
  onRead,
  onEdit,
  onDelete,
  onPreview,
}: {
  memo: Memo
  caseId: string
  onRead: () => void
  onEdit: () => void
  onDelete: () => void
  onPreview: (p: Preview) => void
}) {
  const toggleM = useToggleMemoSubmitted(caseId)
  const addDocM = useAddMemoDocument(caseId)

  const submitted = !!m.is_submitted
  const docs = m.documents ?? []
  const when = memoWhen(m)
  const excerpt = memoExcerpt(m.description)
  // النوع يتكرر غالباً بنص العنوان — يظهر فقط إن أضاف شيئاً
  const showType = !!m.memo_type && norm(m.memo_type) !== norm(m.title)

  const onUpload = async () => {
    const f = await pickFile()
    if (f) addDocM.mutate({ memoId: m.id, file: f })
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <PartyChip side={m.party_side} />
              {!submitted && <DraftChip />}
            </div>
            <p className="mt-1.5 font-semibold leading-7 text-foreground">
              {m.title || 'مذكرة'}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {when.date && (
                <span>
                  {when.label} {fmtDatePref(when.date)}
                </span>
              )}
              <span>{memoMethodLabel(m.submit_method)}</span>
              {showType && <span>{m.memo_type}</span>}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                aria-label="خيارات المذكرة"
                title="خيارات المذكرة"
              >
                {toggleM.isPending || addDocM.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MoreVertical className="h-4 w-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => toggleM.mutate({ id: m.id, submitted: !submitted })}
              >
                {submitted ? (
                  <RotateCcw className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {submitted ? 'إرجاع لمسودة' : 'تعليم كمُقدّمة'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onUpload}>
                <Upload className="h-4 w-4" />
                رفع مرفق
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                تعديل
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4" />
                حذف
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {excerpt && (
          <button
            type="button"
            onClick={onRead}
            className="block w-full rounded-lg bg-muted/50 px-3 py-2 text-right text-sm leading-7 text-muted-foreground transition-colors hover:bg-muted"
          >
            <span className="line-clamp-2">{excerpt}</span>
          </button>
        )}

        {(m.description || docs.length > 0) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {m.description && (
              <Button variant="outline" size="sm" onClick={onRead}>
                <BookOpen className="h-4 w-4" />
                قراءة المذكرة
              </Button>
            )}
            {docs.map((d) => (
              <Button
                key={d.id}
                variant="ghost"
                size="sm"
                className="max-w-[16rem] text-muted-foreground"
                title={d.name ?? 'ملف'}
                onClick={() =>
                  d.file_url && onPreview({ url: d.file_url, name: d.name ?? 'ملف' })
                }
              >
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate">{d.name ?? 'ملف'}</span>
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ===================== نافذة القراءة ===================== */

function MemoReader({
  memo: m,
  caseId,
  onClose,
  onEdit,
  onPreview,
}: {
  memo: Memo | null
  caseId: string
  onClose: () => void
  onEdit: () => void
  onPreview: (p: Preview) => void
}) {
  const isDirector = useIsDirector()
  const { teamMember } = useAuth()
  const addDocM = useAddMemoDocument(caseId)
  const delDocM = useDeleteMemoDocument(caseId)
  const [toDeleteDoc, setToDeleteDoc] = useState<MemoDocument | null>(null)

  const paragraphs = memoParagraphs(m?.description)
  const docs = m?.documents ?? []
  const when = m ? memoWhen(m) : null
  const words = wordCount(m?.description)

  const onUpload = async () => {
    if (!m) return
    const f = await pickFile()
    if (f) addDocM.mutate({ memoId: m.id, file: f })
  }

  const onCopy = async () => {
    if (!m?.description) return
    try {
      await navigator.clipboard.writeText(m.description)
      toast({ variant: 'success', title: 'نُسخ نص المذكرة' })
    } catch {
      toast({
        variant: 'destructive',
        title: 'لم يُنسخ النص',
        description: 'المتصفح منع الوصول إلى الحافظة. حدّد النص وانسخه يدوياً.',
      })
    }
  }

  return (
    <Dialog open={!!m} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        {m && (
          <>
            <DialogHeader className="space-y-1.5 border-b py-4 pl-12 pr-6 text-right">
              <div className="flex flex-wrap items-center gap-1.5">
                <PartyChip side={m.party_side} />
                {!m.is_submitted && <DraftChip />}
              </div>
              <DialogTitle className="text-lg leading-8">{m.title || 'مذكرة'}</DialogTitle>
              <DialogDescription className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                {when?.date && (
                  <span>
                    {when.label} {fmtDatePref(when.date)}
                  </span>
                )}
                <span>{memoMethodLabel(m.submit_method)}</span>
                {words > 0 && <span>{fmtNumber(words)} كلمة</span>}
              </DialogDescription>
            </DialogHeader>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              {paragraphs.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  لم يُضف نص لهذه المذكرة. أضفه من «تعديل» أو أرفق ملفها.
                </p>
              ) : (
                <article className="mx-auto max-w-[68ch] space-y-4 text-[15px] leading-8 text-foreground">
                  {paragraphs.map((p, i) => {
                    // رأس المذكرة (البسملة والمخاطَب والعنوان) أسطر قصيرة في أولها: تُوسَّط كما في الورق
                    const heading = i < 5 && p.length <= 70 && !/[:،؛]$/.test(p)
                    return (
                      <p
                        key={i}
                        className={cn(
                          'whitespace-pre-wrap',
                          heading && 'text-center font-medium'
                        )}
                      >
                        {p}
                      </p>
                    )
                  })}
                </article>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 border-t bg-muted/30 px-6 py-3">
              {docs.map((d) => (
                <span
                  key={d.id}
                  className="inline-flex max-w-[18rem] items-center rounded-lg border bg-background"
                >
                  <button
                    type="button"
                    className="flex min-w-0 items-center gap-1.5 px-2.5 py-1.5 text-sm hover:text-gold"
                    title={d.name ?? 'ملف'}
                    onClick={() =>
                      d.file_url && onPreview({ url: d.file_url, name: d.name ?? 'ملف' })
                    }
                  >
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="truncate">{d.name ?? 'ملف'}</span>
                  </button>
                  {isDirector && (
                    <button
                      type="button"
                      className="border-r px-2 py-1.5 text-destructive hover:bg-destructive/10"
                      title="حذف المرفق"
                      aria-label="حذف المرفق"
                      onClick={() => setToDeleteDoc(d)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
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
              <span className="flex-1" />
              {m.description && (
                <Button variant="outline" size="sm" onClick={onCopy}>
                  <Copy className="h-4 w-4" />
                  نسخ النص
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                تعديل
              </Button>
            </div>
          </>
        )}
      </DialogContent>

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
    </Dialog>
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
          <Controller
            control={control}
            name="submit_date"
            render={({ field }) => (
              <DualDatePicker
                label="تاريخ التقديم"
                value={field.value || null}
                onChange={(v) => field.onChange(v ?? '')}
              />
            )}
          />
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
