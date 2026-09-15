// سجل الأخطاء — للمدير (طلب 2026-09-15: «ليه إذا صار فيه خطأ ما يتسجل عندنا وانت تطلع على
// الأخطاء ونصلحها؟»). كل خطأ ظهر لموظف: المتكرر في سطر واحد بعدد مراته وآخر ظهوره ومن واجهه
// وأين، ويُفتح لتفاصيله. المسح بعد الإصلاح للمدير وحده — تفرضه القاعدة لا الواجهة.
import { useMemo, useState } from 'react'
import { AlertTriangle, Bug, ChevronDown, Loader2, RefreshCw, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Ltr } from '@/components/Ltr'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useDeleteErrorLogs, useErrorLogs, type ErrorLogRow } from '@/hooks/useErrorLogs'
import { errMessage } from '@/lib/errors'
import { arPlural, fmtDateTime, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = {
  toast: 'رسالة خطأ',
  query: 'فشل جلب',
  crash: 'عطل صفحة',
  unhandled: 'خطأ غير ملتقط',
  ios: 'تطبيق الآيفون',
  case_study: 'دراسة القضية',
  upload: 'رفع ملف',
}

type Range = 'day' | 'week' | 'all'
const RANGES: { value: Range; label: string }[] = [
  { value: 'day', label: 'آخر 24 ساعة' },
  { value: 'week', label: 'آخر 7 أيام' },
  { value: 'all', label: 'الكل' },
]

// المتشابه يُجمع: المعرّفات والأرقام الطويلة تختلف بين المرات والخطأ واحد
const groupKey = (r: ErrorLogRow) =>
  `${r.error_type ?? ''}|${(r.message ?? '')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '…')
    .replace(/\d{3,}/g, '#')
    .trim()}`

interface Group {
  key: string
  type: string
  message: string
  rows: ErrorLogRow[]
  last: string
  users: string[]
  screens: string[]
}

export function ErrorLogPage() {
  const isDirector = useIsDirector()
  const { data, isLoading, error, refetch, isFetching } = useErrorLogs()
  const del = useDeleteErrorLogs()
  const [open, setOpen] = useState<string | null>(null)
  const [range, setRange] = useState<Range>('week')

  const groups = useMemo(() => {
    const now = Date.now()
    const since = range === 'day' ? now - 864e5 : range === 'week' ? now - 7 * 864e5 : 0
    const map = new Map<string, Group>()
    // الصفوف مرتبة بالأحدث، فأول صف في كل مجموعة هو آخر ظهور لها
    for (const r of data ?? []) {
      if (new Date(r.created_at).getTime() < since) continue
      const k = groupKey(r)
      let g = map.get(k)
      if (!g) {
        g = { key: k, type: r.error_type ?? '', message: r.message ?? '—', rows: [], last: r.created_at, users: [], screens: [] }
        map.set(k, g)
      }
      g.rows.push(r)
      if (r.user_name && !g.users.includes(r.user_name)) g.users.push(r.user_name)
      if (r.url && !g.screens.includes(r.url)) g.screens.push(r.url)
    }
    return [...map.values()].sort((a, b) => b.last.localeCompare(a.last))
  }, [data, range])

  const last24 = useMemo(
    () => (data ?? []).filter((r) => Date.now() - new Date(r.created_at).getTime() < 864e5).length,
    [data]
  )
  const people = useMemo(() => new Set(groups.flatMap((g) => g.users)).size, [groups])

  if (!isDirector) {
    return (
      <div className="mx-auto max-w-3xl p-6 text-sm text-muted-foreground">
        سجل الأخطاء للمدير وحده.
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <Bug className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-bold text-foreground">سجل الأخطاء</h1>
            <p className="text-sm text-muted-foreground">
              كل خطأ ظهر لموظف في الموقع — المتكرر في سطر واحد
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-muted p-1 text-sm">
            {RANGES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                className={cn(
                  'rounded-lg px-3 py-1 transition-colors',
                  range === r.value
                    ? 'bg-card font-semibold text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            title="تحديث"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Stat label="آخر 24 ساعة" value={last24} danger={last24 > 0} />
        <Stat label="أنواع مختلفة في المدة" value={groups.length} />
        <Stat label="موظفون واجهوها" value={people} />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-destructive">
            تعذّر تحميل السجل: {errMessage(error)}
          </CardContent>
        </Card>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            لا أخطاء في هذه المدة.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <GroupCard
              key={g.key}
              g={g}
              open={open === g.key}
              onToggle={() => setOpen(open === g.key ? null : g.key)}
              deleting={del.isPending}
              onDelete={() => del.mutate(g.rows.map((r) => r.id))}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, danger }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card px-4 py-3">
      <p
        className={cn(
          'text-2xl font-bold tabular-nums',
          danger ? 'text-destructive' : 'text-foreground'
        )}
      >
        {fmtNumber(value)}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

function GroupCard({
  g,
  open,
  onToggle,
  onDelete,
  deleting,
}: {
  g: Group
  open: boolean
  onToggle: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const [confirming, setConfirming] = useState(false)
  const count = g.rows.length

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-3 p-4 text-right">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive">
          <AlertTriangle className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 break-words text-sm font-semibold text-foreground">
            {g.message}
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <Badge variant="secondary">{TYPE_LABEL[g.type] ?? g.type}</Badge>
            <span className="font-medium text-foreground">
              {count === 1 ? 'مرة واحدة' : arPlural(count, { one: 'مرة', two: 'مرتان', many: 'مرات' })}
            </span>
            <span>آخرها {fmtDateTime(g.last)}</span>
            {g.users.length > 0 && (
              <span>
                · {g.users.slice(0, 3).join('، ')}
                {g.users.length > 3 ? ` و${fmtNumber(g.users.length - 3)} غيرهم` : ''}
              </span>
            )}
          </span>
          {g.screens.length > 0 && (
            <span className="mt-1.5 flex flex-wrap gap-1">
              {g.screens.slice(0, 3).map((s) => (
                <Ltr key={s} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {s}
                </Ltr>
              ))}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn('mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 bg-muted/30 p-4">
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {g.rows.slice(0, 50).map((r) => (
              <div key={r.id} className="rounded-xl bg-card p-3 text-xs">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                  <span>{fmtDateTime(r.created_at)}</span>
                  {r.user_name && <span>· {r.user_name}</span>}
                  {r.url && <Ltr>{r.url}</Ltr>}
                  {r.source && r.source !== 'web' && (
                    <Ltr className="text-muted-foreground/70">{r.source}</Ltr>
                  )}
                </div>
                {r.message !== g.message && (
                  <p className="mt-1 break-words text-foreground">{r.message}</p>
                )}
                {r.stack && (
                  <pre
                    dir="ltr"
                    className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 text-[10px] leading-relaxed text-muted-foreground"
                  >
                    {r.stack}
                  </pre>
                )}
              </div>
            ))}
            {count > 50 && (
              <p className="text-center text-xs text-muted-foreground">
                تُعرض آخر 50 من {fmtNumber(count)}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {confirming ? (
              <>
                <span className="text-xs text-muted-foreground">
                  تمسح{' '}
                  {count === 1 ? 'سجلاً واحداً' : arPlural(count, { one: 'سجلاً', two: 'سجلين', many: 'سجلات' })}{' '}
                  نهائياً؟
                </span>
                <Button size="sm" variant="destructive" onClick={onDelete} disabled={deleting}>
                  {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                  نعم، امسح
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                  تراجع
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-destructive"
                onClick={() => setConfirming(true)}
              >
                <Trash2 className="h-4 w-4" />
                أُصلح — امسحه من السجل
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
