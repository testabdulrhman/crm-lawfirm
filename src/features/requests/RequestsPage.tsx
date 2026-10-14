// الطلبات الواردة «مسار عميل» (قرار المدير 2026-10-14): لوحة بأعمدة المراحل — جديد ← تواصلنا ← عرض سعر ← تعاقدنا ←
// فُتح الملف — تُسحب البطاقة بينها، والراكد (٣ أيام بلا نشاط) أحمر. «اعتذرنا» في قائمة مطوية لا تزاحم اللوحة.
// كانت القائمة بطاقات بحالات «قيد الدراسة/مقبول/مرفوض» وشارات بوابات — ٣٧ طلباً لم يتحوّل منها ملف واحد.
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { ChevronDown, Clock, FileText, Inbox, Plus, Search, Sparkles, User } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { EmptyState } from '@/components/EmptyState'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Ltr } from '@/components/Ltr'
import { cn } from '@/lib/utils'
import { arPlural, fmtDatePref, fmtNumber } from '@/lib/format'
import { arNorm } from '@/lib/arabic'
import { useRequests, useSetRequestStage } from '@/hooks/useRequests'
import { usePageState } from '@/hooks/usePageState'
import { RequestForm } from './RequestForm'
import { STAGES, criticalKindLabel, sourceLabel, staleDays } from './labels'
import type { IncomingRequest, RequestStage } from '@/types/db'

const OPENED_WINDOW_DAYS = 30 // عمود «فُتح الملف» يعرض آخر شهر فقط — للأثر لا للأرشيف

