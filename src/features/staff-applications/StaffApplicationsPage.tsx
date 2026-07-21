import { useMemo } from 'react'
import { useLocation } from 'wouter'
import {
  UserPlus,
  Phone,
  ChevronLeft,
  FileText,
  Award,
  Scale,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { fmtDatePref } from '@/lib/format'
import { useStaffApplications } from '@/hooks/useStaffApplications'
import { usePageState } from '@/hooks/usePageState'
import {
  APP_STATUS_OPTIONS,
  appStatusBadge,
  appStatusLabel,
  idTypeLabel,
} from './labels'
import type { StaffApplication, StaffApplicationStatus } from '@/types/db'

type Filter = StaffApplicationStatus | 'all'

export function StaffApplicationsPage() {
  const { data, isLoading } = useStaffApplications('all')
  const [, navigate] = useLocation()
  const [filter, setFilter] = usePageState<Filter>('apps:filter', 'all')

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const a of data ?? []) {
      const s = a.status ?? 'pending'
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  }, [data])

  const list = useMemo(() => {
    if (filter === 'all') return data ?? []
    return (data ?? []).filter((a) => (a.status ?? 'pending') === filter)
  }, [data, filter])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <h2 className="text-2xl font-bold tracking-tight text-foreground">طلبات التوظيف</h2>

      <div className="flex flex-wrap gap-2">
        <FilterButton
          active={filter === 'all'}
          onClick={() => setFilter('all')}
          label="الكل"
          count={counts.all ?? 0}
        />
        {APP_STATUS_OPTIONS.map((o) => (
          <FilterButton
            key={o.value}
            active={filter === o.value}
            onClick={() => setFilter(o.value)}
            label={o.label}
            count={counts[o.value] ?? 0}
          />
        ))}
      </div>

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
          {list.map((a) => (
            <ApplicationCard
              key={a.id}
              app={a}
              onOpen={() => navigate(`/staff-applications/${a.id}`)}
            />
          ))}
        </div>
      )}
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

function DocChip({
  has,
  icon: Icon,
  label,
}: {
  has: boolean
  icon: typeof FileText
  label: string
}) {
  if (!has) return null
  return (
    <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

function ApplicationCard({
  app: a,
  onOpen,
}: {
  app: StaffApplication
  onOpen: () => void
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">
              {a.full_name ?? '—'}
            </p>
            {a.phone && (
              <p
                dir="ltr"
                className="flex items-center justify-end gap-1 text-xs text-muted-foreground"
              >
                <span>{a.phone}</span>
                <Phone className="h-3 w-3" />
              </p>
            )}
          </div>
          <Badge variant={appStatusBadge(a.status)}>
            {appStatusLabel(a.status)}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{idTypeLabel(a.id_type)}</Badge>
          <span className="text-muted-foreground">{fmtDatePref(a.created_at)}</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <DocChip has={!!a.cv_url} icon={FileText} label="السيرة" />
          <DocChip has={!!a.qualification_doc_url} icon={Award} label="المؤهل" />
          <DocChip has={!!a.lawyer_license_url} icon={Scale} label="الرخصة" />
        </div>

        <div className="mt-auto flex justify-end pt-2">
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
        <UserPlus className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد طلبات توظيف</p>
      <p className="text-sm text-muted-foreground">
        تصل الطلبات من نموذج التوظيف في الموقع العام.
      </p>
    </div>
  )
}
