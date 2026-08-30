import { useState } from 'react'
import { useLocation } from 'wouter'
import {
  ArrowRight,
  Phone,
  CalendarDays,
  UserCog,
  Paperclip,
  Upload,
  ExternalLink,
  Trash2,
  Pencil,
  Plus,
  FileText,
  Check,
  X,
  Clock,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Handshake,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { IntakeGatesCard } from './IntakeGates'
import { RequestRail } from './RequestRail'
import { Ltr } from '@/components/Ltr'
import { cn } from '@/lib/utils'
import { useIntakeGates } from '@/hooks/useIntakeGates'
import { useApproveEvaluation } from '@/hooks/useRequests'
import { RISK_LEVELS } from './EvaluationForm'
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
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
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
import { QueryErrorState } from '@/components/QueryErrorState'
import { useConfirm } from '@/components/ConfirmDialog'

import { fmtDatePref, fmtNumber, todayISO, daysLabel, fmtCurrency } from '@/lib/format'
import { pickFile } from '@/lib/files'
import { openExternal } from '@/lib/external'
import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useTeamMembers } from '@/hooks/useTeam'
import { useCreateCase } from '@/hooks/useCases'
import {
  useRequest,
  useAssignRequest,
  useDecideRequest,
  useAddRequestDocument,
  useDeleteRequestDocument,
  useDeleteEvaluation,
} from '@/hooks/useRequests'
import { EvaluationForm } from './EvaluationForm'
import { statusBadgeVariant, statusLabel, typeLabel, CAPACITY_LABELS, criticalKindLabel } from './labels'
import type {
  IncomingRequest,
  RequestDocument,
  RequestEvaluation,
} from '@/types/db'

