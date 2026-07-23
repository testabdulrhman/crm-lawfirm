import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Plus,
  Search,
  FileText,
  ArrowLeft,
  User,
  UserCog,
  CalendarDays,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { fmtNumber, fmtDatePref } from '@/lib/format'
import { useLegalServices } from '@/hooks/useLegalServices'
import { usePageState } from '@/hooks/usePageState'
import { useTeamMembers } from '@/hooks/useTeam'
import { LegalServiceForm } from './LegalServiceForm'
import {
  LS_TYPE_OPTIONS,
  LS_STATUS_OPTIONS,
  lsStatusBadge,
  lsStatusLabel,
  lsTypeBadge,
  lsTypeLabel,
} from '@/lib/legalServiceLabels'
import type { LegalService } from '@/types/db'

const ALL = '__all__'

export function LegalServicesPage() {
  const { data, isLoading } = useLegalServices('all')
  const { data: members } = useTeamMembers()
  const [, navigate] = useLocation()

  const [search, setSearch] = usePageState('ls:q', '')
  const [type, setType] = usePageState<string>('ls:type', 'all')
  const [status, setStatus] = usePageState<string>('ls:status', 'all')
  const [assignee, setAssignee] = usePageState<string>('ls:assignee', ALL)
  const [dialogOpen, setDialogOpen] = useState(false)

  const activeMembers = (members ?? []).filter((m) => m.is_active)

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const s of data ?? []) {
      const k = s.type ?? '—'
      c[k] = (c[k] ?? 0) + 1
    }
    return c
  }, [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (data ?? []).filter((s) => {
      if (q) {
        const hay = [s.title, s.client_name].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (type !== 'all' && (s.type ?? '') !== type) return false
      if (status !== 'all' && (s.status ?? '') !== status) return false
      if (assignee !== ALL && s.assignee_id !== assignee) return false
      return true
    })
  }, [data, search, type, status, assignee])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          الاستشارات واللوائح والعقود{' '}
          <span className="text-base font-normal text-muted-foreground">
            ({fmtNumber(data?.length ?? 0)})
          </span>
        </h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          خدمة جديدة
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالعنوان أو الموكّل…"
          className="pr-9"
        />
      </div>

      {/* فلتر النوع (Tabs بارزة) */}
      <div className="flex flex-wrap gap-2">
        <TypeChip
          active={type === 'all'}
          onClick={() => setType('all')}
          label="الكل"
          count={typeCounts.all ?? 0}
        />
        {LS_TYPE_OPTIONS.map((o) => (
          <TypeChip
            key={o.value}
            active={type === o.value}
            onClick={() => setType(o.value)}
            label={`${o.label}`}
            count={typeCounts[o.value] ?? 0}
          />
        ))}
      </div>

      {/* فلاتر الحالة والمسؤول */}
      <div className="flex flex-wrap gap-2">
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="الحالة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {LS_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="المسؤول" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل المسؤولين</SelectItem>
            {activeMembers.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!isLoading && (
        <p className="text-sm text-muted-foreground">
          النتائج: {fmtNumber(filtered.length)}
        </p>
      )}

      {isLoading ? (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-none" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {filtered.map((s) => (
            <ServiceRow
              key={s.id}
              service={s}
              onOpen={() => navigate(`/legal-services/${s.id}`)}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <LegalServiceForm onDone={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function TypeChip({
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

function ServiceRow({
  service: s,
  onOpen,
}: {
  service: LegalService
  onOpen: () => void
}) {
  const isContract = s.type === 'contract'
  const isRegulation = s.type === 'regulation'
  const assigneeName =
    s.assignee?.short_name || s.assignee?.name || s.assignee_name || ''

  return (
    <button
      onClick={onOpen}
      className="block w-full px-4 py-3 text-right transition-colors hover:bg-accent/10"
    >
      {/* السطر العلوي: العنوان + النوع/الحالة */}
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold leading-snug text-foreground">
          {s.title || 'خدمة'}
        </h3>
        {s.file_url && (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Badge variant={lsTypeBadge(s.type)} className="hidden shrink-0 sm:inline-flex">
          {lsTypeLabel(s.type)}
        </Badge>
        <Badge variant={lsStatusBadge(s.status)} className="shrink-0">
          {lsStatusLabel(s.status)}
        </Badge>
      </div>

      {/* السطر السفلي: ميتا هادئة */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {s.client_name && (
          <span className="flex min-w-0 items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{s.client_name}</span>
          </span>
        )}
        {assigneeName && (
          <span className="flex items-center gap-1">
            <UserCog className="h-3 w-3 shrink-0" />
            {assigneeName}
          </span>
        )}
        {s.service_kind && <span>{s.service_kind}</span>}
        {isRegulation && s.regulation_type && (
          <span>اللائحة: {s.regulation_type}</span>
        )}
        {isContract && (s.party_first || s.party_second) && (
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">{s.party_first || '—'}</span>
            <ArrowLeft className="h-3 w-3 shrink-0" />
            <span className="truncate">{s.party_second || '—'}</span>
          </span>
        )}
        {s.service_date && (
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0" />
            {fmtDatePref(s.service_date)}
          </span>
        )}
        {s.delivered_date && <span>التسليم: {fmtDatePref(s.delivered_date)}</span>}
      </div>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <FileText className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد خدمات</p>
      <p className="text-sm text-muted-foreground">جرّب تعديل الفلاتر أو أضِف خدمة جديدة.</p>
    </div>
  )
}
