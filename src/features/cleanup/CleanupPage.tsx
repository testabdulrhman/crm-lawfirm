// «نظّف ملفاتك» — المراجعة الشاملة 2026-11-15 (الدفعة الثانية، اعتمدها المدير على النموذج
// claude.ai/artifact/LaVfmPVfDm1JUrimDd8KsX). ملفات جارية لا يعرف النظام خطوتها التالية:
// قرار واحد لكل ملف يعيد التنبيهات واللوحة صادقة. الموظف يرى ملفاته، والمدير يتنقّل بين المسؤولين.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'wouter'
import { CalendarX2, CheckCircle2, FolderSearch, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { QueryErrorState } from '@/components/QueryErrorState'
import { DualDatePicker } from '@/components/DualDatePicker'
import { useConfirm } from '@/components/ConfirmDialog'
import { TaskFormDialog } from '@/features/tasks/TaskFormDialog'
import { cn } from '@/lib/utils'
import { daysLabel, fmtDatePref, fmtNumber, todayISO } from '@/lib/format'
import { matterHref } from '@/lib/matterHref'
import { errMessage } from '@/lib/errors'
import { toast } from '@/hooks/use-toast'
import { useIsDirector } from '@/hooks/useIsDirector'
import { useUpdateCaseStatus } from '@/hooks/useCases'
import { useAddSession } from '@/hooks/useCaseSessions'
import {
  CLEANUP_KEY,
  useCleanupItems,
  useCleanupSummary,
  useMarkAwaitingRuling,
  type CleanupCase,
  type CleanupSession,
  type CleanupTarget,
} from '@/hooks/useCleanup'
import { useQueryClient } from '@tanstack/react-query'

const firstName = (n: string | null | undefined) =>
  (n ?? '').replace(/^(المستشار|المحامي|المحامية)\s*:?\s*/, '').trim().split(/\s+/)[0] || '—'

function idleText(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'آخر نشاط اليوم'
  return `آخر نشاط قبل ${daysLabel(days)}`
}

export function CleanupPage() {
  const isDirector = useIsDirector()
  const [target, setTarget] = useState<CleanupTarget>(null)
  const items = useCleanupItems(target)
  const summary = useCleanupSummary(isDirector)

  const sessions = items.data?.sessions ?? []
  const cases = items.data?.cases ?? []
  const left = sessions.length + cases.length

  // العدّاد: ما كان عند أول تحميل لهذا المسؤول، وما حُسم منذ فتح الصفحة
  const startRef = useRef<Record<string, number>>({})
  const key = target ?? 'me'
  if (items.data && startRef.current[key] == null) startRef.current[key] = left
  const start = Math.max(startRef.current[key] ?? left, left)
  const done = start - left
  const pct = start > 0 ? Math.round((done / start) * 100) : 100

  const targetName = useMemo(() => {
    if (!target) return null
    if (target === 'none') return 'بلا مسؤول'
    return firstName(summary.data?.find((r) => r.member_id === target)?.member_name)
  }, [target, summary.data])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0 flex-[1_1_420px] space-y-1">
          <h1 className="text-[28px] font-bold leading-snug">
            نظّف ملفاتك{targetName ? <span className="text-muted-foreground"> · {targetName}</span> : null}
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            ملفات جارية لا يعرف النظام خطوتها التالية. قرار واحد لكل ملف يكفي، وبعدها تعود تنبيهاتك ولوحتك صادقة.
          </p>
        </div>
        <div className="w-full max-w-[300px] space-y-2 rounded-2xl border bg-card p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-semibold text-muted-foreground">حُسم</span>
            <span className="text-2xl font-bold tabular-nums">
              {fmtNumber(done)}{' '}
              <span className="text-base font-medium text-muted-foreground">من {fmtNumber(start)}</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-2 rounded-full bg-gold transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          {items.data && left === 0 && (
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              اكتمل التنظيف. كل الملفات لها خطوة تالية.
            </p>
          )}
        </div>
      </div>

      {isDirector && (summary.data?.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-navy px-4 py-3 text-white">
          <span className="me-2 text-[13px] font-bold text-gold">حسب المسؤول</span>
          <ChipBtn active={target === null} onClick={() => setTarget(null)}>
            ملفاتي
          </ChipBtn>
          {summary.data!
            .filter((r) => r.member_id !== null)
            .map((r) => (
              <ChipBtn key={r.member_id} active={target === r.member_id} onClick={() => setTarget(r.member_id)}>
                {firstName(r.member_name)} <b className="tabular-nums">{fmtNumber(r.sessions_n + r.cases_n)}</b>
              </ChipBtn>
            ))}
          {summary.data!.some((r) => r.member_id === null) && (
            <ChipBtn active={target === 'none'} onClick={() => setTarget('none')} warn>
              بلا مسؤول{' '}
              <b className="tabular-nums">
                {fmtNumber(summary.data!.filter((r) => r.member_id === null).reduce((a, r) => a + r.sessions_n + r.cases_n, 0))}
              </b>
            </ChipBtn>
          )}
          <span className="ms-auto text-xs text-white/50">يرى الموظف ملفاته فقط</span>
        </div>
      )}

      {items.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      ) : items.isError ? (
        <QueryErrorState error={items.error} onRetry={() => items.refetch()} />
      ) : (
        <>
          <Section
            icon={CalendarX2}
            tone="danger"
            title="جلسات مضى موعدها ولم تُغلق"
            hint="لا نتيجة مسجّلة ولا موعد قادم، والموكّل لا يعرف ما حدث."
            count={sessions.length}
          >
            {sessions.length === 0 ? (
              <AllClear text="لا جلسات معلّقة." />
            ) : (
              sessions.map((s) => <SessionRow key={s.id} s={s} />)
            )}
          </Section>

          <Section
            icon={FolderSearch}
            tone="gold"
            title="قضايا جارية بلا خطوة تالية"
            hint="لا جلسة قادمة ولا مهمة مفتوحة. اختر ما ينطبق على كل قضية."
            count={cases.length}
          >
            {cases.length === 0 ? (
              <AllClear text="كل القضايا الجارية لها خطوة تالية." />
            ) : (
              cases.map((c) => <CaseRow key={c.id} c={c} />)
            )}
          </Section>

          <div className="rounded-2xl border bg-gold/5 p-4 text-sm">
            <p className="mb-1 font-semibold">«بانتظار الحكم»</p>
            <p className="text-muted-foreground">
              يسجّل مهمة «استلام الحكم» بعد ٣٠ يوماً لمسؤول القضية، فلا تظهر القضية هنا كأنها منسيّة، وتذكّره المهمة إن تأخر الحكم.
            </p>
          </div>
        </>
      )}
    </div>
  )
}

