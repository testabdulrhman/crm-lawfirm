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
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref } from '@/lib/format'
import { useEngagements } from '@/hooks/useEngagements'
import { usePageState } from '@/hooks/usePageState'
import { EngagementForm } from './EngagementForm'
import {
  ENG_STATUS_OPTIONS,
  engStatusBadge,
  engStatusLabel,
  engTypeLabel,
} from './labels'
import type { Engagement } from '@/types/db'

export function EngagementsPage() {
  const { data, isLoading } = useEngagements()
  const [, navigate] = useLocation()
  const [search, setSearch] = usePageState('eng:q', '')
  const [status, setStatus] = usePageState<string>('eng:status', 'all')
  const [dialogOpen, setDialogOpen] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const e of data ?? []) c[e.status] = (c[e.status] ?? 0) + 1
    return c
  }, [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((e) => {
      if (status !== 'all' && e.status !== status) return false
      if (q) {
        const hay = [e.title, e.engagement_number, e.client?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [data, search, status])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          العقود{' '}
          <span className="text-base font-normal text-muted-foreground">
            ({fmtNumber(data?.length ?? 0)})
          </span>
        </h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          عقد جديد
        </Button>
      </div>

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
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-none" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {filtered.map((e) => (
            <EngagementRow
              key={e.id}
              engagement={e}
              onOpen={() => navigate(`/engagements/${e.id}`)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <EngagementForm onDone={() => setDialogOpen(false)} />
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
        {count}
      </span>
    </Button>
  )
}

function EngagementRow({
  engagement: e,
  onOpen,
}: {
  engagement: Engagement
  onOpen: () => void
}) {
  return (
    <button
      onClick={onOpen}
      className="block w-full px-4 py-3 text-right transition-colors hover:bg-accent/10"
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
      </div>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Handshake className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا عقود بعد</p>
      <p className="text-sm text-muted-foreground">
        أضِف أول اتفاقية أتعاب عبر «عقد جديد» — ثم اربط بها القضايا.
      </p>
    </div>
  )
}
