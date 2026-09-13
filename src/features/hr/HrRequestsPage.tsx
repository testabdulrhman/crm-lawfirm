// «الإجازات والاستئذان» — الموظف يقدّم طلب إجازة/استئذان/دوام عن بعد ويتابعه،
// والمدير يعتمد أو يرفض من تبويب «طلبات الفريق». (طلب المستخدم 2026-09-02)
import { useMemo, useState } from 'react'
import {
  CalendarOff,
  Check,
  Clock,
  Home,
  Loader2,
  Palmtree,
  Plus,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { EmptyState } from '@/components/EmptyState'
import { QueryErrorState } from '@/components/QueryErrorState'
import { useConfirm } from '@/components/ConfirmDialog'
import { useIsDirector } from '@/hooks/useIsDirector'
import { LeaveBalanceCard } from './LeaveBalanceCard'
import { usePageState } from '@/hooks/usePageState'
import { fmtDatePref, fmtDateTime, fmtNumber, fmtTime, todayISO, daysLabel } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  useHrRequests,
  useCreateHrRequest,
  useCancelHrRequest,
  useDecideHrRequest,
  useLeaveBalance,
  hrDays,
  hrHours,
  hrKindLabel,
  hrStatusLabel,
  HR_KIND_LABELS,
  LEAVE_TYPE_LABELS,
  type HrKind,
  type HrStatus,
} from '@/hooks/useHrRequests'
import type { HrRequest } from '@/types/db'

const KIND_ICON: Record<HrKind, typeof Palmtree> = {
  leave: Palmtree,
  permission: Clock,
  remote: Home,
}

const STATUS_BADGE: Record<HrStatus, 'warning' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  cancelled: 'secondary',
}

export function HrRequestsPage() {
  const isDirector = useIsDirector()
  const [tab, setTab] = usePageState<'mine' | 'team'>('hr:tab', isDirector ? 'team' : 'mine')
  const [newOpen, setNewOpen] = useState(false)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">الإجازات والاستئذان</h2>
        <Button variant="gold" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" />
          طلب جديد
        </Button>
      </div>

      {isDirector ? (
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'mine' | 'team')} dir="rtl">
          <TabsList>
            <TabsTrigger value="team">طلبات الفريق</TabsTrigger>
            <TabsTrigger value="mine">طلباتي</TabsTrigger>
          </TabsList>
          <TabsContent value="team" className="mt-4">
            <RequestsList scope="all" canDecide />
          </TabsContent>
          <TabsContent value="mine" className="mt-4 space-y-4">
            <LeaveBalanceCard />
            <RequestsList scope="mine" />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4">
          <LeaveBalanceCard />
          <RequestsList scope="mine" />
        </div>
      )}

      <NewRequestDialog open={newOpen} onClose={() => setNewOpen(false)} />
    </div>
  )
}

/** قائمة الطلبات — تُستعمل هنا وفي صفحة الموظف (memberId) */
export function RequestsList({
  scope,
  memberId,
  canDecide = false,
  compact = false,
}: {
  scope: 'mine' | 'all'
  memberId?: string | null
  canDecide?: boolean
  compact?: boolean
}) {
  const q = useHrRequests({ scope, memberId })
  const [filter, setFilter] = usePageState<'pending' | 'all'>(`hr:filter:${scope}`, 'pending')
  const cancelM = useCancelHrRequest()
  const decideM = useDecideHrRequest()
  const { confirm, dialog } = useConfirm()
  const [rejecting, setRejecting] = useState<HrRequest | null>(null)

  const rows = q.data ?? []
  const pending = useMemo(() => rows.filter((r) => r.status === 'pending'), [rows])
  const shown = filter === 'pending' && !compact ? pending : rows

  if (q.isError) return <QueryErrorState error={q.error} onRetry={() => q.refetch()} />
  if (q.isLoading)
    return (
      <div className="space-y-2">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    )

  return (
    <div className="space-y-3">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={filter === 'pending'} onClick={() => setFilter('pending')}>
            بانتظار الاعتماد {pending.length > 0 && `(${fmtNumber(pending.length)})`}
          </FilterChip>
          <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
            الكل {rows.length > 0 && `(${fmtNumber(rows.length)})`}
          </FilterChip>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title={scope === 'mine' ? 'لا طلبات بعد' : 'لا طلبات من الفريق'}
          description={scope === 'mine' ? 'قدّم طلب إجازة أو استئذان أو دوام عن بعد من الزر أعلاه' : undefined}
        />
      ) : shown.length === 0 ? (
        <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
          لا طلبات معلّقة — كل الطلبات بُتّ فيها
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((r) => (
            <RequestCard
              key={r.id}
              r={r}
              showMember={scope === 'all' && !memberId}
              onCancel={
                scope === 'mine' && r.status === 'pending'
                  ? () =>
                      confirm({
                        title: 'إلغاء الطلب؟',
                        description: 'يمكنك تقديم طلب جديد لاحقاً.',
                        confirmLabel: 'إلغاء الطلب',
                        onConfirm: () => cancelM.mutate(r.id),
                      })
                  : undefined
              }
              onApprove={canDecide && r.status === 'pending' ? () => decideM.mutate({ id: r.id, status: 'approved' }) : undefined}
              onReject={canDecide && r.status === 'pending' ? () => setRejecting(r) : undefined}
              busy={decideM.isPending || cancelM.isPending}
            />
          ))}
        </div>
      )}

      {dialog}
      <RejectDialog
        r={rejecting}
        onClose={() => setRejecting(null)}
        onReject={(note) => {
          if (rejecting) decideM.mutate({ id: rejecting.id, status: 'rejected', note })
          setRejecting(null)
        }}
      />
    </div>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-sm transition-colors',
        active ? 'bg-navy text-white' : 'bg-muted text-foreground/70 hover:bg-muted/70'
      )}
    >
      {children}
    </button>
  )
}

