import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Plus,
  Search,
  Home,
  ChevronLeft,
  ArrowLeft,
  MapPin,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtCurrency, fmtDatePref } from '@/lib/format'
import { usePropertyTransfers } from '@/hooks/usePropertyTransfers'
import { usePageState } from '@/hooks/usePageState'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState, FilteredEmptyState } from '@/components/EmptyState'
import { Ltr } from '@/components/Ltr'
import { PropertyTransferForm } from './PropertyTransferForm'
import {
  PROPERTY_STATUS_OPTIONS,
  propertyStatusBadge,
  propertyStatusLabel,
} from '@/lib/propertyLabels'
import type { PropertyTransfer } from '@/types/db'

const ALL = '__all__'
const PAGE = 50

export function PropertyTransfersPage() {
  const { data, isLoading, isError, error, refetch } = usePropertyTransfers()
  const [, navigate] = useLocation()

  const [search, setSearch] = usePageState('prop:q', '')
  const [status, setStatus] = usePageState<string>('prop:status', 'all')
  const [propType, setPropType] = usePageState<string>('prop:type', ALL)
  const [visible, setVisible] = usePageState('prop:visible', PAGE)
  const [dialogOpen, setDialogOpen] = useState(false)

  // أعد ضبط الصفحات عند تغيير البحث/الفلاتر
  const resetPage = () => setVisible(PAGE)

  const propTypes = useMemo(
    () =>
      Array.from(
        new Set(
          (data ?? [])
            .map((p) => p.property_type)
            .filter((t): t is string => !!t && t.trim() !== '')
        )
      ).sort(),
    [data]
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const p of data ?? []) {
      const s = p.status ?? '—'
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  }, [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((p) => {
      if (q) {
        const hay = [p.deed_number, p.seller_name, p.buyer_name, p.location]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (status !== 'all' && (p.status ?? '') !== status) return false
      if (propType !== ALL && (p.property_type ?? '') !== propType) return false
      return true
    })
  }, [data, search, status, propType])

  const shown = filtered.slice(0, visible)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          التوثيق العقاري{' '}
          <span className="text-base font-normal text-muted-foreground">
            ({fmtNumber(data?.length ?? 0)})
          </span>
        </h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          معاملة جديدة
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
          placeholder="بحث برقم الصك أو البائع أو المشتري أو الموقع…"
          className="pr-9"
        />
      </div>

      {/* فلاتر الحالة */}
      <div className="flex flex-wrap gap-2">
        <StatusChip
          active={status === 'all'}
          onClick={() => { setStatus('all'); resetPage() }}
          label="الكل"
          count={counts.all ?? 0}
        />
        {PROPERTY_STATUS_OPTIONS.map((o) => (
          <StatusChip
            key={o}
            active={status === o}
            onClick={() => { setStatus(o); resetPage() }}
            label={o}
            count={counts[o] ?? 0}
          />
        ))}
      </div>

      {/* فلتر نوع العقار */}
      <Select value={propType} onValueChange={(v) => { setPropType(v); resetPage() }}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="نوع العقار" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>كل الأنواع</SelectItem>
          {propTypes.map((t) => (
            <SelectItem key={t} value={t}>
              {t}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          النتائج: {fmtNumber(filtered.length)}
        </p>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState
          title="تعذّر تحميل المعاملات العقارية"
          error={error}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        (data ?? []).length === 0 ? (
          <EmptyState
            icon={Home}
            title="لا توجد معاملات بعد"
            description="أضف أول معاملة توثيق عقاري لمتابعتها."
            actionLabel="معاملة جديدة"
            onAction={() => setDialogOpen(true)}
          />
        ) : (
          <FilteredEmptyState
            onClear={() => {
              setSearch('')
              setStatus('all')
              setPropType(ALL)
              resetPage()
            }}
          />
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((p) => (
              <TransferCard
                key={p.id}
                transfer={p}
                onOpen={() => navigate(`/property/${p.id}`)}
              />
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
        <DialogContent
          className="max-w-2xl"
          onInteractOutside={(e) => e.preventDefault()}
        >
          <PropertyTransferForm onDone={() => setDialogOpen(false)} />
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

function TransferCard({
  transfer: p,
  onOpen,
}: {
  transfer: PropertyTransfer
  onOpen: () => void
}) {
  return (
    <Card
      className="flex cursor-pointer flex-col"
      role="link"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen()
      }}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Home className="h-4 w-4 shrink-0 text-gold" />
            <p className="truncate font-semibold text-foreground">
              {p.transfer_type || 'معاملة'}
            </p>
          </div>
          <Badge variant={propertyStatusBadge(p.status)}>
            {propertyStatusLabel(p.status)}
          </Badge>
        </div>

        {/* البائع ← المشتري */}
        <div className="flex items-center gap-1.5 text-sm text-foreground">
          <span className="truncate">{p.seller_name || '—'}</span>
          <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate text-muted-foreground">
            {p.buyer_name || '—'}
          </span>
        </div>

        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-center gap-x-2">
            {p.property_type && <Badge variant="outline">{p.property_type}</Badge>}
            {p.deed_number && (
              <span>
                صك: <Ltr>{p.deed_number}</Ltr>
              </span>
            )}
          </div>
          {p.location && (
            <p className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {p.location}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-3">
            {p.area != null && <span>{fmtNumber(p.area)} م²</span>}
            {p.amount != null && (
              <span className="font-medium text-foreground">
                {fmtCurrency(p.amount)}
              </span>
            )}
          </div>
          {p.transfer_date && <p>الإفراغ: {fmtDatePref(p.transfer_date)}</p>}
        </div>

        <div className="mt-auto flex justify-end pt-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
          >
            عرض
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
