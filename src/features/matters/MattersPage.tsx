import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import {
  BookOpen,
  FolderOpen,
  Landmark,
  Plus,
  Scale,
  Search,
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
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState, FilteredEmptyState } from '@/components/EmptyState'
import { useMatters, type MatterKind, type MatterRow } from '@/hooks/useMatters'
import { LegalServiceForm } from '@/features/legal-services/LegalServiceForm'
import { PropertyTransferForm } from '@/features/property/PropertyTransferForm'
import { caseStatusLabel, caseStatusBadge } from '@/lib/caseLabels'
import { lsStatusLabel, lsStatusBadge } from '@/lib/legalServiceLabels'
import { propertyStatusLabel } from '@/lib/propertyLabels'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Ltr } from '@/components/Ltr'

// تبويب «الملفات» — نموذج Matter الموحّد (قرار المستخدم 2026-08-21).
// ثلاثة أنواع في قائمة واحدة، وسؤال «وين ملف فلان؟» صار له جواب واحد.

const KINDS: Record<
  MatterKind,
  { label: string; icon: LucideIcon; chip: string }
> = {
  case: { label: 'قضية', icon: Scale, chip: 'bg-navy/10 text-navy dark:bg-navy-100/10 dark:text-navy-100' },
  legal_service: { label: 'استشارة / لائحة', icon: BookOpen, chip: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  property: { label: 'توثيق عقاري', icon: Landmark, chip: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
}

function statusOf(m: MatterRow): { label: string; badge: any } {
  switch (m.kind) {
    case 'case':
      return { label: caseStatusLabel(m.status), badge: caseStatusBadge(m.status) }
    case 'legal_service':
      return { label: lsStatusLabel(m.status), badge: lsStatusBadge(m.status) }
    case 'property':
      return { label: propertyStatusLabel(m.status), badge: 'outline' }
  }
}

export function MattersPage() {
  const [, navigate] = useLocation()
  const { data, isLoading, error, refetch } = useMatters()

  const [kind, setKind] = useState<MatterKind | 'all'>('all')
  const [q, setQ] = useState('')
  const [picking, setPicking] = useState(false)
  const [creating, setCreating] = useState<'legal_service' | 'property' | null>(null)

  const rows = data ?? []
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((m) => {
      if (kind !== 'all' && m.kind !== kind) return false
      if (!needle) return true
      return [m.title, m.client, m.ref]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    })
  }, [rows, kind, q])

  const countOf = (k: MatterKind) => rows.filter((m) => m.kind === k).length

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* الترويسة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">الملفات</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            القضايا والاستشارات واللوائح والتوثيق العقاري — في مكان واحد
          </p>
        </div>
        <Button variant="gold" onClick={() => setPicking(true)}>
          <Plus className="h-4 w-4" />
          ملف جديد
        </Button>
      </div>

      {/* التصفية */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-muted p-1 text-sm">
          {(
            [
              ['all', `الكل ${fmtNumber(rows.length)}`],
              ['case', `قضايا ${fmtNumber(countOf('case'))}`],
              ['legal_service', `استشارات ولوائح ${fmtNumber(countOf('legal_service'))}`],
              ['property', `توثيق عقاري ${fmtNumber(countOf('property'))}`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value as MatterKind | 'all')}
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
          title="لا ملفات بعد"
          description="ابدأ بإنشاء أول ملف — قضية أو استشارة أو توثيق عقاري"
          actionLabel="ملف جديد"
          onAction={() => setPicking(true)}
        />
      ) : filtered.length === 0 ? (
        <FilteredEmptyState onClear={() => { setKind('all'); setQ('') }} />
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const meta = KINDS[m.kind]
            const Icon = meta.icon
            const st = statusOf(m)
            return (
              <button
                key={m.key}
                onClick={() => navigate(m.href)}
                className="flex w-full items-center gap-3.5 rounded-2xl border border-border/70 bg-card p-4 text-right transition-all hover:border-gold/50 hover:shadow-sm"
              >
                <span
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    meta.chip
                  )}
                >
                  <Icon className="h-5 w-5" />
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

      {/* منتقي النوع — «ملف جديد» يسأل النوع أولاً ثم يفتح النموذج الصحيح */}
      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ما نوع الملف؟</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            {(
              [
                ['case', 'قضية', 'دعوى أمام محكمة — جلسات وأحكام ومذكرات'],
                ['legal_service', 'استشارة / لائحة', 'استشارة قانونية أو صياغة لائحة أو عقد'],
                ['property', 'توثيق عقاري', 'نقل ملكية عقار بين بائع ومشترٍ'],
              ] as const
            ).map(([k, label, desc]) => {
              const Icon = KINDS[k].icon
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setPicking(false)
                    if (k === 'case') navigate('/cases/new')
                    else setCreating(k)
                  }}
                  className="flex items-center gap-3 rounded-xl border border-border/70 p-3.5 text-right transition-all hover:border-gold/60 hover:bg-gold/5"
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', KINDS[k].chip)}>
                    <Icon className="h-5 w-5" />
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
