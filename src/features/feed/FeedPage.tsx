import { useMemo } from 'react'
import { useLocation } from 'wouter'
import {
  Activity,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  FileSignature,
  FileText,
  Gavel,
  Handshake,
  Landmark,
  ListTodo,
  Scale,
  Send,
  Trash2,
  type LucideIcon,
} from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState } from '@/components/EmptyState'
import { caseStatusLabel } from '@/lib/caseLabels'
import { fmtDatePref, fmtTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Ltr } from '@/components/Ltr'

// «آخر النشاط» — Firm Feed (فكرة أُعجب بها المستخدم في كليو، 2026-08-21).
// القراءة من دالة firm_feed؛ والتسجيل triggers في القاعدة تلتقط كل مصادر
// الكتابة: الويب والتطبيق والذكاء والجدولة العكسية.

interface FeedRow {
  id: string
  type: string | null
  entity: string | null
  entity_id: string | null
  title: string | null
  user_name: string | null
  case_id: string | null
  case_num: string | null
  diff_from: string | null
  diff_to: string | null
  created_at: string | null
}

const VERBS: Record<string, string> = {
  'create:case': 'فتح قضية',
  'status:case': 'غيّر حالة قضية',
  'create:session': 'جدول جلسة',
  'close:session': 'أغلق جلسة',
  'create:ruling': 'سجّل حكماً',
  'upload:document': 'رفع مستند',
  'create:task': 'أنشأ مهمة',
  'done:task': 'أنجز مهمة',
  'delete:task': 'حذف مهمة',
  'create:poa': 'أضاف وكالة',
  'create:legal_service': 'فتح استشارة / لائحة',
  'create:property': 'أنشأ توثيقاً عقارياً',
  'create:appointment': 'حجز موعداً',
  'create:engagement': 'أنشأ عقداً',
  'create:letter': 'أنشأ خطاباً صادراً',
}

const ICONS: Record<string, { icon: LucideIcon; cls: string }> = {
  case: { icon: Scale, cls: 'text-navy bg-navy/10 dark:text-navy-100 dark:bg-navy-100/10' },
  session: { icon: Gavel, cls: 'text-gold-600 bg-gold/15 dark:text-gold-300' },
  ruling: { icon: FileText, cls: 'text-purple-600 bg-purple-500/10 dark:text-purple-300' },
  document: { icon: FileText, cls: 'text-blue-600 bg-blue-500/10 dark:text-blue-300' },
  task: { icon: ListTodo, cls: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300' },
  poa: { icon: FileSignature, cls: 'text-amber-600 bg-amber-500/10 dark:text-amber-300' },
  legal_service: { icon: BookOpen, cls: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-300' },
  property: { icon: Landmark, cls: 'text-amber-700 bg-amber-500/10 dark:text-amber-300' },
  appointment: { icon: CalendarClock, cls: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300' },
  engagement: { icon: Handshake, cls: 'text-gold-600 bg-gold/15 dark:text-gold-300' },
  letter: { icon: Send, cls: 'text-blue-600 bg-blue-500/10 dark:text-blue-300' },
}

function specialIcon(row: FeedRow): { icon: LucideIcon; cls: string } | null {
  if (row.entity === 'task' && row.type === 'done')
    return { icon: CheckCircle2, cls: 'text-emerald-600 bg-emerald-500/10 dark:text-emerald-300' }
  if (row.type === 'delete')
    return { icon: Trash2, cls: 'text-destructive bg-destructive/10' }
  return null
}

function hrefOf(row: FeedRow): string | null {
  switch (row.entity) {
    case 'case': return row.entity_id ? `/cases/${row.entity_id}` : null
    case 'session':
    case 'ruling':
    case 'document': return row.case_id ? `/cases/${row.case_id}` : null
    case 'task': return row.type === 'delete' ? null : row.entity_id ? `/tasks/${row.entity_id}` : null
    case 'poa': return row.entity_id ? `/poa/${row.entity_id}` : null
    case 'legal_service': return row.entity_id ? `/legal-services/${row.entity_id}` : null
    case 'property': return row.entity_id ? `/property/${row.entity_id}` : null
    case 'appointment': return row.entity_id ? `/appointments/${row.entity_id}` : null
    case 'engagement': return row.entity_id ? `/engagements/${row.entity_id}` : null
    case 'letter': return row.entity_id ? `/outgoing/${row.entity_id}` : null
    default: return null
  }
}

function dayKey(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

function dayLabel(key: string): string {
  const today = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  const todayISO = `${today.getFullYear()}-${p(today.getMonth() + 1)}-${p(today.getDate())}`
  const y = new Date(today.getTime() - 86400000)
  const yISO = `${y.getFullYear()}-${p(y.getMonth() + 1)}-${p(y.getDate())}`
  if (key === todayISO) return 'اليوم'
  if (key === yISO) return 'أمس'
  return fmtDatePref(key)
}

export function FeedPage() {
  const [, navigate] = useLocation()
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['firm_feed'],
    staleTime: 30_000,
    queryFn: async (): Promise<FeedRow[]> => {
      const { data, error } = await supabase.rpc('firm_feed', { p_limit: 120 })
      if (error) throw error
      return (data ?? []) as FeedRow[]
    },
  })

  const groups = useMemo(() => {
    const m = new Map<string, FeedRow[]>()
    for (const r of data ?? []) {
      const k = dayKey(r.created_at)
      const list = m.get(k)
      if (list) list.push(r)
      else m.set(k, [r])
    }
    return Array.from(m.entries())
  }, [data])

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">آخر النشاط</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          من فعل ماذا ومتى — عبر المكتب كله: الويب والتطبيق والذكاء
        </p>
      </div>

      {error ? (
        <QueryErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={Activity}
          title="لا نشاط بعد"
          description="كل حركة في النظام ستُسجَّل هنا تلقائياً"
        />
      ) : (
        groups.map(([day, rows]) => (
          <div key={day} className="space-y-2">
            <p className="px-1 text-[13px] font-bold text-foreground">{dayLabel(day)}</p>
            <Card>
              <CardContent className="divide-y divide-border/60 p-2">
                {rows.map((r) => {
                  const meta = specialIcon(r) ?? ICONS[r.entity ?? ''] ?? {
                    icon: Activity,
                    cls: 'text-muted-foreground bg-muted',
                  }
                  const Icon = meta.icon
                  const verb = VERBS[`${r.type}:${r.entity}`] ?? r.type ?? ''
                  const href = hrefOf(r)
                  const time = r.created_at
                    ? fmtTime(new Date(r.created_at).toTimeString().slice(0, 5))
                    : ''
                  const content = (
                    <>
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', meta.cls)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">
                          <span className="font-semibold">{r.user_name || 'النظام'}</span>{' '}
                          <span className="text-muted-foreground">{verb}</span>{' '}
                          <span className="font-medium">«{r.title}»</span>
                          {r.type === 'status' && r.diff_to && (
                            <span className="text-muted-foreground">
                              {' '}إلى «{caseStatusLabel(r.diff_to)}»
                            </span>
                          )}
                        </span>
                        {r.case_num && (
                          <span className="block text-xs text-muted-foreground">
                            <Ltr>{r.case_num}</Ltr>
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{time}</span>
                    </>
                  )
                  return href ? (
                    <button
                      key={r.id}
                      onClick={() => navigate(href)}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-right transition-colors hover:bg-muted/60"
                    >
                      {content}
                    </button>
                  ) : (
                    <div key={r.id} className="flex w-full items-center gap-3 px-2 py-2.5 text-right">
                      {content}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        ))
      )}
    </div>
  )
}
