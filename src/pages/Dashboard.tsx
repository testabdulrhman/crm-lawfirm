// لوحة التحكم — ثلاثة أقسام يظهر فيها كل عنصر مرة واحدة: المطلوب مني · جدولي · المكتب.
// أُعيد ترتيبها بطلب المدير (2026-09-14: «احس فيه حوسه، كذا ملخبط كثير» ← «نعم مناسب»):
// كانت ١٢ قسماً تكرر الشيء نفسه — المهل تظهر في «المهام» أيضاً، والوكالات في ثلاثة أماكن،
// والجلسة موزعة على «جدول اليوم» و«القادم» و«جلسات تحتاج إغلاق».
import { useMemo } from 'react'
import { useLocation } from 'wouter'
import { CalendarClock, CalendarRange, Flame, RefreshCw, Sun } from 'lucide-react'

import { useAuth } from '@/stores/auth'
import { useIsDirector } from '@/hooks/useIsDirector'
import { usePageState } from '@/hooks/usePageState'
import { cn } from '@/lib/utils'
import { fmtDatePref, fmtNumber, todayISO } from '@/lib/format'
import { WeatherBadge } from '@/components/WeatherBadge'
import { BirthdayCard } from '@/components/BirthdayCard'
import { FeedContent } from '@/features/feed/FeedPage'
import { useCompleteTask, useDashboardOverview, type DashboardScope } from '@/hooks/useDashboard'
import { useConfirmDeadline } from '@/hooks/useDeadlineLoop'
import { groupActions } from '@/features/dashboard/queue'
import { useActionQueue, useSchedule } from '@/features/dashboard/useDashboardNext'
import {
  ActionQueueCard,
  HeroStat,
  OfficeCard,
  ScheduleCard,
  ScopeBtn,
  WhileYouWereBusy,
} from '@/features/dashboard/sections'

