import { useMemo, useState } from 'react'
import {
  ShieldAlert,
  ShieldCheck,
  IdCard,
  Search,
  Loader2,
  Info,
  CalendarClock,
  ArrowLeft,
  FileCheck2,
} from 'lucide-react'
import { useLocation } from 'wouter'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
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
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDateTime, fmtDatePref, fmtTime } from '@/lib/format'
import {
  useConflictSearch,
  useSaveConflictCheck,
  useSaveKycCheck,
  useIntakeGates,
  useRequestAppointments,
  CIRCLE_LABELS,
  OUTCOME_LABELS,
  RISK_LABELS,
  RED_FLAGS,
  type ConflictCircle,
  type ConflictMatch,
  type ConflictCoverage,
  type ConflictOutcome,
  type KycInput,
  type RiskLevel,
} from '@/hooks/useIntakeGates'
import type { RequestEvaluation } from '@/types/db'

// بوابتا المرحلة الأولى («الاستقطاب والتحليل الأولي») كما تصفهما الوثيقة.
// تُعرضان تنبيهاً لا منعاً — البوابة التي تمنع بلا مخرج يلتفّ عليها الفريق
// بفتح الملفات خارج النظام، فيُفقد الأثر كله.

export function IntakeGatesCard({
  requestId,
  clientName,
  opponentName,
  evaluations = [],
}: {
  requestId: string
  clientName: string | null
  opponentName: string | null
  evaluations?: RequestEvaluation[]
}) {
  const memo = evaluations[0] ?? null
  const memoApproved = !!memo?.approved_at
  const gates = useIntakeGates(requestId)
  const [conflictOpen, setConflictOpen] = useState(false)
  const [kycOpen, setKycOpen] = useState(false)

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        {gates.canOpenMatter && memoApproved ? (
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
        ) : (
          <ShieldAlert className="h-5 w-5 text-amber-500" />
        )}
        <CardTitle className="text-base">بوابات الاستقطاب</CardTitle>
        {(!gates.canOpenMatter || !memoApproved) && (
          <Badge variant="warning" className="ms-auto">
            ينقص {fmtNumber(gates.missing.length + (memoApproved ? 0 : 1))}
          </Badge>
        )}
      </CardHeader>

      <CardContent className="space-y-2">
        <GateRow
          icon={ShieldCheck}
          title="فحص تعارض المصالح"
          done={!!gates.conflict}
          status={
            gates.conflict
              ? `${OUTCOME_LABELS[gates.conflict.outcome]} · ${gates.conflict.checked_by_name ?? '—'} · ${fmtDateTime(gates.conflict.checked_at)}`
              : 'لم يُجرَ بعد — الوثيقة: لا فتح ملف دون فحص موثّق'
          }
          danger={gates.conflict?.outcome === 'reject'}
          onClick={() => setConflictOpen(true)}
          label={gates.conflict ? 'إعادة الفحص' : 'إجراء الفحص'}
        />

        <GateRow
          icon={IdCard}
          title="العناية الواجبة (KYC)"
          done={!!gates.kyc?.id_verified}
          status={
            gates.kyc
              ? `${gates.kyc.id_verified ? 'الهوية موثّقة' : 'الهوية غير موثّقة'} · مخاطر ${RISK_LABELS[gates.kyc.risk_level]}`
              : 'لم تُستوفَ بعد'
          }
          onClick={() => setKycOpen(true)}
          label={gates.kyc ? 'تعديل' : 'استيفاء'}
        />

        <GateRow
          icon={FileCheck2}
          title="مذكرة التقييم — المحاور الأربعة"
          done={memoApproved}
          status={
            !memo
              ? 'لم تُكتب — الوثيقة: لا يُوقَّع عقد قبلها'
              : memoApproved
                ? `اعتمدها ${memo.approved_by_name ?? 'المدير'} · التوصية: ${memo.recommendation ?? '—'}`
                : `كتبها ${memo.evaluator_name ?? '—'} — بانتظار اعتماد المدير`
          }
          onClick={() =>
            document
              .getElementById('evaluations-section')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
          label={memo ? 'اعرضها' : 'اكتبها'}
        />
      </CardContent>

      <CardContent className="pt-0">
        <PreliminaryMeeting requestId={requestId} clientName={clientName} />
      </CardContent>

      <ConflictDialog
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        requestId={requestId}
        defaultName={opponentName || clientName || ''}
      />
      <KycDialog
        open={kycOpen}
        onOpenChange={setKycOpen}
        requestId={requestId}
        existing={gates.kyc}
      />
    </Card>
  )
}

