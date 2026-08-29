import { useMemo } from 'react'
import {
  Cog,
  Gavel,
  CalendarDays,
  ListTodo,
  Timer,
  FileText,
  Sparkles,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react'

import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { EmptyState } from '@/components/EmptyState'
import { cn } from '@/lib/utils'
import { fmtDate, fmtTime, localISO } from '@/lib/format'
import { useMatterEvents, type MatterEvent } from '@/hooks/useMatterEvents'

// «سير الملف» — قصة الملف من ميلاده: من فعل ماذا ومتى.
// أسطر النظام هادئة بصيغة المتكلم (⚙)، والأحداث البشرية بطاقات أوضح.
// هذا هو السجل الذي يُطبع لاحقاً «محضرَ ملف» دفاعياً.

const KIND_ICON: Record<string, LucideIcon> = {
  birth: Sparkles,
  session: CalendarDays,
  ruling: Gavel,
  deadline: Timer,
  task: ListTodo,
  doc: FileText,
  note: MessageSquare,
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const localTime = (iso: string) => {
  const d = new Date(iso)
  return fmtTime(`${pad2(d.getHours())}:${pad2(d.getMinutes())}`)
}

export function MatterStory({ matterId }: { matterId: string }) {
  const { data, isLoading, isError, error, refetch } = useMatterEvents(matterId)

  // تجميع بالأيام — فاصل تاريخ لكل يوم، والأحدث أولاً
  const days = useMemo(() => {
    const map = new Map<string, MatterEvent[]>()
    for (const e of data ?? []) {
      // created_at يصل UTC — التجميع والعرض بتوقيت الرياض المحلي
      const day = localISO(new Date(e.created_at))
      if (!map.has(day)) map.set(day, [])
      map.get(day)!.push(e)
    }
    return [...map.entries()]
  }, [data])

  if (isLoading)
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    )

  if (isError)
    return (
      <QueryErrorState
        title="تعذّر تحميل سير الملف"
        error={error}
        onRetry={() => refetch()}
      />
    )

  if (!days.length)
    return (
      <EmptyState
        icon={Sparkles}
        title="لا قصة بعد"
        description="أول حدث يُسجَّل على الملف سيظهر هنا — تلقائياً."
      />
    )

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        كل سطرٍ موثّق بوقته — وهذا مصدر «محضر الملف» عند طلبه.
      </p>
      {days.map(([day, events]) => (
        <div key={day}>
          <div className="mb-2 flex items-center gap-3">
            <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
              {fmtDate(day)}
            </span>
            <span className="h-px flex-1 bg-border/60" />
          </div>
          <div className="space-y-1.5">
            {events.map((e) => {
              const system = !e.actor
              const Icon = KIND_ICON[e.kind] ?? Cog
              return (
                <div
                  key={e.id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl px-3 py-2',
                    system
                      ? 'text-[13px] text-muted-foreground'
                      : 'bg-card text-sm shadow-[0_1px_3px_rgba(17,29,58,0.06)]'
                  )}
                >
                  <span
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg',
                      system
                        ? 'bg-muted text-muted-foreground/70'
                        : 'bg-gold/15 text-gold-600 dark:text-gold-300'
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 leading-relaxed">
                    {!system && (
                      <b className="me-1 font-semibold text-foreground">
                        {e.actor_name ?? '—'}:
                      </b>
                    )}
                    {e.sentence}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
                    {localTime(e.created_at)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {(data?.length ?? 0) >= 80 && (
        <p className="text-center text-[11px] text-muted-foreground">
          يُعرض آخر 80 حدثاً — المحضر المطبوع يشمل القصة كاملة.
        </p>
      )}
    </div>
  )
}