function ChipBtn({
  active,
  onClick,
  warn,
  children,
}: {
  active: boolean
  onClick: () => void
  warn?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm transition-colors',
        active ? 'bg-gold text-navy' : warn ? 'text-rose-200 hover:bg-white/10' : 'text-white/90 hover:bg-white/10'
      )}
    >
      {children}
    </button>
  )
}

function Section({
  icon: Icon,
  tone,
  title,
  hint,
  count,
  children,
}: {
  icon: typeof CalendarX2
  tone: 'danger' | 'gold'
  title: string
  hint: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border bg-card px-5 pb-2 pt-5">
      <header className="flex items-center gap-3 pb-2">
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-full',
            tone === 'danger' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-gold/15 text-gold'
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold">{title}</h2>
          <p className="text-[13px] text-muted-foreground">{hint}</p>
        </div>
        <span
          className={cn(
            'rounded-full px-3 py-0.5 text-sm font-bold tabular-nums',
            tone === 'danger' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-gold/15 text-foreground'
          )}
        >
          {fmtNumber(count)}
        </span>
      </header>
      <div className="divide-y">{children}</div>
    </section>
  )
}

function AllClear({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2 py-4 text-sm font-medium text-emerald-700 dark:text-emerald-400">
      <CheckCircle2 className="h-4 w-4" />
      {text}
    </div>
  )
}

function CaseLink({ id, kind, title, num }: { id: string; kind: string | null; title: string | null; num: string | null }) {
  return (
    <Link href={matterHref(kind, id)} className="font-semibold text-foreground hover:text-gold hover:underline">
      {title || 'ملف بلا عنوان'}
      {num ? <span className="mx-2 inline-block text-xs font-normal text-muted-foreground" dir="ltr">{num}</span> : null}
    </Link>
  )
}

function SessionRow({ s }: { s: CleanupSession }) {
  const [, navigate] = useLocation()
  const open = (action: 'close' | 'postpone') =>
    navigate(`${matterHref(s.kind, s.case_id)}?session=${s.id}&session_action=${action}`)
  const meta = [
    `جلسة ${fmtDatePref(s.session_date)}`,
    s.court,
    `مرّ ${daysLabel(s.days_ago)}`,
  ].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 py-3.5">
      <div className="min-w-0 flex-[1_1_340px]">
        <CaseLink id={s.case_id} kind={s.kind} title={s.case_title} num={s.office_num} />
        <p className="text-[13px] text-muted-foreground">{meta}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => open('close')}>أغلق الجلسة</Button>
        <Button variant="outline" onClick={() => open('postpone')}>لم تُعقد، أُجّلت</Button>
      </div>
    </div>
  )
}

