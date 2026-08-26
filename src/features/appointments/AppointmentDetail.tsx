import { useEffect, useState } from 'react'
import { useLocation, Link } from 'wouter'
import {
  ArrowRight,
  CalendarRange,
  Pencil,
  Trash2,
  Phone,
  BookUser,
  CalendarDays,
  Clock,
  Timer,
  MessageSquare,
  CheckCircle2,
  Loader2,
  Video,
  Send,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { QueryErrorState } from '@/components/QueryErrorState'
import { useConfirm } from '@/components/ConfirmDialog'
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

import { fmtDatePref, fmtTime, fmtDateTime, fmtNumber } from '@/lib/format'
import { openExternal } from '@/lib/external'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useAppointment,
  useUpdateAppointmentStatus,
  useDeleteAppointment,
  useSendConfirmation,
  useGenerateMeetLink,
  useSaveMeetingLink,
  useSendMeetingLink,
  useSendThankYou,
} from '@/hooks/useAppointments'
import { AppointmentForm } from './AppointmentForm'
import { APPT_STATUS_OPTIONS, apptStatusLabel } from '@/lib/appointmentLabels'

export function AppointmentDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const { data: a, isLoading, isError, error, refetch } = useAppointment(id)
  const statusM = useUpdateAppointmentStatus()
  const deleteM = useDeleteAppointment()
  const confirmM = useSendConfirmation()
  const genLinkM = useGenerateMeetLink()
  const saveLinkM = useSaveMeetingLink()
  const sendLinkM = useSendMeetingLink()
  const [linkDraft, setLinkDraft] = useState(a?.meeting_link ?? '')
  // ⚠️ useState يأخذ القيمة الأولى فقط، والموعد يصل بعد أول رسم —
  //    فكان الحقل يبقى فارغاً رغم وجود الرابط محفوظاً (بلاغ 2026-08-26).
  useEffect(() => {
    setLinkDraft(a?.meeting_link ?? '')
  }, [a?.id, a?.meeting_link])
  const thankM = useSendThankYou()

  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { confirm, dialog } = useConfirm()

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (isError || !a) {
    return (
      <QueryErrorState
        title="تعذّر تحميل الموعد"
        error={error}
        onRetry={() => refetch()}
        backTo="/appointments"
        backLabel="رجوع للمواعيد"
      />
    )
  }

  const clientName = a.client_name || a.client?.name
  const clientPhone = a.client_phone || a.client?.phone
  const clientId = a.client_id || a.client?.id
  const sentBy = teamMember?.name ?? null

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => navigate('/appointments')}>
          <ArrowRight className="h-4 w-4" />
          رجوع للمواعيد
        </Button>
        <div className="flex items-center gap-1">
          {/* جسر إلى التقويم — يفتحه على يوم الموعد ليرى الموظف بقية يومه */}
          <Button
            variant="ghost"
            size="sm"
            title="اعرض هذا اليوم في التقويم"
            onClick={() => {
              try {
                sessionStorage.setItem('calendar:open-on', a.appointment_date ?? '')
              } catch {
                /* تخزين معطّل — يفتح التقويم على اليوم الحالي */
              }
              navigate('/calendar')
            }}
          >
            <CalendarRange className="h-4 w-4" />
            في التقويم
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" />
            تعديل
          </Button>
          {isDirector && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" />
              حذف
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground">
                {clientName || 'موعد'}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {fmtDatePref(a.appointment_date)}
                </span>
                {a.appointment_time && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {fmtTime(a.appointment_time)}
                  </span>
                )}
                {a.duration_minutes != null && (
                  <span className="flex items-center gap-1">
                    <Timer className="h-3.5 w-3.5" />
                    {fmtNumber(a.duration_minutes)} دقيقة
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {statusM.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <Select
                value={a.status ?? 'confirmed'}
                disabled={statusM.isPending}
                onValueChange={(v) => statusM.mutate({ id: a.id, status: v })}
              >
                <SelectTrigger className="h-9 w-28">
                  <SelectValue>{apptStatusLabel(a.status)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {APPT_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* العميل */}
          <div className="flex flex-wrap items-center gap-3 border-t pt-4 text-sm">
            {clientPhone && (
              <button
                dir="ltr"
                className="flex items-center gap-1 text-muted-foreground hover:text-gold"
                onClick={() => openExternal(`tel:${clientPhone}`)}
              >
                <Phone className="h-3.5 w-3.5" />
                {clientPhone}
              </button>
            )}
            {clientId && (
              <Link
                href={`/contacts/${clientId}`}
                className="inline-flex items-center gap-1 text-gold hover:underline"
              >
                <BookUser className="h-3.5 w-3.5" />
                ملف العميل
              </Link>
            )}
          </div>

          {a.notes && (
            <p className="whitespace-pre-wrap border-t pt-4 text-sm text-foreground">
              {a.notes}
            </p>
          )}
          {a.created_by && (
            <p className="text-xs text-muted-foreground">أنشأه: {a.created_by}</p>
          )}
        </CardContent>
      </Card>

      {/* إجراءات SMS */}
      <Card>
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <MessageSquare className="h-4 w-4 text-gold" />
          <CardTitle className="text-base">رسائل SMS</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <SmsRow
            title="تأكيد الموعد"
            sentAt={a.confirmation_sent_at}
            pending={confirmM.isPending}
            hasPhone={!!clientPhone}
            onSend={() => {
              const send = () => confirmM.mutate({ appointment: a, sentBy })
              if (a.confirmation_sent_at) {
                confirm({
                  title: 'إعادة إرسال رسالة التأكيد؟',
                  description: 'أُرسلت رسالة التأكيد سابقاً — ستصل العميل رسالة SMS جديدة.',
                  confirmLabel: 'إرسال',
                  destructive: false,
                  onConfirm: send,
                })
              } else {
                send()
              }
            }}
          />
          {/* رابط الاجتماع — للمواعيد عن بُعد فقط. الرابط يُجهَّز بعد الحجز
              (التأكيد وصل الموكّل فوراً بأن الرابط سيصله لاحقاً). */}
          {a.meeting_method === 'remote' && (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <Video className="h-4 w-4 text-gold" />
                رابط الاجتماع عن بُعد
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  dir="ltr"
                  value={linkDraft}
                  onChange={(e) => setLinkDraft(e.target.value)}
                  placeholder="https://meet.google.com/…"
                  className="min-w-[12rem] flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={saveLinkM.isPending || linkDraft.trim() === (a.meeting_link ?? '')}
                  onClick={() => saveLinkM.mutate({ id: a.id, link: linkDraft })}
                >
                  {saveLinkM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  حفظ
                </Button>
                {/* توليد تلقائي من Google — يغني عن نسخ الرابط يدوياً */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={genLinkM.isPending}
                  title="ينشئ حدثاً في تقويم Google ورابط اجتماع تلقائياً"
                  onClick={() =>
                    genLinkM.mutate(a, { onSuccess: (link) => setLinkDraft(link) })
                  }
                >
                  {genLinkM.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4 text-gold" />
                  )}
                  {a.meeting_link ? 'إنشاء رابط جديد' : 'إنشاء رابط اجتماع'}
                </Button>
                <Button
                  variant="gold"
                  size="sm"
                  disabled={!a.meeting_link || sendLinkM.isPending || !clientPhone}
                  title={
                    !a.meeting_link
                      ? 'احفظ الرابط أولاً'
                      : !clientPhone
                        ? 'لا يوجد رقم جوال للعميل'
                        : undefined
                  }
                  onClick={() => sendLinkM.mutate({ appointment: a, sentBy })}
                >
                  {sendLinkM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  <Send className="h-4 w-4" />
                  {a.meeting_link_sent_at ? 'إعادة إرسال الرابط' : 'إرسال الرابط للموكّل'}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {a.meeting_link_sent_at
                  ? `أُرسل الرابط ${fmtDateTime(a.meeting_link_sent_at)}`
                  : 'لم يُرسل الرابط بعد — الموكّل يعلم أنه سيصله قبل الموعد.'}
              </p>
            </div>
          )}

          <SmsRow
            title="رسالة شكر بعد الموعد"
            sentAt={a.thank_you_sent_at}
            pending={thankM.isPending}
            hasPhone={!!clientPhone}
            onSend={() => {
              const send = () => thankM.mutate({ appointment: a, sentBy })
              if (a.thank_you_sent_at) {
                confirm({
                  title: 'إعادة إرسال رسالة الشكر؟',
                  description: 'أُرسلت رسالة الشكر سابقاً — ستصل العميل رسالة SMS جديدة.',
                  confirmLabel: 'إرسال',
                  destructive: false,
                  onConfirm: send,
                })
              } else {
                send()
              }
            }}
          />
          {!clientPhone && (
            <p className="text-xs text-destructive">
              لا يوجد رقم جوال للعميل — لن تُرسل الرسائل.
            </p>
          )}
        </CardContent>
      </Card>

      {/* الحوارات */}
      {dialog}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-xl">
          <AppointmentForm appointment={a} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف الموعد</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف موعد «{clientName || ''}» نهائياً. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                deleteM.mutate(a.id, { onSuccess: () => navigate('/appointments') })
              }
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function SmsRow({
  title,
  sentAt,
  pending,
  hasPhone,
  onSend,
}: {
  title: string
  sentAt: string | null
  pending: boolean
  hasPhone: boolean
  onSend: () => void
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {sentAt ? (
          <p className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
            أُرسل في {fmtDateTime(sentAt)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">لم يُرسل بعد</p>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onSend}
        disabled={pending || !hasPhone}
        title={!hasPhone ? 'لا يوجد رقم جوال للعميل' : undefined}
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {sentAt ? 'إعادة الإرسال' : 'إرسال'}
      </Button>
    </div>
  )
}