function whenText(r: HrRequest): string {
  if (r.kind === 'permission') {
    const h = hrHours(r)
    return `${fmtDatePref(r.start_date)}${r.from_time && r.to_time ? ` · ${fmtTime(r.from_time)} – ${fmtTime(r.to_time)}` : ''}${h ? ` (${fmtNumber(h)} ساعة)` : ''}`
  }
  const d = hrDays(r)
  return r.start_date === r.end_date
    ? `${fmtDatePref(r.start_date)} (يوم واحد)`
    : `${fmtDatePref(r.start_date)} → ${fmtDatePref(r.end_date)} (${daysLabel(d)})`
}

function RequestCard({
  r,
  showMember,
  onCancel,
  onApprove,
  onReject,
  busy,
}: {
  r: HrRequest
  showMember: boolean
  onCancel?: () => void
  onApprove?: () => void
  onReject?: () => void
  busy: boolean
}) {
  const Icon = KIND_ICON[r.kind as HrKind] ?? CalendarOff
  return (
    <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/10">
            <Icon className="h-[18px] w-[18px] text-gold" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-foreground">
              {hrKindLabel(r.kind)}
              {r.kind === 'leave' && r.leave_type && (
                <span className="text-muted-foreground"> · {LEAVE_TYPE_LABELS[r.leave_type] ?? r.leave_type}</span>
              )}
              {showMember && r.member && (
                <span className="text-muted-foreground"> — {r.member.short_name || r.member.name}</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">{whenText(r)}</p>
            {r.reason && <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/85">{r.reason}</p>}
            {r.status !== 'pending' && (
              <p className="mt-1 text-xs text-muted-foreground">
                {r.status === 'cancelled' ? 'أُلغي' : r.status === 'approved' ? 'اعتمده' : 'رفضه'}
                {r.decider && r.status !== 'cancelled' ? ` ${r.decider.short_name || r.decider.name}` : ''}
                {r.decided_at ? ` · ${fmtDateTime(r.decided_at)}` : ''}
                {r.decision_note ? ` — ${r.decision_note}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge variant={STATUS_BADGE[r.status as HrStatus] ?? 'secondary'}>{hrStatusLabel(r.status)}</Badge>
          <span className="text-xs text-muted-foreground">{fmtDateTime(r.created_at)}</span>
        </div>
      </div>
      {(onCancel || onApprove || onReject) && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
          {onApprove && (
            <Button size="sm" variant="gold" onClick={onApprove} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              اعتماد
            </Button>
          )}
          {onReject && (
            <Button size="sm" variant="outline" onClick={onReject} disabled={busy}>
              <X className="h-4 w-4" />
              رفض
            </Button>
          )}
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
              إلغاء الطلب
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function RejectDialog({ r, onClose, onReject }: { r: HrRequest | null; onClose: () => void; onReject: (note: string) => void }) {
  const [note, setNote] = useState('')
  return (
    <Dialog open={!!r} onOpenChange={(o) => { if (!o) { setNote(''); onClose() } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>رفض الطلب</DialogTitle>
          <DialogDescription>
            {r ? `${hrKindLabel(r.kind)} — ${r.member?.short_name || r.member?.name || ''}` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="rj_note">سبب الرفض (يصل للموظف)</Label>
          <Textarea id="rj_note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="destructive" onClick={() => { onReject(note); setNote('') }}>رفض</Button>
          <Button variant="outline" onClick={() => { setNote(''); onClose() }}>تراجع</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function NewRequestDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const createM = useCreateHrRequest()
  const [kind, setKind] = useState<HrKind>('leave')
  const [leaveType, setLeaveType] = useState('annual')
  const [start, setStart] = useState(todayISO())
  const [end, setEnd] = useState(todayISO())
  const [fromTime, setFromTime] = useState('09:00')
  const [toTime, setToTime] = useState('11:00')
  const [reason, setReason] = useState('')

  const reset = () => {
    setKind('leave'); setLeaveType('annual'); setStart(todayISO()); setEnd(todayISO())
    setFromTime('09:00'); setToTime('11:00'); setReason('')
  }

  const valid =
    !!start &&
    (kind === 'permission' ? !!fromTime && !!toTime && toTime > fromTime : !!end && end >= start)

  // رصيد الإجازة السنوية قبل التقديم — تنبيه لا منع: القرار للمدير
  const { data: bal } = useLeaveBalance(null, open)
  const reqDays = start && end && end >= start ? hrDays({ start_date: start, end_date: end }) : 0
  // المعلّق محجوز من الرصيد: المتاح لهذا الطلب = المتبقي − قيد الاعتماد
  const pend = bal?.pending ?? 0
  const balanceHint =
    kind === 'leave' && leaveType === 'annual' && bal?.remaining != null && !bal.missing_join_date && reqDays > 0
      ? { remaining: bal.remaining, pending: pend, after: bal.remaining - pend - reqDays }
      : null

  const submit = async () => {
    if (!valid) return
    await createM.mutateAsync({
      kind,
      leave_type: kind === 'leave' ? leaveType : null,
      start_date: start,
      end_date: kind === 'permission' ? start : end,
      from_time: kind === 'permission' ? fromTime : null,
      to_time: kind === 'permission' ? toTime : null,
      reason: reason.trim() || null,
    })
    reset()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !createM.isPending) { reset(); onClose() } }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>طلب جديد</DialogTitle>
          <DialogDescription>يصل الطلب للمدير إشعاراً، ويصلك إشعار بقراره.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(HR_KIND_LABELS) as HrKind[]).map((k) => {
              const Icon = KIND_ICON[k]
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm transition-colors',
                    kind === k ? 'border-gold bg-gold/10 font-semibold text-foreground' : 'border-border text-foreground/70 hover:bg-muted'
                  )}
                >
                  <Icon className={cn('h-5 w-5', kind === k ? 'text-gold' : 'text-muted-foreground')} />
                  {HR_KIND_LABELS[k]}
                </button>
              )
            })}
          </div>

          {kind === 'leave' && (
            <div className="space-y-1.5">
              <Label>نوع الإجازة</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_LABELS).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {kind === 'permission' ? (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hr_date">اليوم</Label>
                <Input id="hr_date" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr_from">من</Label>
                <Input id="hr_from" type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr_to">إلى</Label>
                <Input id="hr_to" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hr_start">من تاريخ</Label>
                <Input id="hr_start" type="date" value={start} onChange={(e) => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value) }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="hr_end">إلى تاريخ</Label>
                <Input id="hr_end" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
              </div>
              {start && end && end >= start && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  المدة: {daysLabel(hrDays({ start_date: start, end_date: end }))}
                </p>
              )}
              {balanceHint && (
                <p className={cn('col-span-2 text-xs', balanceHint.after < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                  {`رصيدك ${fmtNumber(balanceHint.remaining)}${balanceHint.pending > 0 ? ` (${fmtNumber(balanceHint.pending)} منها قيد الاعتماد)` : ''} — `}
                  {balanceHint.after < 0
                    ? `هذا الطلب يتجاوزه بـ${daysLabel(-balanceHint.after)}، والقرار للمدير`
                    : `يبقى بعد هذا الطلب ${fmtNumber(balanceHint.after)}`}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="hr_reason">السبب (اختياري)</Label>
            <Textarea id="hr_reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="gold" onClick={submit} disabled={!valid || createM.isPending}>
            {createM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            تقديم الطلب
          </Button>
          <Button variant="outline" onClick={() => { reset(); onClose() }} disabled={createM.isPending}>إلغاء</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
