import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import {
  UserPlus,
  Phone,
  ChevronLeft,
  FileText,
  Award,
  Scale,
  Sparkles,
  Loader2,
  Square,
  GraduationCap,
  ArrowDownWideNarrow,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState, FilteredEmptyState } from '@/components/EmptyState'
import { QueryErrorState } from '@/components/QueryErrorState'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { toast } from '@/hooks/use-toast'
import { useAuth } from '@/stores/auth'
import { useStaffApplications } from '@/hooks/useStaffApplications'
import { useAnalyzeApplicant, useApplicantAnalyses, type SavedAnalysis } from '@/hooks/useAiAnalysis'
import { usePageState } from '@/hooks/usePageState'
import {
  APP_STATUS_OPTIONS,
  appStatusBadge,
  appStatusLabel,
  idTypeLabel,
} from './labels'
import type { StaffApplication, StaffApplicationStatus } from '@/types/db'
import { TeamNavTabs } from '@/features/team/TeamNavTabs'

type Filter = StaffApplicationStatus | 'all'

/** فرز السير وتصفيتها بما قرأه الذكاء منها (طلب المدير 2026-10-19) */
type SortKey = 'newest' | 'fit' | 'gpa' | 'experience' | 'graduation'
const SORTS: { value: SortKey; label: string }[] = [
  { value: 'newest', label: 'الأحدث تقديماً' },
  { value: 'fit', label: 'مؤشر الملاءمة' },
  { value: 'gpa', label: 'المعدل' },
  { value: 'experience', label: 'سنوات الخبرة' },
  { value: 'graduation', label: 'الأحدث تخرجاً' },
]
type FacetKey = 'university' | 'major' | 'degree' | 'suggested_role'
const FACETS: { key: FacetKey; label: string }[] = [
  { key: 'university', label: 'الجامعة' },
  { key: 'major', label: 'التخصص' },
  { key: 'degree', label: 'الدرجة' },
  { key: 'suggested_role', label: 'الوظيفة المقترحة' },
]
const ANY = '__any'
const sortValue = (an: SavedAnalysis | undefined, k: SortKey): number => {
  if (!an) return -1
  if (k === 'fit') return an.fit_score ?? -1
  if (k === 'gpa') return an.gpa_pct ?? -1
  if (k === 'experience') return an.experience_num ?? -1
  if (k === 'graduation') return Number(an.graduation_year) || -1
  return -1
}