export function RequestsPage() {
  const { data, isLoading, isError, error, refetch } = useRequests('all')
  const setStageM = useSetRequestStage()
  const [, navigate] = useLocation()
  const [search, setSearch] = usePageState('req:q', '')
  const [newOpen, setNewOpen] = useState(false)
  const [showRejected, setShowRejected] = useState(false)
  const [dragOver, setDragOver] = useState<RequestStage | null>(null)

  const { columns, rejected } = useMemo(() => {
    const q = arNorm(search.trim())
    const match = (r: IncomingRequest) =>
      !q || arNorm([r.client_name, r.client_phone, r.opponent_name, r.ref_no].filter(Boolean).join(' ')).includes(q)
    const cols = Object.fromEntries(STAGES.map((s) => [s.value, [] as IncomingRequest[]])) as Record<RequestStage, IncomingRequest[]>
    const rej: IncomingRequest[] = []
    for (const r of data ?? []) {
      if (!match(r)) continue
      if (r.status === 'rejected') { rej.push(r); continue }
      const st = (r.stage ?? 'new') as RequestStage
      if (st === 'opened' && staleDays(r.stage_changed_at ?? r.converted_at) > OPENED_WINDOW_DAYS) continue
      cols[st].push(r)
    }
    // العاجل أولاً: تاريخ حرج قريب، ثم الأقدم ركوداً
    const urgency = (r: IncomingRequest) => (r.critical_date ? Date.parse(r.critical_date) : Infinity)
    for (const k of Object.keys(cols) as RequestStage[]) {
      cols[k].sort((a, b) => urgency(a) - urgency(b) || staleDays(b.last_activity_at) - staleDays(a.last_activity_at))
    }
    return { columns: cols, rejected: rej }
  }, [data, search])

  const open = (data ?? []).filter((r) => r.status !== 'rejected' && r.stage !== 'opened')
  const stale = open.filter((r) => staleDays(r.last_activity_at) >= 3).length

  const onDrop = (stage: RequestStage, id: string) => {
    setDragOver(null)
    const r = (data ?? []).find((x) => x.id === id)
    if (!r || r.stage === stage) return
    // فتح الملف فعلٌ لا سحب — يُنشئ الملف ويربطه؛ يتم من صفحة الطلب
    if (stage === 'opened') { navigate(`/requests/${id}`); return }
    setStageM.mutate({ id, stage })
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">الطلبات الواردة</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {arPlural(open.length, { one: 'طلب مفتوح', two: 'طلبان مفتوحان', many: 'طلبات مفتوحة' })}
            {stale > 0 && <span className="text-destructive"> · {fmtNumber(stale)} بلا تحرّك ٣ أيام فأكثر</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الجوال أو الرقم…" className="w-64 pr-9" />
          </div>
          <Button variant="gold" onClick={() => setNewOpen(true)}>
            <Plus className="h-4 w-4" />
            طلب جديد
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 lg:grid-cols-5">
          {STAGES.map((s) => <Skeleton key={s.value} className="h-72 w-full" />)}
        </div>
      ) : isError ? (
        <QueryErrorState title="تعذّر تحميل الطلبات" error={error} onRetry={() => refetch()} />
      ) : (data ?? []).length === 0 ? (
        <EmptyState icon={Inbox} title="لا توجد طلبات" description="أضِف أول طلب عبر زر «طلب جديد»." actionLabel="طلب جديد" onAction={() => setNewOpen(true)} />
      ) : (
        <>
          {/* اللوحة — تُمرَّر أفقياً في الشاشات الصغيرة */}
          <div className="-mx-1 overflow-x-auto px-1 pb-2">
            <div className="grid min-w-[1050px] grid-cols-5 gap-3">
              {STAGES.map((s) => {
                const list = columns[s.value]
                return (
                  <div
                    key={s.value}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(s.value) }}
                    onDragLeave={() => setDragOver((d) => (d === s.value ? null : d))}
                    onDrop={(e) => onDrop(s.value, e.dataTransfer.getData('text/plain'))}
                    className={cn(
                      'flex min-h-[18rem] flex-col gap-2 rounded-2xl bg-muted/50 p-2 transition-colors',
                      dragOver === s.value && 'bg-gold/15 ring-2 ring-gold/50'
                    )}
                  >
                    <div className="flex items-center justify-between px-1.5 pt-1 text-sm font-semibold">
                      <span>{s.label}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {fmtNumber(list.length)}
                        {s.value === 'opened' ? ' · آخر شهر' : ''}
                      </span>
                    </div>
                    {list.length === 0 ? (
                      <p className="px-2 py-6 text-center text-xs text-muted-foreground">—</p>
                    ) : (
                      list.map((r) => <BoardCard key={r.id} r={r} onOpen={() => navigate(`/requests/${r.id}`)} />)
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* اعتذرنا — مطوية */}
          {rejected.length > 0 && (
            <div className="rounded-2xl border bg-card">
              <button
                type="button"
                onClick={() => setShowRejected((v) => !v)}
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium"
              >
                <span>اعتذرنا · {fmtNumber(rejected.length)}</span>
                <ChevronDown className={cn('h-4 w-4 transition-transform', showRejected && 'rotate-180')} />
              </button>
              {showRejected && (
                <div className="divide-y border-t">
                  {rejected.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => navigate(`/requests/${r.id}`)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-right text-sm hover:bg-muted/40"
                    >
                      <span className="font-medium">{r.client_name}</span>
                      <span className="text-xs text-muted-foreground">{sourceLabel(r.source)} · {fmtDatePref(r.received_at)}</span>
                      {r.rejection_reason && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">— {r.rejection_reason}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-2xl">
          <RequestForm onDone={() => setNewOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BoardCard({ r, onOpen }: { r: IncomingRequest; onOpen: () => void }) {
  const idle = staleDays(r.last_activity_at)
  const stale = r.stage !== 'opened' && idle >= 3
  return (
    <button
      type="button"
      draggable
      onDragStart={(e) => e.dataTransfer.setData('text/plain', r.id)}
      onClick={onOpen}
      className={cn(
        'w-full cursor-grab rounded-xl border bg-card p-2.5 text-right text-sm shadow-sm transition-colors hover:border-gold/60 active:cursor-grabbing',
        stale && 'border-destructive/40'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate font-semibold text-foreground">{r.client_name}</span>
        {r.ref_no && <span className="shrink-0 text-[10px] text-muted-foreground"><Ltr>{r.ref_no}</Ltr></span>}
      </div>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">
        {[r.case_type, sourceLabel(r.source)].filter(Boolean).join(' · ')}
      </p>
      {r.docs_summary?.headline && (
        <p className="mt-1.5 line-clamp-2 flex gap-1 text-xs text-foreground/80">
          <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-gold" />
          {r.docs_summary.headline}
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {r.critical_date && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            ⚠ {criticalKindLabel(r.critical_date_kind)} {fmtDatePref(r.critical_date)}
          </Badge>
        )}
        {r.stage === 'quoted' && r.quote_amount != null && (
          <Badge variant="outline" className="gap-1 text-[10px]">
            <FileText className="h-3 w-3" />
            {fmtNumber(r.quote_amount)}
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1 truncate">
          <User className="h-3 w-3 shrink-0" />
          {r.assigned_to_name ?? 'غير مُحال'}
        </span>
        {stale ? (
          <span className="flex shrink-0 items-center gap-1 font-medium text-destructive">
            <Clock className="h-3 w-3" />
            {fmtNumber(idle)} يوماً
          </span>
        ) : null}
      </div>
    </button>
  )
}
