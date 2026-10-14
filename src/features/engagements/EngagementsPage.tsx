// العقود (اتفاقيات الأتعاب) — قائمة صفوف بنمط النظام الموحّد
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Plus,
  Search,
  Handshake,
  User,
  CalendarDays,
  FileText,
  FileSpreadsheet,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState, FilteredEmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { arNorm } from '@/lib/arabic'
import { fmtNumber, fmtDatePref, todayISO } from '@/lib/format'
import { useAllInstallments, useEngagements } from '@/hooks/useEngagements'
import { useIsDirector } from '@/hooks/useIsDirector'
import { usePageState } from '@/hooks/usePageState'
import { EngagementForm } from './EngagementForm'
import { NewDebtContractDialog } from './NewDebtContractDialog'
import {
  ENG_STATUS_OPTIONS,
  engStatusBadge,
  engStatusLabel,
  engTypeLabel,
  installmentAmount,
  installmentState,
  type InstallmentState,
} from './labels'
import type { Engagement, EngagementInstallment } from '@/types/db'

// ملخص تحصيل العقد للصف: المحصّل من الإجمالي، والدفعة التالية غير المسددة بحالتها
interface Collection {
  total: number
  paid: number
  next: { inst: EngagementInstallment; state: InstallmentState; amount: number | null } | null
}
const STATE_ORDER: InstallmentState[] = ['overdue', 'due', 'waiting', 'upcoming']