function GateRow({
  icon: Icon,
  title,
  status,
  done,
  danger,
  onClick,
  label,
}: {
  icon: typeof ShieldCheck
  title: string
  status: string
  done: boolean
  danger?: boolean
  onClick: () => void
  label: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          danger
            ? 'bg-destructive/10 text-destructive'
            : done
              ? 'bg-emerald-500/10 text-emerald-600'
              : 'bg-amber-500/15 text-amber-600'
        )}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{status}</p>
      </div>
      <Button size="sm" variant="outline" onClick={onClick}>
        {label}
      </Button>
    </div>
  )
}

/* ===================== الجلسة التمهيدية ===================== */

// الوثيقة تضعها بنداً في «الاستقطاب» (١٥–٢٠ دقيقة لجمع البيانات لا لإبداء
// الرأي). الربط يجعل ما دار فيها متصلاً بسجل الاستفسار.
function PreliminaryMeeting({
  requestId,
  clientName,
}: {
  requestId: string
  clientName: string | null
}) {
  const [, navigate] = useLocation()
  const { data: appts = [] } = useRequestAppointments(requestId)

  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
          <CalendarClock className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">الجلسة التمهيدية</p>
          <p className="truncate text-xs text-muted-foreground">
            {appts.length === 0
              ? 'لم يُحجز موعد بعد'
              : `${fmtNumber(appts.length)} موعد مرتبط`}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            // النموذج يقرأها فيملأ الاسم ويربط الموعد بالطلب
            try {
              sessionStorage.setItem(
                'appointment:from-request',
                JSON.stringify({ requestId, clientName })
              )
            } catch {
              /* تخزين معطّل — يُملأ يدوياً */
            }
            navigate('/appointments')
          }}
        >
          حجز موعد
        </Button>
      </div>

      {appts.length > 0 && (
        <div className="mt-2 space-y-1">
          {appts.map((a) => (
            <button
              key={a.id}
              onClick={() => navigate(`/appointments/${a.id}`)}
              className="flex w-full items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-right text-xs transition-colors hover:bg-muted"
            >
              <span className="truncate">
                {fmtDatePref(a.appointment_date)}
                {a.appointment_time ? ` · ${fmtTime(a.appointment_time)}` : ''}
                {a.meeting_method === 'remote' ? ' · عن بُعد' : ''}
              </span>
              <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ===================== فحص التعارض ===================== */

function ConflictDialog({
  open,
  onOpenChange,
  requestId,
  defaultName,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  requestId: string
  defaultName: string
}) {
  const [name, setName] = useState(defaultName)
  const [outcome, setOutcome] = useState<ConflictOutcome>('accept')
  const [screenWall, setScreenWall] = useState('')
  const [notes, setNotes] = useState('')
  const search = useConflictSearch()
  const save = useSaveConflictCheck()

  const result = search.data
  const grouped = useMemo(() => {
    const g: Record<ConflictCircle, ConflictMatch[]> = {
      direct: [],
      historical: [],
      structural: [],
    }
    for (const m of result?.matches ?? []) g[m.circle]?.push(m)
    return g
  }, [result])

  const coverage = result?.coverage as ConflictCoverage | undefined
  // صراحة عن حدود الفحص: أسماء الخصوم ناقصة في أغلب الملفات، فنتيجة
  // «لا تطابق» ليست قاطعة — والثقة الزائفة أسوأ من غياب الفحص.
  const weakCoverage =
    !!coverage && coverage.case_parties < coverage.cases * 0.5

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>فحص تعارض المصالح</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>الاسم المراد فحصه (الطرف المقابل غالباً)</Label>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="اسم الخصم أو الجهة المقابلة"
              />
              <Button
                onClick={() => search.mutate(name)}
                disabled={!name.trim() || search.isPending}
              >
                {search.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                افحص
              </Button>
            </div>
          </div>

          {result && (
            <>
              <div className="space-y-3">
                {(Object.keys(CIRCLE_LABELS) as ConflictCircle[]).map((c) => (
                  <div key={c}>
                    <p className="mb-1.5 text-xs font-semibold text-muted-foreground">
                      {CIRCLE_LABELS[c]}
                      <span className="mr-1.5 font-normal">
                        ({fmtNumber(grouped[c].length)})
                      </span>
                    </p>
                    {grouped[c].length === 0 ? (
                      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                        لا تطابق
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {grouped[c].map((m, i) => (
                          <div
                            key={`${c}-${i}`}
                            className="flex items-center justify-between gap-2 rounded-lg border border-amber-400/40 bg-amber-50/60 px-3 py-2 text-sm dark:bg-amber-950/20"
                          >
                            <span className="truncate font-medium">
                              {m.label}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {m.detail}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {coverage && (
                <div className="flex gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <p>
                    فُحص في {fmtNumber(coverage.contacts)} جهة اتصال،{' '}
                    {fmtNumber(coverage.cases)} عنوان ملف،{' '}
                    {fmtNumber(coverage.case_parties)} طرف مسجّل،{' '}
                    {fmtNumber(coverage.team_members)} من الفريق.
                    {weakCoverage && (
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {' '}
                        تنبيه: أسماء الخصوم مسجّلة في أقل من نصف الملفات، فنتيجة
                        «لا تطابق» غير قاطعة.
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>القرار</Label>
                <Select
                  value={outcome}
                  onValueChange={(v) => setOutcome(v as ConflictOutcome)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(OUTCOME_LABELS) as ConflictOutcome[]).map(
                      (o) => (
                        <SelectItem key={o} value={o}>
                          {OUTCOME_LABELS[o]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>

              {outcome === 'conditional' && (
                <div className="space-y-2">
                  <Label>جدار العزل المعلوماتي</Label>
                  <Textarea
                    value={screenWall}
                    onChange={(e) => setScreenWall(e.target.value)}
                    placeholder="من يُمنع من الاطلاع، وكيف عُزل الملف"
                    rows={2}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </div>

              <Button
                className="w-full"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(
                    {
                      requestId,
                      searchedName: name,
                      outcome,
                      matches: result.matches,
                      coverage: result.coverage,
                      screenWall: outcome === 'conditional' ? screenWall : null,
                      notes,
                    },
                    { onSuccess: () => onOpenChange(false) }
                  )
                }
              >
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                توثيق الفحص
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ===================== العناية الواجبة ===================== */

function KycDialog({
  open,
  onOpenChange,
  requestId,
  existing,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  requestId: string
  existing: ReturnType<typeof useIntakeGates>['kyc']
}) {
  const save = useSaveKycCheck()
  const [f, setF] = useState<KycInput>(() => ({
    client_type: existing?.client_type ?? 'individual',
    id_type: existing?.id_type ?? 'هوية وطنية',
    id_number: existing?.id_number ?? '',
    id_verified: existing?.id_verified ?? false,
    id_doc_url: null,
    capacity: existing?.capacity ?? 'principal',
    cr_number: existing?.cr_number ?? '',
    authorization_doc_url: null,
    ubo_name: existing?.ubo_name ?? '',
    ubo_id_number: existing?.ubo_id_number ?? '',
    risk_level: existing?.risk_level ?? 'low',
    edd_required: existing?.edd_required ?? false,
    edd_notes: existing?.edd_notes ?? '',
    red_flags: existing?.red_flags ?? [],
    notes: existing?.notes ?? '',
    contact_id: null,
  }))

  const set = <K extends keyof KycInput>(k: K, v: KycInput[K]) =>
    setF((p) => ({ ...p, [k]: v }))

  const toggleFlag = (flag: string) =>
    setF((p) => ({
      ...p,
      red_flags: p.red_flags.includes(flag)
        ? p.red_flags.filter((x) => x !== flag)
        : [...p.red_flags, flag],
    }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>العناية الواجبة (KYC/AML)</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>نوع العميل</Label>
              <Select
                value={f.client_type}
                onValueChange={(v) => set('client_type', v as 'individual' | 'company')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="individual">فرد</SelectItem>
                  <SelectItem value="company">شركة / منشأة</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الصفة</Label>
              <Select
                value={f.capacity ?? 'principal'}
                onValueChange={(v) => set('capacity', v as 'principal' | 'agent')}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="principal">أصيل</SelectItem>
                  <SelectItem value="agent">نائب / وكيل</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>نوع الهوية</Label>
              <Input value={f.id_type ?? ''} onChange={(e) => set('id_type', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>رقم الهوية</Label>
              <Input value={f.id_number ?? ''} onChange={(e) => set('id_number', e.target.value)} />
            </div>
            {f.client_type === 'company' && (
              <>
                <div className="space-y-2">
                  <Label>السجل التجاري</Label>
                  <Input value={f.cr_number ?? ''} onChange={(e) => set('cr_number', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>المستفيد الحقيقي (UBO)</Label>
                  <Input value={f.ubo_name ?? ''} onChange={(e) => set('ubo_name', e.target.value)} />
                </div>
              </>
            )}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
            <div>
              <p className="text-sm font-medium">تُحقّق من الهوية والصفة</p>
              <p className="text-xs text-muted-foreground">
                البوابة الثانية: لا عمل جوهري قبل اكتمالها
              </p>
            </div>
            <Switch
              checked={f.id_verified}
              onCheckedChange={(v) => set('id_verified', v)}
            />
          </div>

          <div className="space-y-2">
            <Label>تصنيف المخاطر</Label>
            <Select
              value={f.risk_level}
              onValueChange={(v) => {
                set('risk_level', v as RiskLevel)
                if (v === 'high') set('edd_required', true)
              }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(RISK_LABELS) as RiskLevel[]).map((r) => (
                  <SelectItem key={r} value={r}>{RISK_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>المؤشرات التحذيرية</Label>
            <div className="flex flex-wrap gap-2">
              {RED_FLAGS.map((flag) => {
                const on = f.red_flags.includes(flag)
                return (
                  <button
                    key={flag}
                    type="button"
                    onClick={() => toggleFlag(flag)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs transition-colors',
                      on
                        ? 'border-destructive/40 bg-destructive/10 font-medium text-destructive'
                        : 'border-border/60 text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {flag}
                  </button>
                )
              })}
            </div>
          </div>

          {(f.edd_required || f.risk_level === 'high') && (
            <div className="space-y-2">
              <Label>العناية المعزّزة (EDD)</Label>
              <Textarea
                value={f.edd_notes ?? ''}
                onChange={(e) => set('edd_notes', e.target.value)}
                rows={2}
                placeholder="ما أُجري من تحقق إضافي"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea
              value={f.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
            />
          </div>

          <Button
            className="w-full"
            disabled={save.isPending}
            onClick={() =>
              save.mutate(
                { requestId, existingId: existing?.id, input: f },
                { onSuccess: () => onOpenChange(false) }
              )
            }
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