export function StaffApplicationsPage() {
  const { data, isLoading, isError, error, refetch } = useStaffApplications('all')
  const [, navigate] = useLocation()
  const [filter, setFilter] = usePageState<Filter>('apps:filter', 'all')
  const [sort, setSort] = usePageState<SortKey>('apps:sort', 'newest')
  const [facet, setFacet] = usePageState<Partial<Record<FacetKey, string>>>('apps:facet', {})
  const { teamMember } = useAuth()
  const analyzeM = useAnalyzeApplicant()
  const { data: analyses } = useApplicantAnalyses()

  // تحليل كل الطلبات المعلّقة ذات السير غير المحلَّلة — واحداً تلو الآخر
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null)
  // علم الإلغاء: يضبطه زر «إيقاف» أو مغادرة الصفحة، وتفحصه الحلقة قبل كل عنصر
  const cancelRef = useRef(false)
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      cancelRef.current = true
    }
  }, [])

  const runBatchAnalysis = async () => {
    if (batch) return
    const analyzedIds = new Set((analyses ?? []).map((x) => x.application_id))
    const targets = (data ?? []).filter(
      (a) =>
        (a.status ?? 'pending') === 'pending' &&
        !!a.cv_url &&
        !analyzedIds.has(a.id)
    )
    if (targets.length === 0) {
      toast({ title: 'لا طلبات معلّقة (بسيرة ذاتية) تحتاج تحليلاً' })
      return
    }
    cancelRef.current = false
    setBatch({ done: 0, total: targets.length })
    let ok = 0
    for (const a of targets) {
      if (cancelRef.current) break
      try {
        await analyzeM.mutateAsync({
          application_id: a.id,
          analyzed_by: teamMember?.name ?? null,
          full_name: a.full_name,
          qualifications: a.qualifications,
          email: a.email,
          cv_url: a.cv_url,
        })
        ok++
      } catch {
        /* الهوك يعرض الخطأ — نكمل البقية */
      }
      if (mountedRef.current)
        setBatch((b) => (b ? { done: b.done + 1, total: b.total } : b))
    }
    if (!mountedRef.current) return
    setBatch(null)
    if (cancelRef.current) {
      toast({
        title: `أُوقف التحليل — اكتمل ${fmtNumber(ok)} من ${fmtNumber(targets.length)}`,
      })
      return
    }
    toast({
      variant: 'success',
      title: `اكتمل تحليل ${fmtNumber(ok)} من ${fmtNumber(targets.length)} متقدماً`,
      description: 'اسأل المساعد الذكي الآن: «من أفضل المتقدمين؟»',
    })
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: data?.length ?? 0 }
    for (const a of data ?? []) {
      const s = a.status ?? 'pending'
      c[s] = (c[s] ?? 0) + 1
    }
    return c
  }, [data])

  const byApp = useMemo(() => new Map((analyses ?? []).map((x) => [x.application_id, x])), [analyses])

  // قيم كل فلتر من التحليلات نفسها، بعددها — الأكثر أولاً
  const facetOptions = useMemo(() => {
    const out = {} as Record<FacetKey, { value: string; count: number }[]>
    for (const f of FACETS) {
      const m = new Map<string, number>()
      for (const x of analyses ?? []) {
        const v = (x[f.key] ?? '').trim()
        if (v) m.set(v, (m.get(v) ?? 0) + 1)
      }
      out[f.key] = [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count)
    }
    return out
  }, [analyses])

  const facetActive = FACETS.some((f) => facet[f.key])
  const list = useMemo(() => {
    let rows = filter === 'all' ? data ?? [] : (data ?? []).filter((a) => (a.status ?? 'pending') === filter)
    if (facetActive) {
      rows = rows.filter((a) => {
        const an = byApp.get(a.id)
        return FACETS.every((f) => !facet[f.key] || (an?.[f.key] ?? '').trim() === facet[f.key])
      })
    }
    if (sort !== 'newest') {
      rows = [...rows].sort((x, y) => sortValue(byApp.get(y.id), sort) - sortValue(byApp.get(x.id), sort))
    }
    return rows
  }, [data, filter, facet, facetActive, sort, byApp])

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          طلبات التوظيف{' '}
          {!isLoading && !isError && (
            <span className="text-base font-normal text-muted-foreground">
              ({fmtNumber(data?.length ?? 0)})
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="border-violet-300 text-violet-700 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40"
            onClick={runBatchAnalysis}
            disabled={!!batch || isLoading}
          >
            {batch ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                جارٍ التحليل {fmtNumber(batch.done)}/{fmtNumber(batch.total)}…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                تحليل الكل بالذكاء الاصطناعي
              </>
            )}
          </Button>
          {batch && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                cancelRef.current = true
              }}
            >
              <Square className="h-4 w-4" />
              إيقاف
            </Button>
          )}
        </div>
      </div>

      {/* التنقل: الموظفون / طلبات التوظيف */}
      <TeamNavTabs active="applications" />

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

      {/* الفرز والتصفية بما قرأه الذكاء من السير */}
      {(analyses?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-violet-200/70 bg-violet-50/40 p-2.5 dark:border-violet-900/50 dark:bg-violet-950/20">
          <span className="flex items-center gap-1.5 px-1 text-xs font-medium text-violet-700 dark:text-violet-300">
            <Sparkles className="h-3.5 w-3.5" /> من قراءة السير
          </span>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="h-8 w-auto min-w-36 gap-1.5 bg-background text-xs">
              <ArrowDownWideNarrow className="h-3.5 w-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {FACETS.map((f) => (
            facetOptions[f.key].length > 0 && (
              <Select key={f.key} value={facet[f.key] ?? ANY}
                onValueChange={(v) => setFacet({ ...facet, [f.key]: v === ANY ? undefined : v })}>
                <SelectTrigger className={'h-8 w-auto min-w-28 max-w-56 bg-background text-xs ' + (facet[f.key] ? 'border-violet-400' : '')}>
                  <SelectValue placeholder={f.label} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ANY}>{f.label}: الكل</SelectItem>
                  {facetOptions[f.key].map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.value} ({fmtNumber(o.count)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          ))}
          {(facetActive || sort !== 'newest') && (
            <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => { setFacet({}); setSort('newest') }}>
              <X className="h-3.5 w-3.5" /> مسح
            </Button>
          )}
          {facetActive && (
            <span className="ms-auto text-xs text-muted-foreground">{fmtNumber(list.length)} متقدماً</span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-44 w-full" />
          ))}
        </div>
      ) : isError ? (
        <QueryErrorState
          title="تعذّر تحميل طلبات التوظيف"
          error={error}
          onRetry={() => refetch()}
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="لا توجد طلبات توظيف"
          description="تصل الطلبات من نموذج التوظيف في الموقع العام."
        />
      ) : list.length === 0 ? (
        <FilteredEmptyState onClear={() => { setFilter('all'); setFacet({}) }} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((a) => (
            <ApplicationCard
              key={a.id}
              app={a}
              analysis={byApp.get(a.id)}
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
        {fmtNumber(count)}
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
  analysis: an,
  onOpen,
}: {
  app: StaffApplication
  analysis?: SavedAnalysis
  onOpen: () => void
}) {
  const edu = [an?.degree, an?.major, an?.university].filter(Boolean).join(' · ')
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      className="flex cursor-pointer flex-col transition-colors hover:border-gold/50"
    >
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
                <Phone className="h-3 w-3" />
                <span>{a.phone}</span>
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

        {an && (
          <div className="space-y-1 rounded-xl bg-violet-50/60 px-2.5 py-2 text-xs dark:bg-violet-950/25">
            {edu && (
              <p className="flex items-start gap-1.5 text-foreground">
                <GraduationCap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-300" />
                <span className="line-clamp-2">{edu}{an.graduation_year ? ` — ${an.graduation_year}` : ''}</span>
              </p>
            )}
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
              {an.fit_score != null && <span>الملاءمة <b className="text-foreground">{fmtNumber(an.fit_score)}/10</b></span>}
              {an.gpa_pct != null && <span>المعدل <b className="text-foreground">{fmtNumber(an.gpa_pct)}٪</b></span>}
              {an.experience_num != null && (
                <span>{an.experience_num === 0 ? 'حديث تخرج' : <>خبرة <b className="text-foreground">{fmtNumber(an.experience_num)}</b> سنة</>}</span>
              )}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          <DocChip has={!!a.cv_url} icon={FileText} label="السيرة" />
          <DocChip has={!!a.qualification_doc_url} icon={Award} label="المؤهل" />
          <DocChip has={!!a.lawyer_license_url} icon={Scale} label="الرخصة" />
        </div>

        <div className="mt-auto flex justify-end pt-2">
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
