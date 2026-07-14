import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  Plus,
  Search,
  Scale,
  CalendarClock,
  User,
  UserCog,
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
import { fmtNumber, fmtDatePref } from '@/lib/format'
import { useCases } from '@/hooks/useCases'
import { useTeamMembers } from '@/hooks/useTeam'
import { CaseForm } from './CaseForm'
import {
  CASE_STATUS_OPTIONS,
  CASE_STATUS_ORDER,
  caseStatusBadge,
  caseStatusLabel,
  caseTypeLabel,
} from '@/lib/caseLabels'
import { cn } from '@/lib/utils'
import type { Case } from '@/types/db'

const PAGE = 50
const ALL = '__all__'

// هل الجلسة قريبة (خلال 7 أيام من اليوم)؟
function isHearingSoon(d: string | null): boolean {
  if (!d) return false
  const date = new Date(d)
  if (isNaN(date.getTime())) return false
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const diff = (date.getTime() - now.getTime()) / 86400000
  return diff >= 0 && diff <= 7
}

export function CasesPage() {
  const { data, isLoading } = useCases()
  const { data: members } = useTeamMembers()
  const [, navigate] = useLocation()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [type, setType] = useState<string>(ALL)
  const [assignee, setAssignee] = useState<string>(ALL)
  const [visible, setVisible] = useState(PAGE)
  const [dialogOpen, setDialogOpen] = useState(false)

  const resetPage = () => setVisible(PAGE)

  // أنواع موجودة فعلاً (للفلتر)
  const types = useMemo(
    () =>
      Array.from(
        new Set((data ?? []).map((c) => c.type).filter((t): t is string => !!t && t.trim() !== ''))
      ).sort(),
    [data]
  )

  const activeMembers = (members ?? []).filter((m) => m.is_active)

  // عدّادات الحالة
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const k of data ?? []) {
      const s = k.status ?? 'jarri'
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  }, [data])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const list = (data ?? []).filter((c) => {
      if (q) {
        const hay = [c.title, c.office_num, c.court_num, c.contact?.name]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (status !== 'all' && (c.status ?? 'jarri') !== status) return false
      if (type !== ALL && (c.type ?? '') !== type) return false
      if (assignee !== ALL && c.assignee_id !== assignee) return false
      return true
    })
    // فرز: الجارية ثم المعلّقة ثم المنتهية (مع الحفاظ على ترتيب الأحدث داخل كل مجموعة)
    return list
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const sa = CASE_STATUS_ORDER[a.c.status ?? 'jarri'] ?? 9
        const sb = CASE_STATUS_ORDER[b.c.status ?? 'jarri'] ?? 9
        return sa - sb || a.i - b.i
      })
      .map((x) => x.c)
  }, [data, search, status, type, assignee])

  const shown = filtered.slice(0, visible)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          القضايا{' '}
          <span className="text-base font-normal text-muted-foreground">
            ({fmtNumber(data?.length ?? 0)})
          </span>
        </h2>
        <Button variant="gold" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          قضية جديدة
        </Button>
      </div>

      {/* البحث */}
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            resetPage()
          }}
          placeholder="بحث بالعنوان أو رقم المكتب/المحكمة أو الموكّل…"
          className="pr-9"
        />
      </div>

      {/* فلاتر الحالة */}
      <div className="flex flex-wrap gap-2">
        <StatusChip
          active={status === 'all'}
          onClick={() => { setStatus('all'); resetPage() }}
          label="الكل"
          count={statusCounts.all ?? 0}
        />
        {CASE_STATUS_OPTIONS.map((o) => (
          <StatusChip
            key={o.value}
            active={status === o.value}
            onClick={() => { setStatus(o.value); resetPage() }}
            label={o.label}
            count={statusCounts[o.value] ?? 0}
          />
        ))}
      </div>

      {/* فلاتر النوع والمسؤول */}
      <div className="flex flex-wrap gap-2">
        <Select value={type} onValueChange={(v) => { setType(v); resetPage() }}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="النوع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>كل الأنواع</SelectItem>
            {types.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={assignee} onValueChange={(v) => { setAssignee(v); resetPage() }}>
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

      {/* المحتوى — قائمة صفوف */}
      {isLoading ? (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-none" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {shown.map((c) => (
              <CaseRow
                key={c.id}
                caseItem={c}
                onOpen={() => navigate(`/cases/${c.id}`)}
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
        <DialogContent className="max-w-2xl">
          <CaseForm onDone={() => setDialogOpen(false)} />
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

function CaseRow({
  caseItem: c,
  onOpen,
}: {
  caseItem: Case
  onOpen: () => void
}) {
  const soon = isHearingSoon(c.hearing_date)

  // أرقام المكتب/المحكمة (لاتينية)
  const nums: string[] = []
  if (c.office_num) nums.push(`مكتب ${c.office_num}`)
  if (c.court_num) nums.push(`محكمة ${c.court_num}`)

  return (
    <button
      onClick={onOpen}
      className="block w-full px-4 py-3 text-right transition-colors hover:bg-accent/10"
    >
      {/* السطر العلوي: العنوان + الحالة/النوع */}
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-semibold leading-snug text-foreground">
          {c.title || 'بدون عنوان'}
        </h3>
        {soon && c.hearing_date && (
          <span className="hidden shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400 sm:flex">
            <CalendarClock className="h-3 w-3" />
            {fmtDatePref(c.hearing_date)}
          </span>
        )}
        <Badge variant={caseStatusBadge(c.status)} className="shrink-0">
          {caseStatusLabel(c.status)}
        </Badge>
        <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">
          {caseTypeLabel(c.type)}
        </Badge>
      </div>

      {/* السطر السفلي: ميتا هادئة */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {c.contact?.name && (
          <span className="flex min-w-0 items-center gap-1">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{c.contact.name}</span>
          </span>
        )}
        {(c.assignee?.short_name || c.assignee?.name) && (
          <span className="flex items-center gap-1">
            <UserCog className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {c.assignee?.short_name || c.assignee?.name}
            </span>
          </span>
        )}
        {nums.length > 0 && (
          <span dir="ltr" className="text-right">
            {nums.join(' · ')}
          </span>
        )}
        {/* الجلسة على الجوال (أو غير القريبة) */}
        {c.hearing_date && (
          <span
            className={cn(
              'flex items-center gap-1',
              soon
                ? 'font-medium text-amber-600 dark:text-amber-400 sm:hidden'
                : ''
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {fmtDatePref(c.hearing_date)}
          </span>
        )}
      </div>
    </button>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Scale className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">لا توجد قضايا</p>
      <p className="text-sm text-muted-foreground">
        جرّب تعديل الفلاتر أو أضِف قضية جديدة.
      </p>
    </div>
  )
}