export default function Dashboard() {
  const { teamMember } = useAuth()
  const isDirector = useIsDirector()
  const [, navigate] = useLocation()

  // تبويبات نمط كليو: لوحتي · لوحة المكتب (للمدير) · آخر النشاط
  const [tab, setTab] = usePageState<'mine' | 'all' | 'feed'>('dashboard.tab', 'mine')
  const scope: DashboardScope = tab === 'all' ? 'all' : 'mine'
  const effectiveScope: DashboardScope = isDirector ? scope : 'mine'
  const isAll = effectiveScope === 'all'
  const isFeed = tab === 'feed'

  const queue = useActionQueue(effectiveScope, teamMember?.id, isDirector)
  const schedule = useSchedule(effectiveScope, teamMember?.id)
  const overview = useDashboardOverview(effectiveScope)
  const completeM = useCompleteTask()
  const confirmM = useConfirmDeadline()

  const groups = useMemo(() => groupActions(queue.data ?? []), [queue.data])
  const today = todayISO()
  const todayCount = (schedule.data ?? []).filter((x) => x.date === today).length
  const lateObjections = groups.overdue.filter((x) => x.kind === 'objection').length

  const fetching = queue.isFetching || schedule.isFetching || overview.isFetching
  const refresh = () => {
    queue.refetch()
    schedule.refetch()
    overview.refetch()
  }

  // المؤشر يقود إلى قسمه — ومن «آخر النشاط» يعود إلى اللوحة أولاً
  const jump = (id: string) => {
    if (isFeed) setTab('mine')
    setTimeout(
      () => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      60
    )
  }

  // تحية بتوقيتها — لمسة البطل
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'صباح الخير' : hour < 17 ? 'مساء الخير' : 'مساء النور'

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      {/* ===== لوحة البطل: التحية والطقس والتبويبات، ومؤشرات تلخّص القائمة ===== */}
      <div className="relative overflow-hidden rounded-3xl bg-navy bg-[linear-gradient(130deg,#1a2a55_0%,#111D3A_52%,#0c142d_100%)] p-6 text-white shadow-[0_10px_34px_-12px_rgba(17,29,58,0.55)] sm:p-7">
        {/* نقش سدو خافت — معيّنات متداخلة من هوية الشعار */}
        <svg
          aria-hidden
          className="pointer-events-none absolute -start-8 top-1/2 h-[210%] w-56 -translate-y-1/2 text-gold opacity-[0.07]"
          viewBox="0 0 100 300"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          {[0, 60, 120, 180, 240].map((y) => (
            <g key={y}>
              <path d={`M50 ${y}l28 30-28 30-28-30z`} />
              <path d={`M50 ${y + 14}l15 16-15 16-15-16z`} />
              <circle cx="50" cy={y + 30} r="3.5" fill="currentColor" stroke="none" />
            </g>
          ))}
        </svg>

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
            <div className="min-w-0">
              <h2 className="text-[26px] font-bold leading-snug tracking-tight">
                {greeting}
                {teamMember?.short_name || teamMember?.name
                  ? `، ${teamMember.short_name || teamMember.name}`
                  : ''}
              </h2>
              <p className="mt-1 text-sm text-white/60">{fmtDatePref(today)}</p>
            </div>
            {/* طقس بريدة بجانب التحية (طلب المدير 2026-09-14) */}
            <WeatherBadge />
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-white/10 p-1 text-sm backdrop-blur-sm">
              <ScopeBtn active={tab === 'mine'} onClick={() => setTab('mine')} label="لوحتي" />
              {isDirector && (
                <ScopeBtn active={tab === 'all'} onClick={() => setTab('all')} label="لوحة المكتب" />
              )}
              <ScopeBtn active={tab === 'feed'} onClick={() => setTab('feed')} label="آخر النشاط" />
            </div>
            <button
              type="button"
              onClick={refresh}
              disabled={fetching}
              className="grid h-9 w-9 place-items-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              title="تحديث"
            >
              <RefreshCw className={cn('h-4 w-4', fetching && 'animate-spin')} />
            </button>
          </div>
        </div>

        <div className="relative mt-6 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {queue.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[86px] animate-pulse rounded-2xl bg-white/[0.06]" />
            ))
          ) : (
            <>
              <HeroStat
                icon={Flame}
                label="فائت"
                value={groups.overdue.length}
                tone="danger"
                note={lateObjections > 0 ? `منها ${fmtNumber(lateObjections)} مهلة اعتراض` : undefined}
                onClick={() => jump('queue')}
              />
              <HeroStat
                icon={Sun}
                label="مطلوب اليوم"
                value={groups.today.length}
                tone="warn"
                onClick={() => jump('queue')}
              />
              <HeroStat
                icon={CalendarRange}
                label="هذا الأسبوع"
                value={groups.week.length}
                onClick={() => jump('queue')}
              />
              <HeroStat
                icon={CalendarClock}
                label="جلسات ومواعيد اليوم"
                value={todayCount}
                onClick={() => jump('schedule')}
              />
            </>
          )}
        </div>
      </div>

      {isFeed ? (
        <div className="space-y-5">
          <WhileYouWereBusy />
          <FeedContent />
        </div>
      ) : (
        <>
          <BirthdayCard />

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <ActionQueueCard
              items={queue.data}
              loading={queue.isLoading}
              error={queue.error}
              office={isAll}
              completingId={completeM.isPending ? completeM.variables : undefined}
              confirmingId={confirmM.isPending ? confirmM.variables : undefined}
              onOpen={(href) => navigate(href)}
              onComplete={(id) => completeM.mutate(id)}
              onConfirm={(id) => confirmM.mutate(id)}
            />
            <ScheduleCard
              items={schedule.data}
              loading={schedule.isLoading}
              error={schedule.error}
              onOpen={(href) => navigate(href)}
              onCalendar={() => navigate('/calendar')}
            />
          </div>

          {isAll && overview.data?.stats && (
            <OfficeCard
              stats={overview.data.stats}
              requests={overview.data.requests}
              applications={overview.data.applications}
              poas={overview.data.expiring_poas}
              onOpen={(href) => navigate(href)}
            />
          )}
        </>
      )}
    </div>
  )
}
