import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Plus,
  Search,
  FileSignature,
  ChevronLeft,
  FileText,
  AlertTriangle,
  ArrowLeft,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref } from '@/lib/format'
import { usePOAs } from '@/hooks/usePOAs'
import { usePageState } from '@/hooks/usePageState'
import { POAForm } from './POAForm'
import {
  POA_STATUS_OPTIONS,
  poaStatusBadge,
  poaStatusLabel,
  isExpiringSoon,
  isActuallyExpired,
  expirySoonText,
} from '@/lib/poaLabels'
import type { PowerOfAttorney } from '@/types/db'

const PAGE = 50

export function POAsPage() {
  const { data, isLoading } = usePOAs()
  const [, navigate] = useLocation()

  const [search, setSearch] = usePageState('poa:q', '')
  const [status, setStatus] = usePageState<string>('poa:status', 'all')
  const [soonOnly, setSoonOnly] = usePageState('poa:soon', false)
  const [visible, setVisible] = usePageState('poa:visible', PAGE)
  const [dialogOpen, setDialogOpen] = useState(false)

  const resetPage = () => setVisible(PAGE)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0, soon: 0 }
    for (const p of data ?? []) {
      const s = p.status ?? 'active'
      c[s] = (c[s] ?? 0) + 1
      if (isExpiringSoon(p)) c.soon++
    }
    return c
  }, [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (data ?? []).filter((p) => {
      if (q) {
        const hay = [p.poa_number, p.client_name, p.agent_name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (status !== 'all' && (p.status ?? 'active') !== status) return false
      if (soonOnly && !isExpiringSoon(p)) return false
      return true
    })
    // الترتيب حسب تاريخ الإصدار تنازلياً (الأحدث أولاً)، والفارغ في الأسفل
    return list
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const da = a.p.poa_date ?? ''
        const db = b.p.poa_date ?? ''
        if (da && db) return db.localeCompare(da) || a.i - b.i
        if (!da && !db) return a.i - b.i
        return da ? -1 : 1 // الفارغ في الأسفل
      })
      .map((x) => x.p)
  }, [data, search, status, soonOnly])

  const shown = filtered.slice(0, visible)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          الوكالات{' '}
          <span className="text-base font-normal text-muted-foreground">
            ({fmtNumber(data?.length ?? 0)})
          </span>
        </h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          وكالة جديدة
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            resetPage()
          }}
          placeholder="بحث برقم الوكالة أو الموكّل أو الوكيل…"
          className="pr-9"
        />
      </div>

      {/* الفلاتر */}
      <div className="flex flex-wrap gap-2">
        <Chip
          active={status === 'all' && !soonOnly}
          onClick={() => { setStatus('all'); setSoonOnly(false); resetPage() }}
          label="الكل"
          count={counts.all ?? 0}
        />
        {POA_STATUS_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            active={status === o.value && !soonOnly}
            onClick={() => { setStatus(o.value); setSoonOnly(false); resetPage() }}
            label={o.label}
            count={counts[o.value] ?? 0}
          />
        ))}
        <Chip
          active={soonOnly}
          onClick={() => { setSoonOnly((v) => !v); setStatus('all'); resetPage() }}
          label="تنتهي قريباً"
          count={counts.soon ?? 0}
          amber
        />
      </div>

      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          النتائج: {fmtNumber(filtered.length)}
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((p) => (
              <POACard key={p.id} poa={p} onOpen={() => navigate(`/poa/${p.id}`)} />
            ))}
          </div>
          {visible < filtered.length && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setVisible((v) => v + PAGE)}>
                تحميل المزيد ({fmtNumber(filtered.length - visible)})
              </Button>
            </div>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <POAForm onDone={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Chip({
  active,
  onClick,
  label,
  count,
  amber,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  amber?: boolean
}) {
  return (
    <Button
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
      className={cn(amber && !active && 'border-amber-400 text-amber-700 dark:text-amber-400')}
    >
      {label}
      <span
        className={cn(
          'mr-1 rounded-full px-1.5 text-xs',
          active ? 'bg-white/20' : 'bg-muted text-muted-foreground'
        )}
      >
        {count}
      </span>
    </Button>
  )
}

function POACard({
  poa: p,
  onOpen,
}: {
  poa: PowerOfAttorney
  onOpen: () => void
}) {
  const soon = isExpiringSoon(p)
  const overdue = isActuallyExpired(p)
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <FileSignature className="h-4 w-4 shrink-0 text-gold" />
            <p dir="ltr" className="truncate text-right font-semibold text-foreground">
              {p.poa_number || 'وكالة'}
            </p>
          </div>
          <Badge variant={poaStatusBadge(p.status)}>{poaStatusLabel(p.status)}</Badge>
        </div>

        {(soon || overdue) && (
          <div
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs',
              overdue
                ? 'bg-destructive/10 text-destructive'
                : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
            )}
          >
            <AlertTriangle className="h-3 w-3" />
            {overdue ? 'منتهية فعلياً' : expirySoonText(p.expiry_date)}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-sm text-foreground">
          <span className="truncate">{p.client_name || '—'}</span>
          <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground">
            {p.agent_name || '—'}
          </span>
        </div>

        <div className="space-y-0.5 text-xs text-muted-foreground">
          {p.poa_date && <p>الإصدار: {fmtDatePref(p.poa_date)}</p>}
          {p.expiry_date && (
            <p className={cn(soon && 'font-medium text-amber-600 dark:text-amber-400')}>
              الانتهاء: {fmtDatePref(p.expiry_date)}
            </p>
          )}
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {p.document_url ? (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
              مستند
            </span>
          ) : (
            <span />
          )}
          <Button size="sm" variant="ghost" onClick={onOpen}>
            عرض
            <ChevronLeft className="h-4 w-4" />
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
        <FileSignature className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد وكالات</p>
      <p className="text-sm text-muted-foreground">جرّب تعديل الفلاتر أو أضِف وكالة جديدة.</p>
    </div>
  )
}
