import { useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CalendarDays,
  Clock,
  Landmark,
  FileText,
  CheckCircle2,
  CalendarOff,
  CalendarCheck,
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

import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref, fmtTime } from '@/lib/format'
import {
  useCaseSessions,
  useAddSession,
  useUpdateSession,
  useDeleteSession,
  useSetSessionOutcome,
} from '@/hooks/useCaseSessions'
import {
  SESSION_STATUS_OPTIONS,
  sessionStatusBadge,
  sessionStatusLabel,
  isSessionUpcoming,
} from '@/lib/caseLabels'
import type { CaseSession } from '@/types/db'

// عدّاد تنازلي بأرقام لاتينية
function countdown(dateStr: string | null): { text: string; soon: boolean } | null {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const days = Math.round((d.getTime() - now.getTime()) / 86400000)
  if (days < 0) return { text: `فات موعدها منذ ${fmtNumber(-days)} يوم`, soon: false }
  if (days === 0) return { text: 'اليوم', soon: true }
  if (days === 1) return { text: 'غداً', soon: true }
  return { text: `بعد ${fmtNumber(days)} أيام`, soon: days <= 3 }
}

export function SessionsTab({ caseId }: { caseId: string }) {
  const { data, isLoading } = useCaseSessions(caseId)
  const deleteM = useDeleteSession(caseId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CaseSession | null>(null)
  const [toDelete, setToDelete] = useState<CaseSession | null>(null)
  const [outcomeFor, setOutcomeFor] = useState<CaseSession | null>(null)
  const [preview, setPreview] = useState<CaseSession | null>(null)

  const { upcoming, past } = useMemo(() => {
    const list = data ?? []
    const up = list
      .filter((s) => isSessionUpcoming(s.status))
      .sort((a, b) => (a.session_date ?? '').localeCompare(b.session_date ?? ''))
    const pa = list
      .filter((s) => !isSessionUpcoming(s.status))
      .sort((a, b) => (b.session_date ?? '').localeCompare(a.session_date ?? ''))
    return { upcoming: up, past: pa }
  }, [data])

  const openNew = () => {
    setEditing(null)
    setFormOpen(true)
  }
  const openEdit = (s: CaseSession) => {
    setEditing(s)
    setFormOpen(true)
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button variant="gold" onClick={openNew}>
          <Plus className="h-4 w-4" />
          جلسة جديدة
        </Button>
      </div>

      {(data?.length ?? 0) === 0 ? (
        <EmptyState />
      ) : (
        <>
          <Section title="الجلسات القادمة" count={upcoming.length}>
            {upcoming.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onEdit={openEdit}
                onDelete={setToDelete}
                onOutcome={setOutcomeFor}
                onPreview={setPreview}
              />
            ))}
          </Section>
          <Section title="الجلسات المنعقدة / السابقة" count={past.length}>
            {past.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onEdit={openEdit}
                onDelete={setToDelete}
                onOutcome={setOutcomeFor}
                onPreview={setPreview}
              />
            ))}
          </Section>
        </>
      )}

      {/* النموذج */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <SessionForm
            caseId={caseId}
            session={editing}
            onDone={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* تسجيل نتيجة */}
      <OutcomeDialog
        caseId={caseId}
        session={outcomeFor}
        onClose={() => setOutcomeFor(null)}
      />

      {/* معاينة المحضر */}
      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.minutes_url ?? null}
        fileName={preview?.title ? `محضر — ${preview.title}` : 'محضر الجلسة'}
      />

      {/* حذف */}
      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الجلسة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الجلسة «{toDelete?.title || fmtDatePref(toDelete?.session_date)}».
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

