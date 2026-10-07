// سجل المساعد الذكي — للمدير (طلب 2026-10-01: «فيه سجل لاستخدام المساعد الذكي؟» ← «نعم، سوّه»).
// كل طلب: من سأل ومتى، والطلب والرد، والإجراءات المنفّذة فعلاً، والأدوات التي فشلت، وهل اكتمل —
// لتُعرف حقيقة ما فعله المساعد لا ما قاله (وُلد من «ورد علي تم، ولا حصلت القضية»).
import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, RefreshCw, Sparkles, XCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { supabase } from '@/lib/supabase'
import { useIsDirector } from '@/hooks/useIsDirector'
import { errMessage } from '@/lib/errors'
import { fmtDateTime, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

interface RunRow {
  id: string
  created_at: string
  user_name: string | null
  request: string | null
  reply: string | null
  tools: string[]
  failed_tools: string[]
  actions: string[]
  finished: boolean
  ms: number | null
  model: string | null
  error: string | null
}

// أسماء الأدوات كما يفهمها المدير
const TOOL_LABEL: Record<string, string> = {
  create_matter: 'فتح ملف',
  create_session: 'إضافة جلسة',
  create_task: 'إنشاء مهمة',
  create_appointment: 'حجز موعد',
  create_contact: 'إضافة عميل',
  create_outgoing_letter: 'خطاب صادر',
  update_case: 'تعديل ملف',
  update_contact: 'تعديل عميل',
  update_task: 'تعديل مهمة',
  send_sms: 'إرسال SMS',
  post_discussion_message: 'رسالة في نقاش',
  save_attachment: 'حفظ مرفق',
  link_document_to_case: 'ربط مستند بملف',
  search_cases: 'بحث في الملفات',
  search_contacts: 'بحث في الجهات',
  search_poas: 'بحث في الوكالات',
  search_documents: 'بحث في المستندات',
  search_discussions: 'بحث في النقاشات',
  search_messages: 'بحث في الرسائل',
  get_case_details: 'تفاصيل ملف',
  list_sessions: 'قائمة الجلسات',
  list_tasks: 'قائمة المهام',
  list_appointments: 'قائمة المواعيد',
  list_expiring_poas: 'وكالات تنتهي',
  list_staff_applications: 'طلبات التوظيف',
  list_applicant_analyses: 'تحليل المتقدمين',
  office_overview: 'نظرة على المكتب',
}
const toolLabel = (t: string) => TOOL_LABEL[t] ?? t

type Filter = 'all' | 'problems' | 'actions'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'الكل' },
  { value: 'actions', label: 'نفّذ إجراءات' },
  { value: 'problems', label: 'فيه مشكلة' },
]

const isProblem = (r: RunRow) => !r.finished || r.failed_tools.length > 0 || !!r.error

export function AssistantLogPage() {
  const isDirector = useIsDirector()
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['ai_assistant_runs'],
    enabled: isDirector,
    queryFn: async (): Promise<RunRow[]> => {
      const { data, error } = await supabase
        .from('ai_assistant_runs')
        .select('id, created_at, user_name, request, reply, tools, failed_tools, actions, finished, ms, model, error')
        .order('created_at', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as RunRow[]
    },
  })

  const rows = useMemo(
    () =>
      (data ?? []).filter((r) =>
        filter === 'problems' ? isProblem(r) : filter === 'actions' ? r.actions.length > 0 : true
      ),
    [data, filter]
  )
  const stats = useMemo(() => {
    const month = (data ?? []).filter((r) => Date.now() - new Date(r.created_at).getTime() < 30 * 864e5)
    return {
      total: month.length,
      users: new Set(month.map((r) => r.user_name).filter(Boolean)).size,
      actions: month.reduce((n, r) => n + r.actions.length, 0),
      problems: month.filter(isProblem).length,
    }
  }, [data])

  if (!isDirector) {
    return <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">سجل المساعد الذكي للمدير وحده.</div>
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gold/15 text-gold">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">سجل المساعد الذكي</h1>
            <p className="text-sm text-muted-foreground">كل طلب: ما طُلب، وما نفّذه المساعد فعلاً، وما فشل</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-muted p-1 text-sm">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={cn(
                  'rounded-lg px-3 py-1 transition-colors',
                  filter === f.value ? 'bg-card font-semibold text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" onClick={() => refetch()} title="تحديث">
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'طلبات آخر 30 يوماً', value: stats.total },
          { label: 'من استخدمه', value: stats.users },
          { label: 'إجراءات نُفّذت', value: stats.actions },
          { label: 'طلبات فيها مشكلة', value: stats.problems, warn: stats.problems > 0 },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className={cn('text-2xl font-bold tabular-nums', s.warn ? 'text-amber-600' : 'text-foreground')}>
                {fmtNumber(s.value)}
              </p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">تعذّر تحميل السجل — {errMessage(error)}</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filter === 'all' ? 'لا طلبات مسجّلة بعد — يبدأ السجل من اليوم.' : 'لا شيء في هذا التصنيف.'}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const expanded = open === r.id
            const problem = isProblem(r)
            return (
              <Card key={r.id} className={cn(problem && 'border-amber-500/40')}>
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : r.id)}
                  className="flex w-full items-start gap-3 p-4 text-right"
                >
                  <span
                    className={cn(
                      'mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full',
                      problem ? 'bg-amber-500/15 text-amber-600' : r.actions.length ? 'bg-emerald-500/15 text-emerald-600' : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {problem ? <AlertTriangle className="h-4 w-4" /> : r.actions.length ? <CheckCircle2 className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 whitespace-pre-wrap text-sm text-foreground">{r.request || '—'}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground/80">{r.user_name ?? '—'}</span>
                      <span>· {fmtDateTime(r.created_at)}</span>
                      {r.ms != null && <span>· {fmtNumber(Math.round(r.ms / 1000))} ث</span>}
                      {r.actions.length > 0 && <Badge variant="success">{fmtNumber(r.actions.length)} إجراء</Badge>}
                      {r.failed_tools.length > 0 && <Badge variant="destructive">فشل: {r.failed_tools.map(toolLabel).join('، ')}</Badge>}
                      {!r.finished && <Badge variant="warning">لم يكتمل</Badge>}
                    </div>
                  </div>
                  <ChevronDown className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
                </button>
                {expanded && (
                  <CardContent className="space-y-3 border-t border-border/50 pt-3 text-sm">
                    {r.actions.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">ما نُفّذ فعلاً</p>
                        <ul className="space-y-0.5">
                          {r.actions.map((a, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              {a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {r.tools.length > 0 && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">الأدوات بالترتيب</p>
                        <div className="flex flex-wrap gap-1">
                          {r.tools.map((t, i) => {
                            const failed = r.failed_tools.includes(t)
                            return (
                              <span
                                key={i}
                                className={cn(
                                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]',
                                  failed ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
                                )}
                              >
                                {failed && <XCircle className="h-3 w-3" />}
                                {toolLabel(t)}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {r.reply && (
                      <div>
                        <p className="mb-1 text-xs font-semibold text-muted-foreground">رد المساعد</p>
                        <p className="whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-[13px] leading-relaxed">{r.reply}</p>
                      </div>
                    )}
                    {r.error && <p className="text-xs text-destructive">{r.error}</p>}
                    {r.model && <p className="text-[11px] text-muted-foreground">النموذج: {r.model}</p>}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
