import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { Plus, Inbox, Phone, User, ChevronLeft } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Card, CardContent } from '@/components/ui/card'
import { fmtDatePref } from '@/lib/format'
import { useRequests } from '@/hooks/useRequests'
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
  const { data, isLoading } = useRequests('all')
  const [, navigate] = useLocation()
  const [filter, setFilter] = useState<Filter>('all')
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
    if (filter === 'all') return data ?? []
    return (data ?? []).filter((r) => (r.status ?? 'under_review') === filter)
  }, [data, filter])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">الطلبات الواردة</h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          طلب جديد
        </Button>
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
      ) : list.length === 0 ? (
        <EmptyState />
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
        {count}
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
    <Card className="flex flex-col">
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
          <Button size="sm" variant="ghost" onClick={onOpen}>
            تفاصيل
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
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد طلبات</p>
      <p className="text-sm text-muted-foreground">
        أضِف أول طلب عبر زر «طلب جديد».
      </p>
    </div>
  )
}
