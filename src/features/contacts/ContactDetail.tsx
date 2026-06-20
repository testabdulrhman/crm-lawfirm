import { useState } from 'react'
import { useLocation } from 'wouter'
import {
  ArrowRight,
  Pencil,
  Trash2,
  PhoneIncoming,
  PhoneOutgoing,
  Scale,
  FileText,
  CalendarDays,
  Inbox,
  Building2,
  ChevronDown,
  ChevronUp,
  PhoneOff,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Dialog, DialogContent } from '@/components/ui/dialog'
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

import { fmtNumber, fmtDate, fmtDateTime } from '@/lib/format'
import { openExternal } from '@/lib/external'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useContact,
  useContactWorkLinks,
  useContactCalls,
  useContactRelations,
  useDeleteContact,
} from '@/hooks/useContacts'
import { ContactForm } from './ContactForm'
import {
  categoryBadge,
  categoryLabel,
  sentimentBadge,
  sourceLabel,
} from '@/lib/contactLabels'
import type { Contact, HatifCall } from '@/types/db'

export function ContactDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { data: c, isLoading, isError } = useContact(id)
  const { data: workLinks } = useContactWorkLinks()
  const isDirector = useIsDirector()
  const deleteM = useDeleteContact()

  const [tab, setTab] = useState('overview')
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const links = workLinks?.get(id)
  const total = links?.total_links ?? 0

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !c) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/contacts')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل جهة الاتصال</AlertTitle>
        </Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" onClick={() => navigate('/contacts')}>
        <ArrowRight className="h-4 w-4" />
        رجوع لجهات الاتصال
      </Button>

      {/* الرأس */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground">{c.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={categoryBadge(c.category)}>
                  {categoryLabel(c.category)}
                </Badge>
                {c.entity_type && <Badge variant="outline">{c.entity_type}</Badge>}
                <span className="text-xs text-muted-foreground">
                  المصدر: {sourceLabel(c.source)}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
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

          {/* ملخّص سريع */}
          <div className="flex flex-wrap gap-4 border-t pt-3 text-sm">
            <Stat label="القضايا" value={links?.cases_count ?? 0} />
            <Stat label="المواعيد" value={links?.appointments_count ?? 0} />
            <Stat label="الخدمات" value={links?.services_count ?? 0} />
          </div>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <TabsList className="flex w-full flex-wrap justify-start gap-1 sm:w-auto">
          <TabsTrigger value="overview">نظرة عامة</TabsTrigger>
          <TabsTrigger value="calls">سجل التواصل</TabsTrigger>
          <TabsTrigger value="relations">الارتباطات</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab contact={c} />
        </TabsContent>
        <TabsContent value="calls">
          <CallsTab contactId={id} active={tab === 'calls'} />
        </TabsContent>
        <TabsContent value="relations">
          <RelationsTab contactId={id} active={tab === 'relations'} />
        </TabsContent>
      </Tabs>

      {/* تعديل */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <ContactForm contact={c} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* حذف */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف جهة الاتصال</AlertDialogTitle>
            <AlertDialogDescription>
              {total > 0 ? (
                <>
                  لا يمكن حذف «{c.name}» لأنها مرتبطة بـ {fmtNumber(total)} سجل عمل
                  (قضايا/خدمات/مواعيد/طلبات/إفراغات). أزِل الارتباط أولاً.
                </>
              ) : (
                <>
                  سيتم حذف «{c.name}» نهائياً. لا يمكن التراجع. هل أنت متأكد؟
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            {total === 0 && (
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() =>
                  deleteM.mutate(c.id, {
                    onSuccess: () => navigate('/contacts'),
                  })
                }
              >
                حذف
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span className="text-lg font-bold text-foreground">
        {fmtNumber(value)}
      </span>{' '}
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}

/* ===================== نظرة عامة ===================== */

function OverviewTab({ contact: c }: { contact: Contact }) {
  const phoneRow = (label: string, val: string | null) =>
    val ? (
      <div>
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd dir="ltr" className="mt-0.5 text-right text-sm">
          <button
            className="hover:text-gold"
            onClick={() => openExternal(`tel:${val}`)}
          >
            {val}
          </button>
        </dd>
      </div>
    ) : null

  return (
    <Card>
      <CardContent className="pt-6">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {phoneRow('الجوال', c.phone)}
          {phoneRow('جوال آخر', c.phone2)}
          <Row label="البريد الإلكتروني" value={c.email} dir="ltr" />
          <Row label="المدينة" value={c.city} />
          <Row label="الجنسية" value={c.nationality} />
          <Row label="رقم الهوية" value={c.id_number} dir="ltr" />
          <Row label="الجنس" value={c.gender} />
          <Row label="تاريخ الميلاد" value={c.birth_date ? fmtDate(c.birth_date) : null} />
          <Row label="المهنة" value={c.occupation} />
          <Row label="تاريخ التعاقد" value={c.contract_date ? fmtDate(c.contract_date) : null} />
          <Row label="الرقم التسلسلي" value={c.serial_number} dir="ltr" />
          <Row label="ملاحظات" value={c.notes} full />
        </dl>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  dir,
  full,
}: {
  label: string
  value: string | null | undefined
  dir?: 'ltr' | 'rtl'
  full?: boolean
}) {
  if (!value || value.trim() === '') return null
  return (
    <div className={full ? 'sm:col-span-2' : ''}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        dir={dir}
        className={
          'mt-0.5 whitespace-pre-wrap text-sm text-foreground ' +
          (dir === 'ltr' ? 'text-right' : '')
        }
      >
        {value}
      </dd>
    </div>
  )
}

/* ===================== سجل التواصل ===================== */

function CallsTab({
  contactId,
  active,
}: {
  contactId: string
  active: boolean
}) {
  const { data, isLoading } = useContactCalls(contactId, active)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <PhoneOff className="h-6 w-6 text-muted-foreground" />
        </div>
        <p className="font-medium text-foreground">لا توجد مكالمات مسجّلة لهذه الجهة</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {fmtNumber(data.length)} مكالمة
      </p>
      {data.map((call) => (
        <CallCard key={call.id} call={call} />
      ))}
    </div>
  )
}

function CallCard({ call }: { call: HatifCall }) {
  const [showTranscript, setShowTranscript] = useState(false)
  // الاتجاه: 1=وارد افتراضاً؟ نعتمد النص؛ نخمّن وارد إن احتوى «وارد» أو direction==1
  const incoming =
    (call.direction_label?.includes('وارد') ?? false) || call.direction === 1
  const DirIcon = incoming ? PhoneIncoming : PhoneOutgoing

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* الرأس */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className={
                'flex h-8 w-8 items-center justify-center rounded-full ' +
                (incoming
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300'
                  : 'bg-blue-500/15 text-blue-600 dark:text-blue-300')
              }
            >
              <DirIcon className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">
                {call.direction_label ?? (incoming ? 'وارد' : 'صادر')}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDateTime(call.pickup_time)}
                {call.call_length ? ` · ${call.call_length}` : ''}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {call.status_label && (
              <Badge variant="outline">{call.status_label}</Badge>
            )}
            {call.sentiment_label && (
              <Badge variant={sentimentBadge(call.sentiment_label)}>
                {call.sentiment_label}
              </Badge>
            )}
          </div>
        </div>

        {call.handler_name && (
          <p className="text-xs text-muted-foreground">
            الموظف: {call.handler_name}
          </p>
        )}

        {/* الملخّص */}
        {call.summary && (
          <div className="rounded-lg bg-gold/10 p-3 text-sm">
            <p className="mb-1 text-xs font-semibold text-gold-600 dark:text-gold-300">
              ملخّص المكالمة
            </p>
            <p className="whitespace-pre-wrap leading-relaxed text-foreground">
              {call.summary}
            </p>
          </div>
        )}

        {/* التسجيل */}
        {call.recording_url && (
          <audio controls src={call.recording_url} className="w-full">
            متصفّحك لا يدعم تشغيل الصوت.
          </audio>
        )}

        {/* التفريغ النصّي */}
        {call.transcription_text && (
          <div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowTranscript((s) => !s)}
            >
              {showTranscript ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              {showTranscript ? 'إخفاء التفريغ' : 'عرض التفريغ النصّي'}
            </Button>
            {showTranscript && (
              <p className="mt-2 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
                {call.transcription_text}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* ===================== الارتباطات ===================== */

function RelationsTab({
  contactId,
  active,
}: {
  contactId: string
  active: boolean
}) {
  const [, navigate] = useLocation()
  const { data, isLoading } = useContactRelations(contactId, active)

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    )
  }

  if (!data) return null

  const empty =
    data.cases.length === 0 &&
    data.services.length === 0 &&
    data.appointments.length === 0 &&
    data.requests.length === 0 &&
    data.properties.length === 0

  if (empty) {
    return (
      <div className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
        لا توجد ارتباطات عمل لهذه الجهة.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <RelGroup icon={Scale} title="القضايا" count={data.cases.length}>
        {data.cases.map((x) => (
          <RelRow
            key={x.id}
            title={x.title || x.office_num || x.court_num || 'قضية'}
            meta={x.status}
          />
        ))}
      </RelGroup>

      <RelGroup icon={FileText} title="الاستشارات والخدمات" count={data.services.length}>
        {data.services.map((x) => (
          <RelRow
            key={x.id}
            title={x.title || x.type || 'خدمة'}
            meta={[x.type, x.service_date ? fmtDate(x.service_date) : null, x.status]
              .filter(Boolean)
              .join(' · ')}
          />
        ))}
      </RelGroup>

      <RelGroup icon={CalendarDays} title="المواعيد" count={data.appointments.length}>
        {data.appointments.map((x) => (
          <RelRow
            key={x.id}
            title={fmtDate(x.appointment_date)}
            meta={[x.appointment_time, x.status].filter(Boolean).join(' · ')}
          />
        ))}
      </RelGroup>

      <RelGroup icon={Inbox} title="الطلبات الواردة" count={data.requests.length}>
        {data.requests.map((x) => (
          <RelRow
            key={x.id}
            title={`طلب — ${x.request_type ?? ''}`}
            meta={[x.status, x.received_at ? fmtDate(x.received_at) : null]
              .filter(Boolean)
              .join(' · ')}
            onClick={() => navigate(`/requests/${x.id}`)}
          />
        ))}
      </RelGroup>

      <RelGroup icon={Building2} title="الإفراغات العقارية" count={data.properties.length}>
        {data.properties.map((x) => {
          const role = x.seller_id === contactId ? 'بائع' : 'مشترٍ'
          return (
            <RelRow
              key={x.id}
              title={[x.property_type || 'عقار', x.deed_number ? `صك ${x.deed_number}` : null]
                .filter(Boolean)
                .join(' — ')}
              meta={[role, x.status, x.transfer_date ? fmtDate(x.transfer_date) : null]
                .filter(Boolean)
                .join(' · ')}
            />
          )
        })}
      </RelGroup>
    </div>
  )
}

function RelGroup({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: typeof Scale
  title: string
  count: number
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Icon className="h-4 w-4 text-gold" />
        <CardTitle className="text-base">
          {title}{' '}
          <span className="text-sm text-muted-foreground">
            ({fmtNumber(count)})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  )
}

function RelRow({
  title,
  meta,
  onClick,
}: {
  title: string
  meta?: string | null
  onClick?: () => void
}) {
  const inner = (
    <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
      <span className="truncate text-sm font-medium text-foreground">
        {title}
      </span>
      {meta && (
        <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
      )}
    </div>
  )
  if (onClick) {
    return (
      <button onClick={onClick} className="block w-full text-right hover:opacity-80">
        {inner}
      </button>
    )
  }
  return inner
}