function CaseRow({ c }: { c: CleanupCase }) {
  const qc = useQueryClient()
  const awaitM = useMarkAwaitingRuling()
  const statusM = useUpdateCaseStatus()
  const { confirm, dialog } = useConfirm()
  const [taskOpen, setTaskOpen] = useState(false)
  const [sessionOpen, setSessionOpen] = useState(false)

  const meta = [
    c.last_ruling ? `صدر حكم ${fmtDatePref(c.last_ruling)}` : null,
    c.last_session ? `آخر جلسة ${fmtDatePref(c.last_session)}` : 'لا جلسة مسجّلة',
    idleText(c.last_activity),
  ].filter(Boolean).join(' · ')

  const busy = awaitM.isPending || statusM.isPending

  return (
    <div className="space-y-2.5 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <CaseLink id={c.id} kind={c.kind} title={c.title} num={c.office_num} />
        <span className="text-[13px] text-muted-foreground">{meta}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          className="border-gold/60 bg-gold/5"
          disabled={busy}
          onClick={() =>
            awaitM.mutate(
              { caseId: c.id },
              {
                onSuccess: (due) =>
                  toast({ variant: 'success', title: 'بانتظار الحكم', description: `مهمة «استلام الحكم» في ${fmtDatePref(due)}` }),
                onError: (e) => toast({ variant: 'destructive', title: 'لم تُسجَّل', description: errMessage(e) }),
              }
            )
          }
        >
          {awaitM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          بانتظار الحكم
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setSessionOpen(true)}>
          أضف الجلسة القادمة
        </Button>
        <Button variant="outline" disabled={busy} onClick={() => setTaskOpen(true)}>
          أضف مهمة
        </Button>
        <Button
          variant="outline"
          className="text-muted-foreground"
          disabled={busy}
          onClick={() =>
            confirm({
              title: 'إنهاء القضية؟',
              description: `ستُنقل «${c.title ?? 'القضية'}» إلى المنتهية بتاريخ اليوم. يمكن إعادتها جارية من صفحتها.`,
              confirmLabel: 'انتهت القضية',
              destructive: false,
              onConfirm: () =>
                statusM.mutate(
                  { id: c.id, status: 'muntahia' },
                  {
                    onSuccess: () => qc.invalidateQueries({ queryKey: CLEANUP_KEY }),
                  }
                ),
            })
          }
        >
          انتهت القضية
        </Button>
      </div>
      {dialog}
      <TaskFormDialog
        open={taskOpen}
        onOpenChange={(o) => {
          setTaskOpen(o)
          if (!o) qc.invalidateQueries({ queryKey: CLEANUP_KEY })
        }}
        fixedCaseId={c.id}
      />
      <NextSessionDialog
        open={sessionOpen}
        onOpenChange={setSessionOpen}
        caseId={c.id}
        court={c.court}
        caseTitle={c.title}
      />
    </div>
  )
}

function NextSessionDialog({
  open,
  onOpenChange,
  caseId,
  court,
  caseTitle,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  caseId: string
  court: string | null
  caseTitle: string | null
}) {
  const qc = useQueryClient()
  const addM = useAddSession(caseId)
  const [date, setDate] = useState<string | null>(null)
  const [time, setTime] = useState('')

  useEffect(() => {
    if (open) {
      setDate(null)
      setTime('')
    }
  }, [open])

  const tooEarly = !!date && date < todayISO()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>الجلسة القادمة{caseTitle ? ` — ${caseTitle}` : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <DualDatePicker value={date} onChange={setDate} label="تاريخ الجلسة" required id="cleanup-next-date" />
          {tooEarly && <p className="text-sm text-destructive">التاريخ مضى — الجلسة القادمة تكون اليوم أو بعده.</p>}
          <div className="space-y-1.5">
            <Label htmlFor="cleanup-next-time">الوقت (اختياري)</Label>
            <Input id="cleanup-next-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" className="w-40" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button
            disabled={!date || tooEarly || addM.isPending}
            onClick={() =>
              addM.mutate(
                { case_id: caseId, session_date: date!, session_time: time || null, court },
                {
                  onSuccess: () => {
                    qc.invalidateQueries({ queryKey: CLEANUP_KEY })
                    onOpenChange(false)
                  },
                }
              )
            }
          >
            {addM.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ الجلسة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
