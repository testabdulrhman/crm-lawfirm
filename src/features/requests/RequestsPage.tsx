import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { Plus, Inbox, Search, Phone, User, ChevronLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState, FilteredEmptyState } from '@/components/EmptyState'
import { QueryErrorState } from '@/components/QueryErrorState'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { useRequests } from '@/hooks/useRequests'
import { usePageState } from '@/hooks/usePageState'
import { RequestForm } from './RequestForm'
import {
  STATUS_OPTIONS,
  statusBadgeVariant,
  statusLabel,
  typeLabel,
} from './labels'
import type { IncomingRequest, RequestStatus } from '@/types/db'

type Filter = RequestStatus | 'all'

export function RequestsPage() {
  const { data, isLoading, isError, error, refetch } = useRequests('all')
  const [, navigate] = useLocation()
  const [filter, setFilter] = usePageState<Filter>('req:filter', 'all')
  const [search, setSearch] = usePageState('req:q', '')
  const [dialogOpen, setDialogOpen] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const r of data ?? []) {
      const s = r.status ?? 'under_review'
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  }, [data])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((r) => {
      if (q) {
        const hay = [r.client_name, r.client_phone]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filter !== 'all' && (r.status ?? 'under_review') !== filter) return false
      return true
    })
  }, [data, filter, search])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">الطلبات الواردة</h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          طلب جديد
        </Button>
      </div>

      {/* البحث */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث باسم العميل أو جواله…"
          className="pr-9"
        />
      </div>

      {/* الفلاتر مع العدّادات */}
      <div className="flex flex-wrap gap-2">
        <FilterButton
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="الكل"
          count={counts.all ?? 0}
        />
        {STATUS_OPTIONS.map((o) => (
          <FilterButton
            key={o.value}
            active={filter === o.value}
            onClick={() => setFilter(o.value)}
            label={o.label}
            count={counts[o.value] ?? 0}
          />
        ))}
      </div>

      {/* المحتوى */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState
          title="تعذّر تحميل الطلبات"
          error={error}
          onRetry={() => refetch()}
        />
      ) : list.length === 0 ? (
        (data ?? []).length > 0 ? (
          <FilteredEmptyState
            onClear={() => {
              setFilter('all')
              setSearch('')
            }}
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="لا توجد طلبات"
            description="أضِف أول طلب عبر زر «طلب جديد»."
            actionLabel="طلب جديد"
            onAction={() => setDialogOpen(true)}
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onOpen={() => navigate(`/requests/${r.id}`)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <RequestForm onDone={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FilterButton({
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
        className={
          'mr-1 rounded-full px-1.5 text-xs ' +
          (active ? 'bg-white/20' : 'bg-muted text-muted-foreground')
        }
      >
        {fmtNumber(count)}
      </span>
    </Button>
  )
}

function RequestCard({
  request: r,
  onOpen,
}: {
  request: IncomingRequest
  onOpen: () => void
}) {
  return (
    <Card
      className="flex cursor-pointer flex-col transition-colors hover:bg-muted/40"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
    >
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {r.client_name}
            </p>
            {r.client_phone && (
              <p
                dir="ltr"
                className="flex items-center justify-end gap-1 text-xs text-muted-foreground"
              >
                <span>{r.client_phone}</span>
                <Phone className="h-3 w-3" />
              </p>
            )}
          </div>
          <Badge variant={statusBadgeVariant(r.status)}>
            {statusLabel(r.status)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{typeLabel(r.request_type)}</Badge>
          <span className="text-muted-foreground">
            {fmtDatePref(r.received_at)}
          </span>
        </div>

        {r.description && (
          <p className="line-clamp-2 text-sm text-muted-foreground">
            {r.description}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            {r.assigned_to_name ?? 'غير مُسند'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation()
              onOpen()
            }}
          >
            تفاصيل
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

