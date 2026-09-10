import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  BookOpen,
  FolderOpen,
  Landmark,
  Building2,
  Plus,
  Scale,
  Search,
  UserRound,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState, FilteredEmptyState } from '@/components/EmptyState'
import { useMatters, type MatterKind, type MatterRow } from '@/hooks/useMatters'
import { matterKindEmoji } from '@/lib/matterHref'
import { useTeamMembers } from '@/hooks/useTeam'
import { LegalServiceForm } from '@/features/legal-services/LegalServiceForm'
import { PropertyTransferForm } from '@/features/property/PropertyTransferForm'
import {
  caseStatusLabel,
  caseStatusBadge,
  CASE_STATUS_OPTIONS,
} from '@/lib/caseLabels'
import {
  lsStatusLabel,
  lsStatusBadge,
  LS_STATUS_OPTIONS,
} from '@/lib/legalServiceLabels'
import {
  propertyStatusLabel,
  PROPERTY_STATUS_OPTIONS,
} from '@/lib/propertyLabels'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { arNorm } from '@/lib/arabic'
import { Ltr } from '@/components/Ltr'

// تبويب «المشاريع» — نموذج Matter الموحّد (قرار المستخدم 2026-08-21).
// ثلاثة أنواع في قائمة واحدة، وسؤال «وين مشروع فلان؟» صار له جواب واحد.

const KINDS: Record<
  MatterKind,
  { label: string; icon: LucideIcon; chip: string }