export function RequestDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { data, isLoading, isError, error, refetch } = useRequest(id)
  const railGates = useIntakeGates(id)

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return (
      <QueryErrorState
        title="تعذّر تحميل الطلب"
        error={error}
        onRetry={() => refetch()}
        backTo="/requests"
        backLabel="رجوع للطلبات"
      />
    )
  }

  const { request: r, evaluations, documents } = data

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" onClick={() => navigate('/requests')}>
        <ArrowRight className="h-4 w-4" />
        رجوع للطلبات
      </Button>

      {/* الرأس */}
      <Card id="request-head">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-foreground">
                {r.client_name}
              </h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {r.client_phone && (
                  <span dir="ltr" className="flex items-center gap-1">
                    <Phone className="h-3.5 w-3.5" />
                    {r.client_phone}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {fmtDatePref(r.received_at)}
                </span>
              </div>
              {/* بيانات الجلسة التمهيدية — بند ٢ */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {r.capacity && (
                  <Badge variant="secondary">
                    {CAPACITY_LABELS[r.capacity]}
                  </Badge>
                )}
                {r.opponent_name && (
                  <Badge variant="outline">ضد: {r.opponent_name}</Badge>
                )}
                {r.court_name && (
                  <Badge variant="outline">{r.court_name}</Badge>
                )}
                {r.claim_number && (
                  <Badge variant="outline">
                    دعوى <Ltr>{r.claim_number}</Ltr>
                  </Badge>
                )}
                {r.prior_lawyer && (
                  <Badge variant="warning">محامٍ سابق: {r.prior_lawyer}</Badge>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {r.ref_no && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">
                  {r.ref_no}
                </span>
              )}
              <Badge variant={statusBadgeVariant(r.status)}>
                {statusLabel(r.status)}
              </Badge>
              <Badge variant="outline">{typeLabel(r.request_type)}</Badge>
            </div>
          </div>
          {r.created_by && (
            <p className="text-xs text-muted-foreground">
              أنشأه: {r.created_by}
            </p>
          )}
        </CardContent>
      </Card>

      {/* شريط المسار الموجّه — بوصلة الدورة، لا قفل (اختيار المستخدم 2026-08-30) */}
      <RequestRail request={r} gates={railGates} evaluations={evaluations} />

      <CriticalDateStrip request={r} />

      {/* بوابات الاستقطاب — تسبق القرار في ترتيب الوثيقة */}
      <div id="intake-gates">
      <IntakeGatesCard
        requestId={r.id}
        clientName={r.client_name}
        opponentName={r.opponent_name ?? null}
        evaluations={evaluations}
      />
      </div>

      {/* ستة فتح الملف — المرحلة الثالثة: العقد والوكالة والدفعة */}
      <div id="onboarding-card">
        <OnboardingGateCard request={r} />
      </div>

      {/* الإسناد + القرار */}
      <div className="grid gap-4 md:grid-cols-2">
        <AssignmentCard requestId={r.id} currentName={r.assigned_to_name} />
        <div id="decision-card"><DecisionCard request={r} evaluations={evaluations} gates={railGates} /></div>
      </div>

      {/* الوصف */}
      {r.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">الوصف</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {r.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* التقييمات */}
      <div id="evaluations-section">
        <EvaluationsSection requestId={r.id} evaluations={evaluations} />
      </div>

      {/* المرفقات */}
      <DocumentsSection requestId={r.id} documents={documents} />
    </div>
  )
}

/* ===================== ستة فتح الملف ===================== */

// الوثيقة: «لا يُعد الملف مفتوحاً إلا باستكمال: اعتماد التعارض + KYC +
// قرار القبول + توقيع العقد + إصدار الوكالة + تحصيل الدفعة المقدمة».
// الثلاثة الأولى في بوابات الاستقطاب أعلاه — وهذه الثلاثة الباقية.
function OnboardingGateCard({ request: r }: { request: IncomingRequest }) {
  const updateM = useUpdateRequest()
  const [poaRef, setPoaRef] = useState(r.poa_ref ?? '')
  const [amount, setAmount] = useState(
    r.advance_amount != null ? String(r.advance_amount) : ''
  )
  const set = (input: Partial<IncomingRequestInput>) =>
    updateM.mutate({ id: r.id, input })

  const doneCount =
    (r.contract_signed_at ? 1 : 0) +
    (r.poa_ref ? 1 : 0) +
    (r.advance_received_at ? 1 : 0)

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Handshake className="h-5 w-5 text-gold" />
        <CardTitle className="text-base">العقد والوكالة والدفعة</CardTitle>
        <Badge
          variant={doneCount === 3 ? 'success' : 'warning'}
          className="ms-auto"
        >
          {fmtNumber(doneCount)} من 3
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* عقد الأتعاب */}
        <div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">عقد الأتعاب</p>
            <p className="text-xs text-muted-foreground">
              {r.contract_signed_at
                ? `وُقّع ${fmtDatePref(r.contract_signed_at)}`
                : 'لم يُوقَّع — نطاق العمل بالدرجة القضائية أهم بنوده'}
            </p>
          </div>
          {r.contract_signed_at ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => set({ contract_signed_at: null })}
            >
              تراجع
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={updateM.isPending}
              onClick={() => set({ contract_signed_at: todayISO() })}
            >
              وُقّع اليوم
            </Button>
          )}
        </div>

        {/* الوكالة */}
        <div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">الوكالة الشرعية</p>
            <p className="text-xs text-muted-foreground">
              {r.poa_ref ? (
                <>
                  رقمها <Ltr>{r.poa_ref}</Ltr> — العقد لا يغني عنها والعكس صحيح
                </>
              ) : (
                'تصدر عبر ناجز — لا تنسَ بند الإنابة وتاريخ الانتهاء'
              )}
            </p>
          </div>
          {r.poa_ref ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => set({ poa_ref: null })}
            >
              تراجع
            </Button>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5">
              <Input
                value={poaRef}
                onChange={(e) => setPoaRef(e.target.value)}
                placeholder="رقم الوكالة"
                dir="ltr"
                className="h-9 w-32 text-left text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!poaRef.trim() || updateM.isPending}
                onClick={() => set({ poa_ref: poaRef.trim() })}
              >
                حفظ
              </Button>
            </span>
          )}
        </div>

        {/* الدفعة المقدمة */}
        <div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">الدفعة المقدمة</p>
            <p className="text-xs text-muted-foreground">
              {r.advance_received_at ? (
                <>
                  حُصّلت {fmtDatePref(r.advance_received_at)}
                  {r.advance_amount != null && (
                    <> — {fmtCurrency(r.advance_amount)}</>
                  )}
                </>
              ) : (
                'لا عمل جوهرياً قبل تحصيلها — نص الوثيقة'
              )}
            </p>
          </div>
          {r.advance_received_at ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                set({ advance_received_at: null, advance_amount: null })
              }
            >
              تراجع
            </Button>
          ) : (
            <span className="flex shrink-0 items-center gap-1.5">
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                placeholder="المبلغ"
                dir="ltr"
                inputMode="decimal"
                className="h-9 w-24 text-left text-sm"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={updateM.isPending}
                onClick={() =>
                  set({
                    advance_received_at: todayISO(),
                    advance_amount: amount ? Number(amount) : null,
                  })
                }
              >
                حُصّلت
              </Button>
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ===================== التاريخ الحرج ===================== */

// الوثيقة: «التواريخ الحرجة تُفرز فوراً كحالة عاجلة» — فلا تُدفن في التفاصيل.
// أحمر إذا بقي ≤ 7 أيام أو فات، كهرماني قبل ذلك.
function CriticalDateStrip({ request: r }: { request: IncomingRequest }) {
  if (!r.critical_date || r.status === 'rejected') return null
  const days = (() => {
    const d = new Date(r.critical_date)
    if (isNaN(d.getTime())) return null
    d.setHours(0, 0, 0, 0)
    const now = new Date()
    now.setHours(0, 0, 0, 0)
    return Math.round((d.getTime() - now.getTime()) / 86400000)
  })()
  const late = days != null && days < 0
  const soon = days != null && days <= 7
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-medium',
        late || soon
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-400/50 bg-amber-50/70 text-amber-800 dark:bg-amber-950/25 dark:text-amber-300'
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>
        {criticalKindLabel(r.critical_date_kind)} — {fmtDatePref(r.critical_date)}
        {days != null && (
          <b className="me-1">
            {' '}
            ·{' '}
            {late
              ? `فات منذ ${daysLabel(-days)}`
              : days === 0
                ? 'اليوم'
                : `بعد ${daysLabel(days)}`}
          </b>
        )}
      </span>
      <span className="ms-auto text-xs font-normal opacity-80">
        فوات هذا التاريخ سقوط حق لا تأخير
      </span>
    </div>
  )
}