function Section({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {title}
        <span className="text-xs text-muted-foreground">
          ({fmtNumber(count)})
        </span>
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function SessionCard({
  session: s,
  onEdit,
  onDelete,
  onOutcome,
  onPreview,
}: {
  session: CaseSession
  onEdit: (s: CaseSession) => void
  onDelete: (s: CaseSession) => void
  onOutcome: (s: CaseSession) => void
  onPreview: (s: CaseSession) => void
}) {
  const upcoming = isSessionUpcoming(s.status)
  const cd = upcoming ? countdown(s.session_date) : null

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {s.title || 'جلسة'}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {fmtDatePref(s.session_date)}
              </span>
              {s.session_time && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {fmtTime(s.session_time)}
                </span>
              )}
              {s.court && (
                <span className="flex items-center gap-1">
                  <Landmark className="h-3.5 w-3.5" />
                  {s.court}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <Badge variant={sessionStatusBadge(s.status)}>
              {sessionStatusLabel(s.status)}
            </Badge>
            {s.gcal_event_id && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                <CalendarCheck className="h-3 w-3" />
                في التقويم
              </span>
            )}
            {cd && (
              <span
                className={cn(
                  'text-xs font-medium',
                  cd.soon ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
                )}
              >
                {cd.text}
              </span>
            )}
          </div>
        </div>

        {s.preparation && (
          <div className="rounded-lg bg-muted/50 p-2.5 text-sm">
            <p className="mb-0.5 text-xs font-semibold text-muted-foreground">
              التحضير
            </p>
            <p className="whitespace-pre-wrap text-foreground">{s.preparation}</p>
          </div>
        )}

        {s.outcome && (
          <div className="rounded-lg bg-emerald-500/10 p-2.5 text-sm text-emerald-800 dark:text-emerald-200">
            <p className="mb-0.5 text-xs font-semibold">نتيجة الجلسة</p>
            <p className="whitespace-pre-wrap">{s.outcome}</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
          {s.minutes_url && (
            <Button variant="outline" size="sm" onClick={() => onPreview(s)}>
              <FileText className="h-4 w-4" />
              المحضر
            </Button>
          )}
          {upcoming && (
            <Button variant="outline" size="sm" onClick={() => onOutcome(s)}>
              <CheckCircle2 className="h-4 w-4" />
              تسجيل نتيجة
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => onEdit(s)}>
            <Pencil className="h-4 w-4" />
            تعديل
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => onDelete(s)}
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
        <CalendarOff className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد جلسات</p>
      <p className="text-sm text-muted-foreground">أضِف أول جلسة عبر «جلسة جديدة».</p>
    </div>
  )
}

/* ===================== تسجيل النتيجة ===================== */

function OutcomeDialog({
  caseId,
  session,
  onClose,
}: {
  caseId: string
  session: CaseSession | null
  onClose: () => void
}) {
  const setOutcomeM = useSetSessionOutcome(caseId)
  const [outcome, setOutcome] = useState('')

  // إعادة تهيئة عند فتح جلسة جديدة
  const open = !!session

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setOutcome('')
          onClose()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تسجيل نتيجة الجلسة</DialogTitle>
        </DialogHeader>
        <div className="my-3 space-y-1.5">
          <Label htmlFor="outcome">نتيجة / محضر الجلسة *</Label>
          <Textarea
            id="outcome"
            rows={4}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="اكتب ما تمّ في الجلسة…"
          />
          <p className="text-xs text-muted-foreground">
            سيتم تحويل حالة الجلسة إلى «منعقدة».
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="gold"
            disabled={setOutcomeM.isPending || outcome.trim() === ''}
            onClick={() => {
              if (session) {
                setOutcomeM.mutate(
                  { id: session.id, outcome: outcome.trim() },
                  {
                    onSuccess: () => {
                      setOutcome('')
                      onClose()
                    },
                  }
                )
              }
            }}
          >
            {setOutcomeM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ النتيجة
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ===================== نموذج الجلسة ===================== */

const schema = z.object({
  title: z.string().optional(),
  session_date: z.string().min(1, 'تاريخ الجلسة مطلوب'),
  session_time: z.string().optional(),
  court: z.string().optional(),
  status: z.string().min(1),
  preparation: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function SessionForm({
  caseId,
  session,
  onDone,
}: {
  caseId: string
  session: CaseSession | null
  onDone: () => void
}) {
  const isEdit = Boolean(session)
  const addM = useAddSession(caseId)
  const updateM = useUpdateSession(caseId)
  const pending = addM.isPending || updateM.isPending

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: session?.title ?? '',
      session_date: session?.session_date ?? '',
      session_time: session?.session_time ? session.session_time.slice(0, 5) : '',
      court: session?.court ?? '',
      status: isEdit ? sessionStatusLabel(session?.status) : 'قادمة',
      preparation: session?.preparation ?? '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const base = {
      title: t(values.title),
      session_date: values.session_date,
      session_time: t(values.session_time),
      court: t(values.court),
      status: values.status, // قيم عربية
      preparation: t(values.preparation),
    }
    if (isEdit && session) {
      await updateM.mutateAsync({ id: session.id, input: base })
    } else {
      await addM.mutateAsync({ case_id: caseId, ...base })
    }
    onDone()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <DialogHeader>
        <DialogTitle>{isEdit ? 'تعديل جلسة' : 'جلسة جديدة'}</DialogTitle>
      </DialogHeader>

      <div className="my-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="session_title">العنوان</Label>
          <Input
            id="session_title"
            placeholder="مثل: جلسة المرافعة"
            {...register('title')}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Controller
              control={control}
              name="session_date"
              render={({ field }) => (
                <DualDatePicker
                  label="التاريخ"
                  required
                  value={field.value || null}
                  onChange={(v) => field.onChange(v ?? '')}
                />
              )}
            />
            {errors.session_date && (
              <p className="text-xs text-destructive">
                {errors.session_date.message}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="session_time">الوقت</Label>
            <Input id="session_time" type="time" {...register('session_time')} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="session_court">المحكمة / القاعة</Label>
            <Input id="session_court" {...register('court')} />
          </div>
          <div className="space-y-1.5">
            <Label>الحالة</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SESSION_STATUS_OPTIONS.map((o) => (
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
          <Label htmlFor="session_prep">التحضير</Label>
          <Textarea id="session_prep" rows={3} {...register('preparation')} />
        </div>
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