> = {
  case: { label: 'قضية', icon: Scale, chip: 'bg-navy/10 text-navy dark:bg-navy-100/10 dark:text-navy-100' },
  legal_service: { label: 'استشارة / لائحة', icon: BookOpen, chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  property: { label: 'توثيق عقاري', icon: Landmark, chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  bankruptcy: { label: 'إجراء إفلاس', icon: Building2, chip: 'bg-violet-500/10 text-violet-700 dark:text-violet-300' },
}

// حالات كل نوع — صف الفرز الثاني يظهر عند اختيار تصنيف بعينه
const STATUSES: Record<MatterKind, { value: string; label: string }[]> = {
  case: CASE_STATUS_OPTIONS,
  legal_service: LS_STATUS_OPTIONS,
  // التوثيق العقاري يخزّن الحالة بالعربية مباشرةً (القيمة = التسمية)
  property: PROPERTY_STATUS_OPTIONS.map((v) => ({ value: v, label: v })),
  // الإفلاس يشارك القضايا حالاتها (جارية/معلّقة/منتهية) فيتّسق مع اللوحة والتقارير
  bankruptcy: CASE_STATUS_OPTIONS,
}

function statusOf(m: MatterRow): { label: string; badge: any } {
  switch (m.kind) {
    case 'case':
      return { label: caseStatusLabel(m.status), badge: caseStatusBadge(m.status) }
    case 'legal_service':
      return { label: lsStatusLabel(m.status), badge: lsStatusBadge(m.status) }
    case 'property':
      return { label: propertyStatusLabel(m.status), badge: 'outline' }
    case 'bankruptcy':
      return { label: caseStatusLabel(m.status), badge: caseStatusBadge(m.status) }
  }
}

export function MattersPage() {
  const [, navigate] = useLocation()
  const { data, isLoading, error, refetch } = useMatters()
  const { data: members } = useTeamMembers()

  const [kind, setKind] = useState<MatterKind | 'all'>('all')
  // الحالة ضمن التصنيف (منتهية/جارية…) — تُصفَّر عند تبديل التصنيف
  const [status, setStatus] = useState<string>('all')
  const [assignee, setAssignee] = useState<string>('all')
  const [q, setQ] = useState('')
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState<'legal_service' | 'property' | null>(null)

  const rows = data ?? []
  const filtered = useMemo(() => {
    const needle = arNorm(q.trim())
    return rows.filter((m) => {
      if (kind !== 'all' && m.kind !== kind) return false
      if (status !== 'all' && (m.status ?? '') !== status) return false
      if (assignee !== 'all') {
        // 'none' = بلا إسناد — سؤال متكرر: «وش اللي ما أحد ماسكه؟»
        if (assignee === 'none' ? m.assigneeId !== null : m.assigneeId !== assignee)
          return false
      }
      if (!needle) return true
      return arNorm(
        [m.title, m.client, m.ref, m.assigneeName].filter(Boolean).join(' ')
      ).includes(needle)
    })
  }, [rows, kind, status, assignee, q])

  const countOf = (k: MatterKind) => rows.filter((m) => m.kind === k).length
  // عدّاد كل حالة ضمن التصنيف المختار (لا ضمن المعروض — كي لا يتغيّر بالبحث)
  const statusCount = (v: string) =>
    rows.filter((m) => m.kind === kind && (m.status ?? '') === v).length

  // من له مشاريع فعلاً فقط — قائمة قصيرة مفيدة بدل كل الموظفين
  const assignees = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of rows) {
      if (m.assigneeId && !seen.has(m.assigneeId)) {
        seen.set(m.assigneeId, m.assigneeName ?? '—')
      }
    }
    // الاسم المختصر من قائمة الفريق أدقّ عند غيابه في الصف
    for (const [id] of seen) {
      const tm = (members ?? []).find((x) => x.id === id)
      if (tm) seen.set(id, tm.short_name ?? tm.name)
    }
    return [...seen].map(([id, name]) => ({ id, name }))
  }, [rows, members])

  const unassignedCount = rows.filter((m) => !m.assigneeId).length

  const pickKind = (v: MatterKind | 'all') => {
    setKind(v)
    setStatus('all') // حالات النوع السابق لا معنى لها في الجديد
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">المشاريع</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            القضايا والاستشارات واللوائح والتوثيق العقاري — في مكان واحد
          </p>
        </div>
        <Button variant="gold" onClick={() => setPicking(true)}>
          <Plus className="h-4 w-4" />
          مشروع جديد
        </Button>
      </div>

      {/* التصفية */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-muted p-1 text-sm">
          {(
            [
              ['all', `الكل ${fmtNumber(rows.length)}`],
              ['case', `⚖️ قضايا ${fmtNumber(countOf('case'))}`],
              ['legal_service', `📝 استشارات ولوائح ${fmtNumber(countOf('legal_service'))}`],
              ['property', `🏠 توثيق عقاري ${fmtNumber(countOf('property'))}`],
              ['bankruptcy', `🏦 إجراءات إفلاس ${fmtNumber(countOf('bankruptcy'))}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => pickKind(value as MatterKind | 'all')}
              className={cn(
                'rounded-full px-4 py-1.5 transition-colors',
                kind === value
                  ? 'bg-card font-semibold text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <Select value={assignee} onValueChange={setAssignee}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="المسند إليه" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المسؤولين</SelectItem>
            {unassignedCount > 0 && (
              <SelectItem value="none">
                بلا إسناد ({fmtNumber(unassignedCount)})
              </SelectItem>
            )}
            {assignees.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم أو الموكّل أو الرقم…"
            className="pr-9"
          />
        </div>
      </div>

      {/* صف الفرز الثاني: حالات التصنيف المختار (منتهية/جارية…) */}
      {kind !== 'all' && (
        <div className="-mx-1 flex flex-wrap gap-1.5 px-1">
          <StatusChip
            label={`الكل ${fmtNumber(countOf(kind))}`}
            active={status === 'all'}
            onClick={() => setStatus('all')}
          />
          {STATUSES[kind].map((s) => {
            const n = statusCount(s.value)
            return (
              <StatusChip
                key={s.value}
                label={`${s.label} ${fmtNumber(n)}`}
                active={status === s.value}
                dim={n === 0}
                onClick={() => setStatus(s.value)}
              />
            )
          })}
        </div>
      )}

      {/* القائمة */}
      {error ? (
        <QueryErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full rounded-2xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title="لا مشاريع بعد"
          description="ابدأ بإنشاء أول مشروع — قضية أو استشارة أو توثيق عقاري"
          actionLabel="مشروع جديد"
          onAction={() => setPicking(true)}
        />
      ) : filtered.length === 0 ? (
        <FilteredEmptyState onClear={() => { setKind('all'); setStatus('all'); setAssignee('all'); setQ('') }} />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const meta = KINDS[m.kind]
            const st = statusOf(m)
            return (
              <button
                key={m.key}
                onClick={() => navigate(m.href)}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-border/70 bg-card p-4 text-right transition-all hover:border-gold/50 hover:shadow-sm"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl',
                    meta.chip
                  )}
                  aria-label={meta.label}
                >
                  {matterKindEmoji(m.kind)}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-foreground">
                      {m.title}
                    </span>
                    {m.ref && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        <Ltr>{m.ref}</Ltr>
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span className={cn('rounded px-1.5 py-0.5', meta.chip)}>
                      {meta.label}
                    </span>
                    {m.client && <span className="truncate">{m.client}</span>}
                    {m.assigneeName && (
                      <span className="truncate">
                        <UserRound className="ms-0.5 inline h-3 w-3 align-[-2px]" />{' '}
                        {m.assigneeName}
                      </span>
                    )}
                    {m.date && <span>{fmtDatePref(m.date)}</span>}
                  </span>
                </span>

                <Badge variant={st.badge} className="shrink-0">
                  {st.label}
                </Badge>
              </button>
            )
          })}
        </div>
      )}

      {/* منتقي النوع — «مشروع جديد» يسأل النوع أولاً ثم يفتح النموذج الصحيح */}
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ما نوع المشروع؟</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {(
              [
                ['case', 'قضية', 'دعوى أمام محكمة — جلسات وأحكام ومذكرات'],
                ['legal_service', 'استشارة / لائحة', 'استشارة قانونية أو صياغة لائحة أو عقد'],
                ['property', 'توثيق عقاري', 'نقل ملكية عقار بين بائع ومشترٍ'],
                ['bankruptcy', 'إجراء إفلاس', 'تسوية وقائية أو إعادة تنظيم مالي أو تصفية'],
              ] as const
            ).map(([k, label, desc]) => {
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setPicking(false)
                    if (k === 'case') navigate('/cases/new')
                    else if (k === 'bankruptcy') navigate('/cases/new?kind=bankruptcy')
                    else setCreating(k)
                  }}
                  className="flex items-center gap-3 rounded-xl border border-border/70 p-3.5 text-right transition-all hover:border-gold/60 hover:bg-gold/5"
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl', KINDS[k].chip)}>
                    {matterKindEmoji(k)}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-foreground">{label}</span>
                    <span className="block text-xs text-muted-foreground">{desc}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* نموذجا الاستشارة والتوثيق — كما هما، داخل نافذة */}
      <Dialog open={creating === 'legal_service'} onOpenChange={(v) => !v && setCreating(null)}>
        <DialogContent className="max-w-2xl">
          <LegalServiceForm onDone={() => { setCreating(null); refetch() }} />
        </DialogContent>
      </Dialog>
      <Dialog open={creating === 'property'} onOpenChange={(v) => !v && setCreating(null)}>
        <DialogContent className="max-w-2xl">
          <PropertyTransferForm onDone={() => { setCreating(null); refetch() }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// شريحة حالة في صف الفرز الثاني
function StatusChip({
  label,
  active,
  dim = false,
  onClick,
}: {
  label: string
  active: boolean
  dim?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-gold bg-gold text-navy'
          : 'border-border bg-card text-muted-foreground hover:bg-muted',
        // الحالات الفارغة باهتة لكنها تبقى قابلة للضغط (تُظهر الفراغ صراحةً)
        !active && dim && 'opacity-50'
      )}
    >
      {label}
    </button>
  )
}
