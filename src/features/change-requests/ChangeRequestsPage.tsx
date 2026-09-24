// اقتراحات التعديل (2026-09-24) — كل اقتراح بصفحته ولقطته وحالته والرد عليه.
// الموظف يرى اقتراحاته، والمدير الكل ويغيّر الحالة ويردّ (القاعدة تفرض ذلك).
import { useMemo, useState } from 'react'
import { useLocation } from 'wouter'
import { ExternalLink, Lightbulb, Loader2, MapPin, MessageSquareReply } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/EmptyState'
import { QueryErrorState } from '@/components/QueryErrorState'
import { FilePreviewDialog } from '@/components/FilePreviewDialog'
import { useIsDirector } from '@/hooks/useIsDirector'
import {
  useChangeRequests,
  useUpdateChangeRequest,
  type ChangeRequest,
  type ChangeRequestStatus,
} from '@/hooks/useChangeRequests'
import { fmtDateTime, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const STATUS: Record<ChangeRequestStatus, { label: string; className: string }> = {
  new: { label: 'جديد', className: 'bg-gold/15 text-gold-600 dark:text-gold-300' },
  in_progress: { label: 'قيد التنفيذ', className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  done: { label: 'نُفّذ', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  declined: { label: 'لن يُنفَّذ', className: 'bg-muted text-muted-foreground' },
}

type Filter = 'open' | 'done' | 'all'
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'open', label: 'المفتوحة' },
  { value: 'done', label: 'المنتهية' },
  { value: 'all', label: 'الكل' },
]

export function ChangeRequestsPage() {
  const isDirector = useIsDirector()
  const { data, isLoading, error, refetch } = useChangeRequests()
  const [filter, setFilter] = useState<Filter>('open')

  const rows = useMemo(() => {
    const all = data ?? []
    if (filter === 'open') return all.filter((r) => r.status === 'new' || r.status === 'in_progress')
    if (filter === 'done') return all.filter((r) => r.status === 'done' || r.status === 'declined')
    return all
  }, [data, filter])

  const openCount = (data ?? []).filter((r) => r.status === 'new' || r.status === 'in_progress').length

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            <Lightbulb className="h-6 w-6 text-gold" />
            اقتراحات التعديل
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isDirector ? 'كل ما اقترحه الفريق' : 'اقتراحاتك'} على النظام — من زرّ
            <Lightbulb className="mx-1 inline h-3.5 w-3.5 text-gold" />
            في أعلى كل صفحة.
          </p>
        </div>
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {f.label}
              {f.value === 'open' && openCount > 0 && ` (${fmtNumber(openCount)})`}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <QueryErrorState title="تعذّر تحميل الاقتراحات" error={error} onRetry={() => refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Lightbulb}
          title={filter === 'open' ? 'لا اقتراحات مفتوحة' : 'لا اقتراحات'}
          description="في أي صفحة، اضغط المصباح في الأعلى واكتب ما تريد أن يتغيّر."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <RequestCard key={r.id} r={r} isDirector={isDirector} />
          ))}
        </div>
      )}
    </div>
  )
}

function RequestCard({ r, isDirector }: { r: ChangeRequest; isDirector: boolean }) {
  const [, navigate] = useLocation()
  const update = useUpdateChangeRequest()
  const [reply, setReply] = useState(r.reply ?? '')
  const [replying, setReplying] = useState(false)
  const [preview, setPreview] = useState(false)
  const st = STATUS[r.status]

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', st.className)}>{st.label}</span>
            {isDirector && r.author && (
              <span className="font-medium text-foreground">{r.author.short_name || r.author.name}</span>
            )}
            <span>{fmtDateTime(r.created_at)}</span>
            {r.platform === 'ios' && <Badge variant="outline" className="text-[10px]">الآيفون</Badge>}
          </div>
          {r.page_path && (
            <button
              type="button"
              onClick={() => navigate(r.page_path!)}
              className="flex items-center gap-1 text-xs text-gold-600 hover:underline dark:text-gold-300"
              title="افتح الصفحة التي اقتُرح منها"
            >
              <MapPin className="h-3.5 w-3.5" />
              {r.page_title || r.page_path}
              <ExternalLink className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex gap-3">
          <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm text-foreground">{r.body}</p>
          {r.screenshot_url && (
            <button
              type="button"
              onClick={() => setPreview(true)}
              className="shrink-0 overflow-hidden rounded-lg border transition-opacity hover:opacity-80"
              title="اللقطة كاملة"
            >
              <img src={r.screenshot_url} alt="لقطة الصفحة" className="h-20 w-32 object-cover object-top" />
            </button>
          )}
        </div>

        {r.reply && !replying && (
          <div className="rounded-xl border-s-2 border-gold bg-gold/5 px-3 py-2 text-sm">
            <p className="mb-0.5 text-xs font-semibold text-gold-600 dark:text-gold-300">
              الرد{r.replied_at && ` · ${fmtDateTime(r.replied_at)}`}
            </p>
            <p className="whitespace-pre-wrap text-foreground">{r.reply}</p>
          </div>
        )}

        {isDirector && (
          <div className="space-y-2 border-t pt-3">
            {replying && (
              <Textarea
                autoFocus
                rows={3}
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="ماذا عُمل فيه؟ يصل صاحبه إشعاراً بالرد."
              />
            )}
            <div className="flex flex-wrap items-center gap-1.5">
              {(Object.keys(STATUS) as ChangeRequestStatus[]).map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={r.status === s ? 'default' : 'outline'}
                  className="h-7 text-xs"
                  disabled={update.isPending || r.status === s}
                  onClick={() => update.mutate({ id: r.id, status: s })}
                >
                  {STATUS[s].label}
                </Button>
              ))}
              <span className="flex-1" />
              {replying ? (
                <Button
                  size="sm"
                  variant="gold"
                  className="h-7 text-xs"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({ id: r.id, reply }, { onSuccess: () => setReplying(false) })
                  }
                >
                  {update.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  حفظ الرد
                </Button>
              ) : (
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setReplying(true)}>
                  <MessageSquareReply className="h-3.5 w-3.5" />
                  {r.reply ? 'عدّل الرد' : 'ردّ'}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>

      {preview && r.screenshot_url && (
        <FilePreviewDialog
          open
          onOpenChange={setPreview}
          fileUrl={r.screenshot_url}
          fileName="لقطة الصفحة.jpg"
        />
      )}
    </Card>
  )
}