/* ===================== الإسناد ===================== */

function AssignmentCard({
  requestId,
  currentName,
}: {
  requestId: string
  currentName: string | null
}) {
  const { data: members } = useTeamMembers()
  const assignM = useAssignRequest()
  const [value, setValue] = useState<string>('')

  const active = (members ?? []).filter((m) => m.is_active)

  const onAssign = (memberId: string) => {
    setValue(memberId)
    const m = active.find((x) => x.id === memberId)
    if (m) {
      assignM.mutate({
        id: requestId,
        assignedToId: m.id,
        assignedToName: m.name,
      })
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <UserCog className="h-4 w-4 text-gold" />
        <CardTitle className="text-base">المحامي المسؤول</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm">
          {currentName ? (
            <span className="font-medium text-foreground">{currentName}</span>
          ) : (
            <span className="text-muted-foreground">غير مُسند</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <Select value={value} onValueChange={onAssign} disabled={assignM.isPending}>
            <SelectTrigger>
              <SelectValue placeholder={currentName ? 'تغيير المحامي' : 'إسناد محامٍ'} />
            </SelectTrigger>
            <SelectContent>
              {active.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {assignM.isPending && (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ===================== القرار ===================== */

function DecisionCard({
  request: r,
  evaluations = [],
  gates,
}: {
  request: IncomingRequest
  evaluations?: RequestEvaluation[]
  gates?: GateState
}) {
  const memoApproved = evaluations.some((e) => e.approved_at)
  const updateReqM = useUpdateRequest()
  const [bypassOpen, setBypassOpen] = useState(false)
  const [bypassWhy, setBypassWhy] = useState('')

  // ستة فتح الملف — نص الوثيقة حرفياً
  const six: [string, boolean][] = [
    ['فحص التعارض', !!gates?.conflict && gates.conflict.outcome !== 'reject'],
    ['العناية الواجبة', !!gates?.kyc?.id_verified],
    ['قرار القبول', r.status === 'accepted'],
    ['عقد الأتعاب', !!r.contract_signed_at],
    ['الوكالة', !!r.poa_ref],
    ['الدفعة المقدمة', !!r.advance_received_at],
  ]
  const missingSix = six.filter(([, ok]) => !ok).map(([n]) => n)
  const requestId = r.id
  const { status, decision_at: decisionAt, decision_by: decisionBy } = r
  const rejectionReason = r.rejection_reason
  const [, navigate] = useLocation()
  const { teamMember } = useAuth()
  const decideM = useDecideRequest()
  const createCaseM = useCreateCase()
  const { confirm, dialog } = useConfirm()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  const decide = (
    s: 'accepted' | 'rejected' | 'deferred',
    rejReason?: string
  ) => {
    decideM.mutate({
      id: requestId,
      status: s,
      decisionBy: teamMember?.name ?? '—',
      rejectionReason: rejReason,
    })
  }

  const pendingStatus = decideM.isPending ? decideM.variables?.status : null

  const reallyConvert = (bypassReason?: string) => {
    createCaseM
      .mutateAsync({
        title: r.client_name,
        contact_id: r.client_id ?? null,
        subject: r.description ?? null,
        open_date: todayISO(),
      })
      .then(async (c) => {
        // التحويل يسجّل نفسه — كان ينشئ القضية ويترك الطلب بلا أثر
        await updateReqM.mutateAsync({
          id: r.id,
          input: {
            converted_to_type: 'case',
            converted_to_id: c.id,
            converted_at: new Date().toISOString(),
            ...(bypassReason
              ? { conversion_bypass_reason: bypassReason }
              : {}),
          },
        })
        navigate(`/cases/${c.id}`)
      })
      .catch(() => {
        /* الفشل يعرضه onError عبر toast */
      })
  }

  const convertToCase = () => {
    if (missingSix.length > 0) {
      // الوثيقة: لا يُعد الملف مفتوحاً إلا باكتمال الستة — تجاوزٌ يشهد
      setBypassWhy('')
      setBypassOpen(true)
      return
    }
    confirm({
      title: 'فتح الملف',
      description: `الستة مكتملة — ستُنشأ قضية باسم «${r.client_name}» وتُنقل لصفحتها.`,
      confirmLabel: 'افتح الملف',
      destructive: false,
      onConfirm: () => reallyConvert(),
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">القرار</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && status !== 'under_review' && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            <p>
              الحالة الحالية:{' '}
              <Badge variant={statusBadgeVariant(status)}>
                {statusLabel(status)}
              </Badge>
            </p>
            {decisionAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                بتاريخ {fmtDatePref(decisionAt)}
                {decisionBy ? ` · بواسطة ${decisionBy}` : ''}
              </p>
            )}
            {rejectionReason && (
              <p className="mt-1 text-xs text-destructive">
                سبب الرفض: {rejectionReason}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={decideM.isPending}
            onClick={() =>
              confirm({
                title: memoApproved
                  ? 'قبول الطلب'
                  : 'قبول قبل اعتماد المذكرة',
                description: memoApproved
                  ? `سيُسجَّل قبول طلب «${r.client_name}» رسمياً باسمك.`
                  : `الوثيقة: لا يُوقَّع عقد قبل مذكرة تقييم معتمدة — ولا مذكرة معتمدة لهذا الطلب بعد. القبول سيُسجَّل باسمك على مسؤوليتك.`,
                confirmLabel: memoApproved ? 'قبول' : 'أكمل على مسؤوليتي',
                destructive: false,
                onConfirm: () => decide('accepted'),
              })
            }
          >
            {pendingStatus === 'accepted' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            قبول
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={decideM.isPending}
            onClick={() => setRejectOpen(true)}
          >
            {pendingStatus === 'rejected' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            رفض
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={decideM.isPending}
            onClick={() => decide('deferred')}
          >
            {pendingStatus === 'deferred' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
            تأجيل
          </Button>
        </div>

        {/* تحويل الطلب لقضية مرتبطة بنفس العميل */}
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={createCaseM.isPending}
          onClick={convertToCase}
        >
          {createCaseM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          تحويل لقضية
        </Button>
      </CardContent>

      {dialog}

      {/* بوابة الستة: التجاوز يشهد */}
      <Dialog open={bypassOpen} onOpenChange={setBypassOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>فتح الملف قبل اكتمال الستة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            الوثيقة: «لا يُعد الملف مفتوحاً إلا باستكمال الستة». الناقص:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {missingSix.map((n) => (
              <Badge key={n} variant="warning">
                ○ {n}
              </Badge>
            ))}
          </div>
          <Textarea
            value={bypassWhy}
            onChange={(e) => setBypassWhy(e.target.value)}
            rows={2}
            placeholder="ليش تفتحه الآن؟ — يُسجَّل بنصّك على الطلب"
          />
          <div className="flex justify-start gap-2">
            <Button
              variant="gold"
              disabled={!bypassWhy.trim() || createCaseM.isPending}
              onClick={() => {
                setBypassOpen(false)
                reallyConvert(bypassWhy.trim())
              }}
            >
              أكمل على مسؤوليتي
            </Button>
            <Button variant="ghost" onClick={() => setBypassOpen(false)}>
              إلغاء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* نافذة سبب الرفض */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>سبب الرفض</DialogTitle>
          </DialogHeader>
          <div className="my-3 space-y-1.5">
            <Label htmlFor="reason">اذكر سبب رفض الطلب</Label>
            <Textarea
              id="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="destructive"
              disabled={decideM.isPending || reason.trim() === ''}
              onClick={() => {
                decide('rejected', reason.trim())
                setRejectOpen(false)
                setReason('')
              }}
            >
              {pendingStatus === 'rejected' && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              تأكيد الرفض
            </Button>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/* ===================== التقييمات ===================== */

/** لون شارة التوصية حسب مضمونها — «رفض» لا يصح أن يظهر بلون احتفالي */
function recommendationBadgeVariant(
  rec: string
): 'success' | 'destructive' | 'warning' | 'gold' {
  if (rec === 'قبول') return 'success'
  if (rec === 'رفض') return 'destructive'
  if (rec === 'قبول مشروط') return 'warning'
  if (rec === 'بحاجة لمعلومات') return 'warning'
  return 'gold'
}

const AXIS_LABELS: [keyof RequestEvaluation, string][] = [
  ['axis_procedural', 'إجرائي'],
  ['axis_merits', 'موضوعي'],
  ['axis_evidence', 'إثباتي'],
  ['axis_financial', 'مالي وتنفيذي'],
]

function EvaluationsSection({
  requestId,
  evaluations,
}: {
  requestId: string
  evaluations: RequestEvaluation[]
}) {
  const deleteM = useDeleteEvaluation()
  const approveM = useApproveEvaluation()
  const isDirector = useIsDirector()
  const { confirm, dialog } = useConfirm()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<RequestEvaluation | null>(null)

  const openNew = () => {
    setEditing(null)
    setOpen(true)
  }
  const openEdit = (e: RequestEvaluation) => {
    setEditing(e)
    setOpen(true)
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="text-base">
          التقييمات{' '}
          <span className="text-sm text-muted-foreground">
            ({fmtNumber(evaluations.length)})
          </span>
        </CardTitle>
        <Button size="sm" variant="gold" onClick={openNew}>
          <Plus className="h-4 w-4" />
          مذكرة تقييم
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {evaluations.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            لا مذكرة بعد — والوثيقة: لا يُوقَّع عقد قبلها.
          </p>
        ) : (
          evaluations.map((e) => (
            <div key={e.id} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">
                    {e.evaluator_name ?? 'مقيّم'}
                  </span>
                  {e.recommendation && (
                    <Badge variant={recommendationBadgeVariant(e.recommendation)}>
                      {e.recommendation}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">
                    {fmtDatePref(e.created_at)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9"
                    title="تعديل"
                    aria-label="تعديل التقييم"
                    onClick={() => openEdit(e)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    title="حذف"
                    aria-label="حذف التقييم"
                    onClick={() =>
                      confirm({
                        title: 'تأكيد حذف التقييم',
                        description: `سيُحذف تقييم «${e.evaluator_name ?? 'مقيّم'}» نهائياً. هل أنت متأكد؟`,
                        onConfirm: () => deleteM.mutate(e.id),
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {e.summary && <p className="mt-2 text-sm">{e.summary}</p>}
              <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                {e.strengths && (
                  <p className="text-emerald-700 dark:text-emerald-300">
                    <span className="font-medium">قوة: </span>
                    {e.strengths}
                  </p>
                )}
                {e.weaknesses && (
                  <p className="text-destructive">
                    <span className="font-medium">ضعف: </span>
                    {e.weaknesses}
                  </p>
                )}
              </div>
              {/* المحاور الأربعة — نصّ الوثيقة */}
              <div className="mt-2 space-y-1.5 text-sm">
                {AXIS_LABELS.map(([k, label]) =>
                  e[k] ? (
                    <p key={k} className="leading-relaxed">
                      <span className="font-semibold text-foreground">
                        {label}:{' '}
                      </span>
                      <span className="text-muted-foreground">
                        {String(e[k])}
                      </span>
                    </p>
                  ) : null
                )}
                {e.risk_level && (
                  <Badge
                    variant={
                      e.risk_level === 'high'
                        ? 'destructive'
                        : e.risk_level === 'medium'
                          ? 'warning'
                          : 'success'
                    }
                  >
                    مخاطر{' '}
                    {RISK_LEVELS.find((r) => r.value === e.risk_level)?.label}
                  </Badge>
                )}
              </div>
              {/* اعتماد الشريك — بوابة «لا عرض أتعاب من محامٍ منفرداً» */}
              <div className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                {e.approved_at ? (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    اعتمدها {e.approved_by_name ?? 'المدير'} ·{' '}
                    {fmtDatePref(e.approved_at)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    بانتظار اعتماد المدير
                  </span>
                )}
                {!e.approved_at && isDirector && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={approveM.isPending}
                    onClick={() => approveM.mutate(e.id)}
                  >
                    اعتمد باسمي
                  </Button>
                )}
              </div>
              {e.notes && (
                <p className="mt-1 text-xs text-muted-foreground">{e.notes}</p>
              )}
            </div>
          ))
        )}
      </CardContent>

      {dialog}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <EvaluationForm
            requestId={requestId}
            evaluation={editing}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </Card>
  )
}

/* ===================== المرفقات ===================== */

function DocumentsSection({
  requestId,
  documents,
}: {
  requestId: string
  documents: RequestDocument[]
}) {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const addM = useAddRequestDocument()
  const deleteM = useDeleteRequestDocument()

  // معاينة
  const [preview, setPreview] = useState<RequestDocument | null>(null)
  // تأكيد الحذف
  const [toDelete, setToDelete] = useState<RequestDocument | null>(null)

  const onUpload = async () => {
    const file = await pickFile()
    if (file) addM.mutate({ requestId, file })
  }

  const confirmDelete = () => {
    if (toDelete) {
      deleteM.mutate({ id: toDelete.id, deletedBy: teamMember?.name ?? null })
      setToDelete(null)
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Paperclip className="h-4 w-4" />
          المرفقات{' '}
          <span className="text-sm text-muted-foreground">
            ({fmtNumber(documents.length)})
          </span>
        </CardTitle>
        <Button
          size="sm"
          variant="gold"
          onClick={onUpload}
          disabled={addM.isPending}
        >
          {addM.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          رفع
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {documents.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            لا توجد مرفقات.
          </p>
        ) : (
          documents.map((d) => (
            <div
              key={d.id}
              className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
            >
              {/* النقر على الاسم يفتح المعاينة داخل النظام */}
              <button
                className="flex min-w-0 items-center gap-2 text-sm hover:text-gold"
                onClick={() => setPreview(d)}
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{d.name ?? 'ملف'}</span>
              </button>
              <div className="flex items-center gap-1">
                {/* فتح في تبويب جديد كخيار ثانوي */}
                {d.file_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    title="فتح في تبويب جديد"
                    onClick={() => openExternal(d.file_url!)}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                )}
                {/* الحذف للمدير فقط */}
                {isDirector && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    title="حذف"
                    onClick={() => setToDelete(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>

      {/* معاينة الملف */}
      <FilePreviewDialog
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
        fileUrl={preview?.file_url ?? null}
        fileName={preview?.name ?? null}
      />

      {/* تأكيد الحذف */}
      <AlertDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد حذف المرفق</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف الملف: «{toDelete?.name ?? 'ملف'}». يمكن استرجاعه لاحقاً
              من قِبل المدير. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
