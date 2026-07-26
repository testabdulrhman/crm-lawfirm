import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
  AlertTriangle,
  Paperclip,
  Send,
  MessageCircle,
  Gavel,
  Lock,
  CalendarPlus,
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
import { Switch } from '@/components/ui/switch'

import { cn } from '@/lib/utils'
import {
  fmtNumber,
  fmtDatePref,
  fmtTime,
  todayISO,
} from '@/lib/format'
import { pickFile, uploadFile } from '@/lib/files'
import { getTemplate, fillTemplate } from '@/lib/templates'
import { useExtractSessionMinutes } from '@/hooks/useAiAnalysis'
import { toast } from '@/hooks/use-toast'
import {
  useCaseSessions,
  useAddSession,
  useUpdateSession,
  useDeleteSession,
  useCloseSession,
  usePostponeSession,
  sendSessionReportSms,
  sendSessionReportWhatsApp,
  markSessionReportSent,
  updateSessionNumber,
} from '@/hooks/useCaseSessions'
import {
  sessionDisplayStatus,
  sessionDisplayBadge,
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

export function SessionsTab({
  caseId,
  caseTitle,
  clientName,
  clientPhone,
}: {
  caseId: string
  caseTitle?: string | null
  clientName?: string | null
  clientPhone?: string | null
}) {
  const { data, isLoading } = useCaseSessions(caseId)
  const deleteM = useDeleteSession(caseId)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CaseSession | null>(null)
  const [toDelete, setToDelete] = useState<CaseSession | null>(null)
  const [closeFor, setCloseFor] = useState<CaseSession | null>(null)
  const [postponeFor, setPostponeFor] = useState<CaseSession | null>(null)
  const [preview, setPreview] = useState<CaseSession | null>(null)
  const [resendFor, setResendFor] = useState<CaseSession | null>(null)

  const { upcoming, past } = useMemo(() => {
    const grp = (data ?? []).map((s) => ({ s, st: sessionDisplayStatus(s) }))
    const up = grp
      .filter((x) => x.st === 'قادمة' || x.st === 'منعقدة')
      .sort((a, b) =>
        (a.s.session_date ?? '').localeCompare(b.s.session_date ?? '')
      )
      .map((x) => x.s)
    const pa = grp
      .filter((x) => x.st === 'منتهية' || x.st === 'مؤجّلة')
      .sort((a, b) =>
        (b.s.session_date ?? '').localeCompare(a.s.session_date ?? '')
      )
      .map((x) => x.s)
    return { upcoming: up, past: pa }
  }, [data])

  // رقم الجلسة المقترَح للجلسة الجديدة (أكبر رقم موجود + 1)
  const nextSessionNumber = useMemo(
    () =>
      (data ?? []).reduce((m, s) => Math.max(m, s.session_number ?? 0), 0) + 1,
    [data]
  )

  // الأرقام المستخدمة (رقم ← معرّف جلسته) للتحقق اللحظي في النموذج
  const usedNumbers = useMemo(() => {
    const m = new Map<number, string>()
    for (const s of data ?? [])
      if (s.session_number != null) m.set(s.session_number, s.id)
    return m
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
    <div className="mx-auto max-w-6xl space-y-6">
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
                onClose={setCloseFor}
                onPostpone={setPostponeFor}
                onPreview={setPreview}
                onResend={setResendFor}
              />
            ))}
          </Section>
          <Section title="الجلسات السابقة" count={past.length}>
            {past.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                onEdit={openEdit}
                onDelete={setToDelete}
                onClose={setCloseFor}
                onPostpone={setPostponeFor}
                onPreview={setPreview}
                onResend={setResendFor}
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
            suggestedNumber={editing ? undefined : nextSessionNumber}
            usedNumbers={usedNumbers}
            onDone={() => setFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* تأجيل الجلسة */}
      <PostponeDialog
        caseId={caseId}
        session={postponeFor}
        nextNumber={nextSessionNumber}
        onClose={() => setPostponeFor(null)}
      />

      {/* إغلاق الجلسة */}
      <CloseSessionDialog
        caseId={caseId}
        caseTitle={caseTitle}
        clientName={clientName}
        clientPhone={clientPhone}
        session={closeFor}
        onClose={() => setCloseFor(null)}
      />

      {/* إرسال/إعادة إرسال التقرير */}
      <ResendReportDialog
        caseId={caseId}
        caseTitle={caseTitle}
        clientName={clientName}
        clientPhone={clientPhone}
        session={resendFor}
        onClose={() => setResendFor(null)}
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
  onClose,
  onPostpone,
  onPreview,
  onResend,
}: {
  session: CaseSession
  onEdit: (s: CaseSession) => void
  onDelete: (s: CaseSession) => void
  onClose: (s: CaseSession) => void
  onPostpone: (s: CaseSession) => void
  onPreview: (s: CaseSession) => void
  onResend: (s: CaseSession) => void
}) {
  const st = sessionDisplayStatus(s)
  const isClosed = !!s.closed_at
  // التأجيل متاح للجلسات غير المُغلقة وغير المؤجّلة أصلاً
  const canPostpone = !isClosed && (st === 'قادمة' || st === 'منعقدة')
  // عدّاد تنازلي للقادمة فقط؛ «منعقدة الآن» للمنعقدة
  const cd =
    st === 'قادمة'
      ? countdown(s.session_date)
      : st === 'منعقدة'
        ? { text: 'منعقدة الآن', soon: true }
        : null
  // الجلسة بحاجة إغلاق: منعقدة/منتهية وغير مُغلقة
  const needsClosure = !isClosed && (st === 'منعقدة' || st === 'منتهية')

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {s.session_number != null && (
                <Badge variant="outline" className="shrink-0">
                  رقم {fmtNumber(s.session_number)}
                </Badge>
              )}
              <p className="min-w-0 truncate font-medium text-foreground">
                {s.title || 'جلسة'}
              </p>
            </div>
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
            {isClosed ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                مُغلقة
              </Badge>
            ) : (
              <Badge variant={sessionDisplayBadge(st)}>{st}</Badge>
            )}
            {needsClosure && (
              <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                بحاجة إغلاق
              </span>
            )}
            {s.gcal_event_id && (
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
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

        {/* الخطوة القادمة + وسم إرسال التقرير (للجلسات المُغلقة) */}
        {isClosed && (s.next_action || s.report_sent_at) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {s.next_action && s.next_action !== 'none' && (
              <span className="flex items-center gap-1 font-medium text-foreground">
                {nextActionLabel(s.next_action)}
                {s.ruling_due_date &&
                  s.next_action === 'await_ruling' &&
                  ` — ${fmtDatePref(s.ruling_due_date)}`}
              </span>
            )}
            {s.report_sent_at && (
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Send className="h-3 w-3" />
                أُرسل التقرير
              </span>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 border-t pt-2">
          {s.minutes_url && (
            <Button variant="outline" size="sm" onClick={() => onPreview(s)}>
              <FileText className="h-4 w-4" />
              المحضر
            </Button>
          )}
          {needsClosure && (
            <Button variant="gold" size="sm" onClick={() => onClose(s)}>
              <CheckCircle2 className="h-4 w-4" />
              تسجيل نتيجة الجلسة
            </Button>
          )}
          {canPostpone && (
            <Button variant="outline" size="sm" onClick={() => onPostpone(s)}>
              <CalendarOff className="h-4 w-4" />
              تأجيل
            </Button>
          )}
          {isClosed && (
            <Button variant="outline" size="sm" onClick={() => onClose(s)}>
              <Pencil className="h-4 w-4" />
              تعديل الإغلاق
            </Button>
          )}
          {/* إرسال/إعادة إرسال تقرير الجلسة (بعد تسجيل النتيجة) */}
          {isClosed && !!s.outcome && (
            <Button
              variant="outline"
              size="sm"
              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
              onClick={() => onResend(s)}
            >
              <MessageCircle className="h-4 w-4" />
              {s.report_sent_at ? 'إعادة إرسال التقرير' : 'إرسال التقرير'}
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

/* ===================== تأجيل الجلسة ===================== */

function PostponeDialog({
  caseId,
  session,
  nextNumber,
  onClose,
}: {
  caseId: string
  session: CaseSession | null
  nextNumber: number
  onClose: () => void
}) {
  const postponeM = usePostponeSession(caseId)
  const [newDate, setNewDate] = useState('')
  const [newTime, setNewTime] = useState('')

  // إعادة تهيئة عند فتح جلسة
  useEffect(() => {
    if (!session) return
    setNewDate('')
    setNewTime('')
  }, [session])

  const submit = () => {
    if (!session) return
    postponeM.mutate(
      {
        id: session.id,
        newDate: newDate || null,
        newTime: newDate ? newTime || null : null,
        nextNumber: newDate ? nextNumber : null,
      },
      { onSuccess: () => onClose() }
    )
  }

  return (
    <Dialog open={!!session} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>تأجيل الجلسة</DialogTitle>
        </DialogHeader>

        <div className="my-3 space-y-4">
          <p className="text-sm text-muted-foreground">
            ستُوسم الجلسة «{session?.title || 'جلسة'}» (
            {fmtDatePref(session?.session_date)}) بأنها <b>مؤجّلة</b> وتنتقل إلى
            «الجلسات السابقة».
          </p>

          <div className="space-y-2 rounded-lg border border-dashed p-3">
            <div className="grid grid-cols-2 gap-3">
              <DualDatePicker
                label="التاريخ الجديد (اختياري)"
                value={newDate || null}
                onChange={(v) => setNewDate(v ?? '')}
              />
              <div className="space-y-1.5">
                <Label htmlFor="postpone_time">الوقت (اختياري)</Label>
                <Input
                  id="postpone_time"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  disabled={!newDate}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {newDate
                ? `ستُنشأ جلسة جديدة برقم ${fmtNumber(nextNumber)} بنفس العنوان والمحكمة في ${fmtDatePref(newDate)}، وتُزامَن مع التقويم.`
                : 'اترك التاريخ فارغاً إن لم يتحدّد الموعد الجديد بعد — يمكنك إضافة الجلسة الجديدة لاحقاً.'}
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="gold" disabled={postponeM.isPending} onClick={submit}>
            {postponeM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {newDate ? 'تأجيل وإنشاء الجلسة الجديدة' : 'تأجيل'}
          </Button>
          <Button variant="outline" onClick={onClose} disabled={postponeM.isPending}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ===================== إغلاق الجلسة ===================== */

type NextAction = 'none' | 'next_session' | 'await_ruling' | 'case_closed'

function nextActionLabel(a: string): string {
  if (a === 'next_session') return 'الخطوة: جلسة قادمة'
  if (a === 'await_ruling') return 'الخطوة: انتظار الحكم'
  if (a === 'case_closed') return 'الخطوة: انتهت القضية'
  return ''
}

const NEXT_OPTIONS: { value: NextAction; label: string; icon: typeof CalendarPlus }[] = [
  { value: 'none', label: 'لا شيء الآن', icon: CheckCircle2 },
  { value: 'next_session', label: 'جلسة قادمة', icon: CalendarPlus },
  { value: 'await_ruling', label: 'محكوم فيها (انتظار الحكم)', icon: Gavel },
  { value: 'case_closed', label: 'انتهت القضية', icon: Lock },
]

const REPORT_FALLBACK =
  'عميلنا الكريم {client_name}\nنفيدكم بشأن قضيتكم ({case_title}):\n{outcome}\nشركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس'

// إعادة إرسال تقرير الجلسة للعميل (واتساب/SMS) دون فتح حوار الإغلاق
function ResendReportDialog({
  caseId,
  caseTitle,
  clientName,
  clientPhone,
  session,
  onClose,
}: {
  caseId: string
  caseTitle?: string | null
  clientName?: string | null
  clientPhone?: string | null
  session: CaseSession | null
  onClose: () => void
}) {
  const qc = useQueryClient()
  const open = !!session
  const [tpl, setTpl] = useState<string>(REPORT_FALLBACK)
  const [msg, setMsg] = useState('')
  const [touched, setTouched] = useState(false)
  const [phone, setPhone] = useState('')
  const [wa, setWa] = useState(true)
  const [sms, setSms] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) return
    setTouched(false)
    setMsg('')
    setPhone(clientPhone ?? '')
    setWa(true)
    setSms(false)
    getTemplate('session_report')
      .then((b) => setTpl(b || REPORT_FALLBACK))
      .catch(() => setTpl(REPORT_FALLBACK))
  }, [session, clientPhone])

  const defaultMsg = fillTemplate(tpl, {
    client_name: clientName ?? 'عميلنا',
    case_title: caseTitle ?? '',
    outcome: (session?.outcome ?? '').trim(),
  })
  const value = touched ? msg : defaultMsg

  const send = async () => {
    if (!session || busy) return
    if (!wa && !sms) {
      toast({ variant: 'destructive', title: 'اختر قناة إرسال واحدة على الأقل' })
      return
    }
    if (phone.trim() === '') {
      toast({
        variant: 'destructive',
        title: 'أدخل جوال العميل',
        description: 'لا يوجد جوال محفوظ لهذه القضية.',
      })
      return
    }
    setBusy(true)
    const channels: string[] = []
    try {
      if (wa) {
        const r = await sendSessionReportWhatsApp({
          phone,
          clientName: clientName ?? null,
          message: value,
        })
        if (r.ok) channels.push('whatsapp')
        else
          toast({
            variant: 'destructive',
            title: 'تعذّر الإرسال عبر الواتساب',
            description: r.error ?? 'تحقّق من الرقم واتصال البوابة.',
          })
      }
      if (sms) {
        const ok = await sendSessionReportSms({
          sessionId: session.id,
          phone,
          clientName: clientName ?? null,
          message: value,
          sentBy: null,
        })
        if (ok) channels.push('sms')
        else
          toast({
            variant: 'destructive',
            title: 'تعذّر الإرسال عبر SMS',
            description: 'تحقّق من الرقم ورصيد الرسائل.',
          })
      }
      if (channels.length > 0) {
        await markSessionReportSent(session.id, channels.join(','))
        qc.invalidateQueries({ queryKey: ['case_sessions', caseId] })
        toast({
          variant: 'success',
          title: `أُرسل التقرير (${channels.includes('whatsapp') ? 'واتساب' : ''}${channels.length > 1 ? ' + ' : ''}${channels.includes('sms') ? 'SMS' : ''})`,
        })
        onClose()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {session?.report_sent_at ? 'إعادة إرسال التقرير' : 'إرسال التقرير للعميل'}
          </DialogTitle>
        </DialogHeader>

        <div className="my-3 space-y-4">
          {session?.report_sent_at && (
            <p className="rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
              أُرسل سابقاً في {fmtDatePref(session.report_sent_at)}
              {session.report_sent_via ? ` عبر ${session.report_sent_via}` : ''}.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="rs_phone">جوال العميل *</Label>
            <Input
              id="rs_phone"
              dir="ltr"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="05xxxxxxxx"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rs_msg">نص التقرير</Label>
            <Textarea
              id="rs_msg"
              rows={7}
              value={value}
              onChange={(e) => {
                setTouched(true)
                setMsg(e.target.value)
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={wa} onCheckedChange={setWa} />
              <MessageCircle className="h-4 w-4 text-emerald-600" />
              واتساب
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={sms} onCheckedChange={setSms} />
              <Send className="h-4 w-4 text-muted-foreground" />
              رسالة نصية
            </label>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="gold" onClick={send} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            إرسال
          </Button>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CloseSessionDialog({
  caseId,
  caseTitle,
  clientName,
  clientPhone,
  session,
  onClose,
}: {
  caseId: string
  caseTitle?: string | null
  clientName?: string | null
  clientPhone?: string | null
  session: CaseSession | null
  onClose: () => void
}) {
  const closeM = useCloseSession(caseId)
  const extractM = useExtractSessionMinutes()
  const open = !!session
  const hasPhone = !!(clientPhone && clientPhone.trim())

  const [outcome, setOutcome] = useState('')
  const [sessionNum, setSessionNum] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [sendSms, setSendSms] = useState(false)
  const [sendWa, setSendWa] = useState(false)
  const [tpl, setTpl] = useState<string>(REPORT_FALLBACK)
  const [reportMsg, setReportMsg] = useState('')
  const [reportTouched, setReportTouched] = useState(false)
  const [next, setNext] = useState<NextAction>('none')
  const [nextDate, setNextDate] = useState('')
  const [nextTime, setNextTime] = useState('')
  const [rulingDate, setRulingDate] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const [busy, setBusy] = useState(false)

  // إعادة تهيئة + جلب القالب عند فتح جلسة
  useEffect(() => {
    if (!session) return
    setOutcome(session.outcome ?? '')
    setSessionNum(
      session.session_number != null ? String(session.session_number) : ''
    )
    setFile(null)
    setUploadedUrl(null)
    setSendSms(false)
    setSendWa(false)
    setReportTouched(false)
    setReportMsg('')
    setNext((session.next_action as NextAction) || 'none')
    setNextDate('')
    setNextTime('')
    setRulingDate(session.ruling_due_date ?? '')
    setConfirmClose(false)
    getTemplate('session_report')
      .then((b) => setTpl(b || REPORT_FALLBACK))
      .catch(() => setTpl(REPORT_FALLBACK))
  }, [session])

  // نص التقرير الافتراضي من القالب + النتيجة الحالية
  const defaultReport = fillTemplate(tpl, {
    client_name: clientName ?? 'عميلنا',
    case_title: caseTitle ?? '',
    outcome: outcome.trim(),
  })
  const reportValue = reportTouched ? reportMsg : defaultReport

  const canSave =
    outcome.trim() !== '' &&
    (next !== 'case_closed' || confirmClose) &&
    (next !== 'next_session' || nextDate !== '') &&
    (next !== 'await_ruling' || rulingDate !== '')

  // يضمن رابطاً لمحضر الجلسة (يرفع الملف إن لزم) للاستخراج/الحفظ
  const ensureMinutesUrl = async (f?: File | null): Promise<string | null> => {
    if (uploadedUrl) return uploadedUrl
    const theFile = f ?? file
    if (theFile) {
      setUploading(true)
      try {
        const { publicUrl } = await uploadFile(theFile, {
          folder: `sessions/${caseId}`,
        })
        setUploadedUrl(publicUrl)
        return publicUrl
      } finally {
        setUploading(false)
      }
    }
    return null
  }

  // قراءة المحضر بالذكاء الاصطناعي وتعبئة النتيجة/الخطوة القادمة (يفتح المنتقي إن لزم)
  const handleExtractMinutes = async () => {
    let f = file
    if (!f && !uploadedUrl) {
      f = await pickFile()
      if (!f) return
      setFile(f)
      setUploadedUrl(null)
    }
    const url = await ensureMinutesUrl(f)
    if (!url) return
    const parsed = await extractM.mutateAsync(url)
    if (!parsed) return
    const isISO = (v: string | null | undefined) =>
      !!v && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())
    if (parsed.outcome && parsed.outcome.trim() !== '') {
      setOutcome(parsed.outcome.trim())
    }
    if (parsed.session_number != null && Number.isFinite(parsed.session_number)) {
      setSessionNum(String(parsed.session_number))
    }
    // الخطوة القادمة + تواريخها (إن استُنتجت من المحضر)
    const na = parsed.next_action
    if (na === 'next_session' || na === 'await_ruling' || na === 'case_closed') {
      setNext(na)
      if (na === 'next_session' && isISO(parsed.next_session_date)) {
        setNextDate(parsed.next_session_date!.trim())
        if (parsed.next_session_time && /^\d{2}:\d{2}/.test(parsed.next_session_time)) {
          setNextTime(parsed.next_session_time.slice(0, 5))
        }
      }
      if (na === 'await_ruling' && isISO(parsed.ruling_due_date)) {
        setRulingDate(parsed.ruling_due_date!.trim())
      }
    }
  }

  const handleSave = async () => {
    if (!session || !canSave) return
    setBusy(true)
    try {
      // 0) حفظ رقم الجلسة إن تغيّر (مستقل عن دالة الإغلاق)
      const numRaw = sessionNum.trim()
      const numToSave = numRaw && /^\d+$/.test(numRaw) ? parseInt(numRaw, 10) : null
      if (numToSave !== (session.session_number ?? null)) {
        const numErr = await updateSessionNumber(session.id, numToSave)
        if (numErr) {
          // لا يوقف الإغلاق — لكن يوضّح السبب
          toast({
            variant: 'destructive',
            title: 'لم يُحفظ رقم الجلسة',
            description: numErr,
          })
        }
      }

      // 1) رفع المحضر إن وُجد (يُعاد استخدام رابط الاستخراج إن سبق رفعه)
      const minutesUrl = await ensureMinutesUrl()

      // 2) إغلاق الجلسة عبر الدالة
      const res = await closeM.mutateAsync({
        sessionId: session.id,
        outcome: outcome.trim(),
        minutesUrl,
        nextAction: next,
        nextSessionDate: next === 'next_session' ? nextDate || null : null,
        nextSessionTime: next === 'next_session' ? nextTime || null : null,
        rulingDueDate: next === 'await_ruling' ? rulingDate || null : null,
      })

      // 3) إرسال التقرير المختار
      const phone = res.client_phone || clientPhone || ''
      const channels: string[] = []
      if (hasPhone || phone) {
        if (sendWa && phone) {
          // إرسال مباشر عبر بوابة الواتساب (لا يفتح wa.me)
          const wa = await sendSessionReportWhatsApp({
            phone,
            clientName: res.client_name || clientName || null,
            message: reportValue,
          })
          if (wa.ok) channels.push('whatsapp')
          else
            toast({
              variant: 'destructive',
              title: 'تعذّر إرسال التقرير عبر الواتساب',
              description: wa.error ?? 'تحقّق من الرقم واتصال البوابة.',
            })
        }
        if (sendSms && phone) {
          const ok = await sendSessionReportSms({
            sessionId: session.id,
            phone,
            clientName: res.client_name || clientName || null,
            message: reportValue,
            sentBy: null,
          })
          if (ok) channels.push('sms')
        }
      }
      if (channels.length > 0) {
        await markSessionReportSent(session.id, channels.join(','))
      }

      // 4) رسالة نجاح حسب الخطوة
      let extra = ''
      if (next === 'next_session') extra = ' · أُنشئت الجلسة القادمة'
      else if (next === 'await_ruling') extra = ' · سُجّل موعد استلام الحكم'
      else if (next === 'case_closed') extra = ' · أُقفلت القضية'
      toast({ variant: 'success', title: `تم إغلاق الجلسة${extra}` })
      onClose()
    } catch {
      // أخطاء الإغلاق يعرضها الهوك؛ نُبقي الحوار مفتوحاً
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>إغلاق الجلسة</DialogTitle>
        </DialogHeader>

        <div className="my-3 space-y-4">
          {/* 1) المحضر/النتيجة */}
          {/* تعبئة تلقائية من المحضر بالذكاء الاصطناعي */}
          <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-900/40 dark:bg-violet-950/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-violet-500" />
              تعبئة تلقائية من المحضر
            </div>
            <p className="text-xs text-muted-foreground">
              أرفق صورة/ملف محضر الجلسة، والنظام يقرأه ويملأ النتيجة والخطوة
              القادمة. راجِعها قبل الحفظ.
            </p>
            <Button
              type="button"
              size="sm"
              className="bg-violet-600 text-white hover:bg-violet-700"
              disabled={extractM.isPending || uploading}
              onClick={handleExtractMinutes}
            >
              {extractM.isPending || uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {extractM.isPending || uploading
                ? 'جارٍ قراءة المحضر وتعبئة الحقول...'
                : file || uploadedUrl
                  ? 'استخراج البيانات من المحضر'
                  : 'إرفاق المحضر واستخراج البيانات'}
            </Button>
          </div>

          {/* رقم الجلسة (يُملأ تلقائياً من المحضر إن ذُكر) */}
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="close_num">رقم الجلسة</Label>
              <Input
                id="close_num"
                type="number"
                min={1}
                dir="ltr"
                className="text-center"
                value={sessionNum}
                onChange={(e) => setSessionNum(e.target.value)}
              />
            </div>
          </div>

          {/* 1) المحضر/النتيجة */}
          <div className="space-y-1.5">
            <Label htmlFor="close_outcome">محضر / نتيجة الجلسة *</Label>
            <Textarea
              id="close_outcome"
              rows={4}
              value={outcome}
              onChange={(e) => setOutcome(e.target.value)}
              placeholder="اكتب ما تمّ في الجلسة…"
            />
          </div>

          {/* 2) مرفق المحضر */}
          <div className="space-y-1.5">
            <Label>مرفق المحضر (اختياري)</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  const f = await pickFile()
                  if (f) {
                    setFile(f)
                    setUploadedUrl(null)
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
              {file && (
                <button
                  type="button"
                  className="text-xs text-destructive"
                  onClick={() => {
                    setFile(null)
                    setUploadedUrl(null)
                  }}
                >
                  إزالة
                </button>
              )}
            </div>
          </div>

          {/* 3) إرسال تقرير للعميل */}
          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-semibold text-foreground">
              إرسال تقرير للعميل
            </p>
            {!hasPhone && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                لا يوجد هاتف للعميل — الإرسال معطّل.
              </p>
            )}
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={sendSms}
                  onCheckedChange={setSendSms}
                  disabled={!hasPhone}
                />
                <span className="flex items-center gap-1">
                  <Send className="h-3.5 w-3.5" /> SMS
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch
                  checked={sendWa}
                  onCheckedChange={setSendWa}
                  disabled={!hasPhone}
                />
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" /> واتساب
                </span>
              </label>
            </div>
            {(sendSms || sendWa) && (
              <div className="space-y-1.5">
                <Label htmlFor="report_msg" className="text-xs">
                  نص التقرير (قابل للتعديل)
                </Label>
                <Textarea
                  id="report_msg"
                  rows={4}
                  value={reportValue}
                  onChange={(e) => {
                    setReportMsg(e.target.value)
                    setReportTouched(true)
                  }}
                />
              </div>
            )}
          </div>

          {/* 4) الخطوة القادمة */}
          <div className="space-y-2">
            <Label>الخطوة القادمة (اختيارية)</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {NEXT_OPTIONS.map((o) => {
                const active = next === o.value
                const Icon = o.icon
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setNext(o.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-right text-sm transition-colors',
                      active
                        ? 'border-gold bg-gold/10 font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-accent/10'
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-gold" />
                    {o.label}
                  </button>
                )
              })}
            </div>

            {next === 'next_session' && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed p-3">
                <DualDatePicker
                  label="تاريخ الجلسة القادمة *"
                  required
                  value={nextDate || null}
                  onChange={(v) => setNextDate(v ?? '')}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="next_time">الوقت (اختياري)</Label>
                  <Input
                    id="next_time"
                    type="time"
                    value={nextTime}
                    onChange={(e) => setNextTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            {next === 'await_ruling' && (
              <div className="rounded-lg border border-dashed p-3">
                <DualDatePicker
                  label="موعد استلام الحكم *"
                  required
                  value={rulingDate || null}
                  onChange={(v) => setRulingDate(v ?? '')}
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  ستُنشأ مهمة تذكير «استلام الحكم» بأولوية عالية.
                </p>
              </div>
            )}

            {next === 'case_closed' && (
              <label className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={confirmClose}
                  onChange={(e) => setConfirmClose(e.target.checked)}
                />
                <span className="text-foreground">
                  أؤكّد إقفال القضية نهائيّاً بعد هذه الجلسة.
                </span>
              </label>
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="gold" disabled={!canSave || busy} onClick={handleSave}>
            {(busy || closeM.isPending || uploading) && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            حفظ وإغلاق الجلسة
          </Button>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ===================== نموذج الجلسة ===================== */

// تحقّق لحظي على تاريخ الجلسة (تنبيه فقط — لا يمنع الحفظ).
// يعمل على القيمة الميلادية المخزّنة (session_date) بغضّ النظر عن واجهة الإدخال.
const pad2 = (n: number) => String(n).padStart(2, '0')
const toIso = (d: Date) =>
  `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

interface SessionDateWarning {
  message: string
  suggestionIso?: string
  suggestionYear?: number
}

function getSessionDateWarning(
  dateStr: string | undefined
): SessionDateWarning | null {
  if (!dateStr) return null
  const parts = dateStr.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => isNaN(n))) return null
  const [y, m, d] = parts
  const date = new Date(y, m - 1, d)
  if (isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const DAY = 86400000
  const diff = Math.round((date.getTime() - today.getTime()) / DAY)

  // 1+2) التاريخ في الماضي — مع اقتراح تصحيح السنة إن لزم
  if (diff < 0) {
    const n = -diff
    const suggested = new Date(y + 1, m - 1, d)
    suggested.setHours(0, 0, 0, 0)
    const sdiff = Math.round((suggested.getTime() - today.getTime()) / DAY)
    if (sdiff >= 0 && sdiff <= 400) {
      return {
        message: `تاريخ الجلسة في الماضي (قبل ${fmtNumber(n)} يوم). هل تقصد ${fmtDatePref(toIso(suggested))}؟`,
        suggestionIso: toIso(suggested),
        suggestionYear: y + 1,
      }
    }
    return {
      message: `تاريخ الجلسة في الماضي (قبل ${fmtNumber(n)} يوم). تأكّد من صحة التاريخ — هل تقصد سنة ${String(today.getFullYear())}؟`,
    }
  }

  // 3) تاريخ بعيد جداً (أكثر من سنتين)
  if (diff > 730) {
    const years = Math.max(2, Math.floor(diff / 365))
    return {
      message: `التاريخ بعيد جداً (بعد ${fmtNumber(years)} سنة تقريباً). تأكّد من صحته.`,
    }
  }

  return null
}

const schema = z.object({
  title: z.string().trim().min(1, 'يلزم إدخال عنوان للجلسة'),
  session_number: z.string().optional(),
  session_date: z.string().min(1, 'تاريخ الجلسة مطلوب'),
  session_time: z.string().optional(),
  court: z.string().optional(),
  preparation: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

function SessionForm({
  caseId,
  session,
  suggestedNumber,
  usedNumbers,
  onDone,
}: {
  caseId: string
  session: CaseSession | null
  suggestedNumber?: number
  usedNumbers?: Map<number, string>
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
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: session?.title ?? '',
      session_number:
        session?.session_number != null
          ? String(session.session_number)
          : suggestedNumber
            ? String(suggestedNumber)
            : '',
      session_date: session?.session_date ?? todayISO(), // الافتراضي: اليوم
      session_time: session?.session_time ? session.session_time.slice(0, 5) : '',
      court: session?.court ?? '',
      preparation: session?.preparation ?? '',
    },
  })

  // تنبيه لحظي على التاريخ (يظهر/يختفي تلقائياً)
  const dateWarn = getSessionDateWarning(watch('session_date'))

  // تحقّق لحظي: هل رقم الجلسة مستخدم في جلسة أخرى بنفس القضية؟
  const numWatch = (watch('session_number') ?? '').trim()
  const numParsed = /^\d+$/.test(numWatch) ? parseInt(numWatch, 10) : null
  const numTakenBy =
    numParsed != null ? usedNumbers?.get(numParsed) : undefined
  const numDuplicate = !!numTakenBy && numTakenBy !== session?.id

  const onSubmit = async (values: FormValues) => {
    if (numDuplicate) return // ممنوع الحفظ برقم مكرّر — الرسالة ظاهرة تحت الحقل
    const t = (v: string | undefined) => (v && v.trim() !== '' ? v.trim() : null)
    const numRaw = values.session_number?.trim()
    const sessionNumber =
      numRaw && /^\d+$/.test(numRaw) ? parseInt(numRaw, 10) : null
    // الحالة لا تُرسل: تلقائية حسب الوقت (والإضافة تبدأ «قادمة» من الهوك)
    const base = {
      title: values.title.trim(),
      session_number: sessionNumber,
      session_date: values.session_date,
      session_time: t(values.session_time),
      court: t(values.court),
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
        <div className="grid grid-cols-[6rem_1fr] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="session_number">رقم الجلسة</Label>
            <Input
              id="session_number"
              type="number"
              min={1}
              dir="ltr"
              className={cn(
                'text-center',
                numDuplicate && 'border-destructive focus-visible:ring-destructive'
              )}
              {...register('session_number')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="session_title">
              العنوان <span className="text-destructive">*</span>
            </Label>
            <Input
              id="session_title"
              placeholder="مثل: جلسة المرافعة"
              className={cn(
                errors.title && 'border-destructive focus-visible:ring-destructive'
              )}
              {...register('title')}
            />
          </div>
        </div>
        {errors.title && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            {errors.title.message}
          </p>
        )}
        {numDuplicate && (
          <p className="flex items-center gap-1 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            رقم الجلسة {fmtNumber(numParsed ?? 0)} مستخدم مسبقاً في هذه القضية —
            اختر رقماً آخر.
          </p>
        )}

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

        {/* تنبيه ذكي على تاريخ الجلسة (لا يمنع الحفظ) */}
        {dateWarn && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1.5">
              <p className="leading-relaxed">{dateWarn.message}</p>
              {dateWarn.suggestionIso && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/40"
                  onClick={() =>
                    setValue('session_date', dateWarn.suggestionIso!, {
                      shouldValidate: true,
                    })
                  }
                >
                  تصحيح إلى {String(dateWarn.suggestionYear)}
                </Button>
              )}
            </div>
          </div>
        )}

        {/* الحالة تلقائية حسب الوقت — لا حاجة لحقلها هنا */}
        <div className="space-y-1.5">
          <Label htmlFor="session_court">المحكمة / القاعة</Label>
          <Input id="session_court" {...register('court')} />
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