export function EngagementsPage() {
  const { data, isLoading, isError, error, refetch } = useEngagements()
  const [, navigate] = useLocation()
  const [search, setSearch] = usePageState('eng:q', '')
  const [status, setStatus] = usePageState<string>('eng:status', 'all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const isDirector = useIsDirector()
  const { data: installments } = useAllInstallments()

  // المال للمدير وحده (RLS) — لغيره تبقى الخريطة فارغة فلا يظهر ملخص ولا شريط
  const { byEng, summary } = useMemo(() => {
    const map = new Map<string, Collection>()
    const sum = { active: 0, dueMonth: 0, overdue: 0, waiting: 0 }
    const feesOf = new Map((data ?? []).map((e) => [e.id, e.fees_total]))
    const monthEnd = todayISO().slice(0, 8) + '31'
    for (const i of installments ?? []) {
      if (!feesOf.has(i.engagement_id)) continue
      const fees = feesOf.get(i.engagement_id) ?? null
      const c = map.get(i.engagement_id) ?? { total: fees ?? 0, paid: 0, next: null }
      const amt = installmentAmount(i, fees)
      if (fees == null) c.total += amt ?? 0
      const st = installmentState(i)
      if (st === 'paid') c.paid += i.paid_amount ?? amt ?? 0
      else {
        if (st === 'overdue') sum.overdue += amt ?? 0
        else if (st === 'due' || (st === 'upcoming' && i.due_date && i.due_date <= monthEnd)) sum.dueMonth += amt ?? 0
        else if (st === 'waiting') sum.waiting += amt ?? 0
        if (!c.next || STATE_ORDER.indexOf(st) < STATE_ORDER.indexOf(c.next.state)) c.next = { inst: i, state: st, amount: amt }
      }
      map.set(i.engagement_id, c)
    }
    sum.active = (data ?? []).filter((e) => e.status === 'signed' || e.status === 'active').length
    return { byEng: map, summary: sum }
  }, [data, installments])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const e of data ?? []) c[e.status] = (c[e.status] ?? 0) + 1
    return c
  }, [data])

  const filtered = useMemo(() => {
    const q = arNorm(search.trim())
    return (data ?? []).filter((e) => {
      if (status !== 'all' && e.status !== status) return false
      if (q) {
        const hay = arNorm(
          [e.title, e.engagement_number, e.client?.name]
            .filter(Boolean)
            .join(' ')
        )
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, search, status])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          العقود (اتفاقيات الأتعاب){' '}
          <span className="text-base font-normal text-muted-foreground">
            ({fmtNumber(data?.length ?? 0)})
          </span>
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setTemplateOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            عقد تحصيل ديون
          </Button>
          <Button variant="gold" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            عقد جديد
          </Button>
        </div>
      </div>

      {/* ملخص التحصيل — للمدير */}
      {isDirector && (installments?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SumTile label="عقود سارية" value={fmtNumber(summary.active)} />
          <SumTile label="مستحق هذا الشهر" value={`${fmtNumber(summary.dueMonth)} ريال`} tone="text-amber-700 dark:text-amber-300" />
          <SumTile label="متأخر" value={`${fmtNumber(summary.overdue)} ريال`} tone={summary.overdue > 0 ? 'text-destructive' : undefined} />
          <SumTile label="ينتظر حدثاً (حكم/صك)" value={`${fmtNumber(summary.waiting)} ريال`} tone="text-sky-700 dark:text-sky-300" />
        </div>
      )}

      {/* البحث */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث برقم العقد أو العنوان أو الموكّل…"
          className="pr-9"
        />
      </div>

      {/* فلاتر الحالة */}
      <div className="flex flex-wrap gap-2">
        <StatusChip
          active={status === 'all'}
          onClick={() => setStatus('all')}
          label="الكل"
          count={counts.all ?? 0}
        />
        {ENG_STATUS_OPTIONS.map((o) => (
          <StatusChip
            key={o.value}
            active={status === o.value}
            onClick={() => setStatus(o.value)}
            label={o.label}
            count={counts[o.value] ?? 0}
          />
        ))}
      </div>

      {isLoading ? (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-none" />
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState
          title="تعذّر تحميل العقود"
          error={error}
          onRetry={() => refetch()}
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="لا عقود بعد"
          description="أضِف أول اتفاقية أتعاب عبر «عقد جديد» — ثم اربط بها القضايا."
          actionLabel="عقد جديد"
          onAction={() => setDialogOpen(true)}
        />
      ) : filtered.length === 0 ? (
        <FilteredEmptyState
          onClear={() => {
            setSearch('')
            setStatus('all')
          }}
        />
      ) : (
        <div className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-card">
          {filtered.map((e) => (
            <EngagementRow
              key={e.id}
              engagement={e}
              collection={byEng.get(e.id)}
              onOpen={() => navigate(`/engagements/${e.id}`)}
            />
          ))}
        </div>
      )}

      {/* نموذج طويل — النقر خارج الحوار لا يغلقه حتى لا يضيع الإدخال؛ الإغلاق بزر إلغاء أو Escape */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(ev) => ev.preventDefault()}
        >
          <EngagementForm onDone={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>

      {/* عقد تحصيل ديون من النموذج المعتمد */}
      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(ev) => ev.preventDefault()}
        >
          <NewDebtContractDialog onDone={() => setTemplateOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function StatusChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
}) {
  return (
    <Button size="sm" variant={active ? 'default' : 'outline'} onClick={onClick}>
      {label}
      <span
        className={cn(
          'mr-1 rounded-full px-1.5 text-xs',
          active ? 'bg-white/20' : 'bg-muted text-muted-foreground'
        )}
      >
        {fmtNumber(count)}
      </span>
    </Button>
  )
}

function SumTile({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('mt-1 text-lg font-bold tabular-nums text-foreground', tone)}>{value}</p>
    </div>
  )
}

const NEXT_TONE: Record<InstallmentState, string> = {
  overdue: 'text-destructive font-medium',
  due: 'text-amber-700 dark:text-amber-300 font-medium',
  waiting: 'text-sky-700 dark:text-sky-300',
  upcoming: '',
  paid: '',
}

function EngagementRow({
  engagement: e,
  collection: c,
  onOpen,
}: {
  engagement: Engagement
  collection?: Collection
  onOpen: () => void
}) {
  const pct = c && c.total > 0 ? Math.min(100, Math.round((c.paid / c.total) * 100)) : null
  return (
    <button
      onClick={onOpen}
      className="block w-full rounded-xl px-3 py-3 text-right transition-colors hover:bg-muted/60"
    >
      {/* السطر العلوي: العنوان + الرقم + الحالة */}
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold leading-snug text-foreground">
          {e.title}
        </h3>
        {e.file_url && (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {e.engagement_number && (
          <span
            dir="ltr"
            className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
          >
            {e.engagement_number}
          </span>
        )}
        <Badge variant={engStatusBadge(e.status)} className="shrink-0">
          {engStatusLabel(e.status)}
        </Badge>
      </div>

      {/* السطر السفلي: الموكّل/النوع/التواريخ */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {e.client?.name && (
          <span className="flex min-w-0 items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{e.client.name}</span>
          </span>
        )}
        {e.type && <span>{engTypeLabel(e.type)}</span>}
        {e.signed_date && (
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0" />
            وُقّع {fmtDatePref(e.signed_date)}
          </span>
        )}
        {e.end_date && <span>ينتهي {fmtDatePref(e.end_date)}</span>}
        {c?.next && (
          <span className={NEXT_TONE[c.next.state]}>
            التالية: {c.next.inst.label}
            {c.next.amount != null ? ` · ${fmtNumber(c.next.amount)}` : ''}
            {c.next.state === 'overdue' ? ' (متأخرة)' : c.next.state === 'due' ? ' (مستحقة)' : ''}
          </span>
        )}
        {pct != null && (
          <span className="ms-auto flex items-center gap-1.5">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full bg-gold" style={{ width: `${pct}%` }} />
            </span>
            {fmtNumber(pct)}٪
          </span>
        )}
      </div>
    </button>
  )
}

