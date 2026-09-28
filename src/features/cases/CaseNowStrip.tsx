// «الآن» في ملف القضية (مراجعة 2026-09-28، النموذج المعتمد بعد «البطاقات ودي اصغرهم شوي»):
// ثلاث بطاقات صغيرة تجيب أول ما يُفتح الملف — متى الجلسة القادمة، وما المطلوب، وآخر ما حدث —
// بدل أن يتنقّل المحامي بين التبويبات ليعرفها. قراءة فقط من الاستعلامات نفسها التي تغذّي التبويبات.
import { AlertTriangle, CalendarDays, Clock, History } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { daysLabel, fmtDatePref, fmtNumber, fmtTime, todayISO } from '@/lib/format'
import { useCaseSessions } from '@/hooks/useCaseSessions'
import { useCaseTasks } from '@/hooks/useCaseTasks'
import { useCasePOAs } from '@/hooks/usePOAs'
import { useMatterEvents } from '@/hooks/useMatterEvents'
import { useTeamMembers } from '@/hooks/useTeam'

/** الفرق بالأيام بين تاريخين YYYY-MM-DD (موجب = في المستقبل) */
const dayDiff = (iso: string, today: string) =>
  Math.round((Date.parse(iso.slice(0, 10)) - Date.parse(today)) / 864e5)

const whenLabel = (d: number) =>
  d === 0 ? 'اليوم' : d === 1 ? 'غداً' : d > 0 ? `بعد ${daysLabel(d)}` : `متأخرة ${daysLabel(-d)}`

const agoLabel = (iso: string, today: string) => {
  const d = -dayDiff(iso, today)
  return d <= 0 ? 'اليوم' : d === 1 ? 'أمس' : `قبل ${daysLabel(d)}`
}

function NowCard({
  icon: Icon,
  title,
  tone,
  children,
}: {
  icon: LucideIcon
  title: string
  tone: 'gold' | 'amber' | 'slate'
  children: React.ReactNode
}) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 bg-card px-3 py-2.5 shadow-sm">
      <div className="mb-1.5 flex items-center gap-1.5">
        <span
          className={cn(
            'grid h-6 w-6 shrink-0 place-items-center rounded-full',
            tone === 'gold' && 'bg-gold/15 text-gold',
            tone === 'amber' && 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            tone === 'slate' && 'bg-muted text-muted-foreground'
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function Line({ text, sub, warn }: { text: string; sub?: string; warn?: boolean }) {
  return (
    <div className="flex items-start gap-1.5 py-0.5">
      <span className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full', warn ? 'bg-red-500' : 'bg-gold')} />
      <p className="min-w-0 flex-1 truncate text-[12px] leading-snug text-foreground" title={text}>
        {text}
        {sub && (
          <span className={cn('ms-1.5 text-[11px]', warn ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
            · {sub}
          </span>
        )}
      </p>
    </div>
  )
}

const Empty = ({ text }: { text: string }) => <p className="py-0.5 text-[12px] text-muted-foreground">{text}</p>

export function CaseNowStrip({ caseId, onOpenStory }: { caseId: string; onOpenStory: () => void }) {
  const today = todayISO()
  const { data: sessions } = useCaseSessions(caseId)
  const { data: tasks } = useCaseTasks(caseId)
  const { data: poas } = useCasePOAs(caseId)
  const { data: events } = useMatterEvents(caseId, 3)
  const { data: members } = useTeamMembers()

  const next = (sessions ?? [])
    .filter((s) => s.session_date && s.session_date.slice(0, 10) >= today && !s.closed_at)
    .sort((a, b) => `${a.session_date}${a.session_time ?? ''}`.localeCompare(`${b.session_date}${b.session_time ?? ''}`))[0]
  const nextIn = next?.session_date ? dayDiff(next.session_date, today) : null

  const nameOf = (id: string | null) => {
    const m = id ? members?.find((x) => x.id === id) : null
    return m ? m.short_name || m.name?.split(' ')[0] || '' : ''
  }

  // المطلوب: المهام المفتوحة — المتأخر فالأقرب، ثم وكالة تنتهي خلال ٦٠ يوماً
  const open = (tasks ?? [])
    .filter((t) => t.status !== 'done' && !t.deleted_at)
    .sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'))
  const lines: { text: string; sub?: string; warn?: boolean }[] = open.slice(0, 3).map((t) => {
    const d = t.due_date ? dayDiff(t.due_date, today) : null
    const who = nameOf(t.assignee_id)
    return {
      text: t.title || 'مهمة',
      sub: [who, d == null ? 'بلا موعد' : whenLabel(d)].filter(Boolean).join(' · '),
      warn: d != null && d < 0,
    }
  })
  const poa = (poas ?? []).find((p) => {
    if (!p.expiry_date) return false
    const d = dayDiff(p.expiry_date, today)
    return d <= 60
  })
  if (poa && lines.length < 3) {
    const d = dayDiff(poa.expiry_date!, today)
    lines.push({
      text: `الوكالة ${poa.poa_number ?? ''}`.trim(),
      sub: d < 0 ? `انتهت منذ ${daysLabel(-d)}` : `تنتهي ${d === 0 ? 'اليوم' : `خلال ${daysLabel(d)}`}`,
      warn: d < 0,
    })
  }

  return (
    <div className="grid gap-2.5 md:grid-cols-3">
      <NowCard icon={CalendarDays} title="الجلسة القادمة" tone="gold">
        {next ? (
          <>
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-bold text-foreground">
              {fmtDatePref(next.session_date).split(' (')[0]}
              {nextIn != null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-1.5 py-0.5 text-[11px] font-medium text-navy dark:text-gold">
                  <Clock className="h-3 w-3" />
                  {nextIn === 0 ? 'اليوم' : nextIn === 1 ? 'غداً' : `بعد ${daysLabel(nextIn)}`}
                </span>
              )}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {[
                fmtDatePref(next.session_date).match(/\((.+)\)/)?.[1],
                next.session_time ? fmtTime(next.session_time) : null,
                next.title,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </>
        ) : (
          <Empty text="لا جلسة قادمة مسجّلة" />
        )}
      </NowCard>

      <NowCard icon={AlertTriangle} title="المطلوب" tone="amber">
        {lines.length ? lines.map((l, i) => <Line key={i} {...l} />) : <Empty text="لا شيء مفتوح الآن ✓" />}
        {open.length > 3 && (
          <p className="text-[11px] text-muted-foreground">+{fmtNumber(open.length - 3)} في «المهام»</p>
        )}
      </NowCard>

      <NowCard icon={History} title="آخر ما حدث" tone="slate">
        {events?.length ? (
          <>
            {events.slice(0, 3).map((e) => (
              <Line key={e.id} text={e.sentence} sub={agoLabel(e.created_at, today)} />
            ))}
            <button onClick={onOpenStory} className="text-[11px] font-medium text-gold hover:underline">
              القصة كاملة ←
            </button>
          </>
        ) : (
          <Empty text="لا أحداث بعد" />
        )}
      </NowCard>
    </div>
  )
}
