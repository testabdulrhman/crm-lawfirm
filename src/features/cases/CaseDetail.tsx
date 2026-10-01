import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { ArrowRight, ChevronDown, Handshake, Pencil, Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Ltr } from '@/components/Ltr'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CaseDiscussionPanel } from '@/features/discussions/DiscussionsPage'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { fmtDatePref, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useCaseDocuments } from '@/hooks/useCaseDocuments'
import { useCaseSessions } from '@/hooks/useCaseSessions'
import { useCaseTasks } from '@/hooks/useCaseTasks'
import { useCase, useUpdateCase, useUpdateCaseStatus } from '@/hooks/useCases'
import { useCaseStudy } from '@/hooks/useCaseStudy'
import { useCaseRulings } from '@/hooks/useCaseRulings'
import { useCaseMemos } from '@/hooks/useCaseMemos'
import { CaseJourney } from './CaseJourney'
import { CaseNowStrip } from './CaseNowStrip'
import { usePageState } from '@/hooks/usePageState'
import {
  BANKRUPTCY_STAGES,
  CASE_STATUS_OPTIONS,
  caseStatusBadge,
  caseStatusLabel,
  caseTypeLabel,
} from '@/lib/caseLabels'
import { CaseForm } from './CaseForm'
import { matterKindEmoji } from '@/lib/matterHref'
import { SummaryTab } from './tabs/SummaryTab'
import { StudyTab } from './tabs/StudyTab'
import { SessionsTab } from './tabs/SessionsTab'
import { RulingsTab } from './tabs/RulingsTab'
import { TasksTab } from './tabs/TasksTab'
import { DocumentsTab } from './tabs/DocumentsTab'
import { MemosTab } from './tabs/MemosTab'
import type { Case, CaseStatus } from '@/types/db'

// التبويبات (مراجعة 2026-09-28، «احسه كثير بيانات بس شوي صعب»): كانت عشرة تفيض عن الشاشة، و«نظرة
// عامة» تكرر ما في العمود الجانبي. صارت سبعة — «الملخص» يجمع النظرة والأطراف والقصة، والدراسة زرّ
// فيه — وبقيت الجلسات والأحكام والمهام والمذكرات منفصلة («خلهم منفصلات»).
const TABS = [
  { value: 'summary', label: 'الملخص' },
  { value: 'sessions', label: 'الجلسات' },
  { value: 'judgments', label: 'الأحكام' },
  { value: 'tasks', label: 'المهام' },
  { value: 'memos', label: 'المذكرات' },
  { value: 'documents', label: 'المستندات' },
  { value: 'discussion', label: 'النقاش' },
] as const

// تبويبات قديمة محفوظة في حالة الصفحة ← مكانها الجديد
const LEGACY_TAB: Record<string, string> = { overview: 'summary', story: 'summary', parties: 'summary' }

export function CaseDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { data: c, isLoading, isError, error, refetch } = useCase(id)
  const statusM = useUpdateCaseStatus()
  const updateM = useUpdateCase()
  const [editOpen, setEditOpen] = useState(false)
  // التبويب المفتوح يدوم للرجوع/التحديث (لكل قضية على حدة)
  const [savedTab, setTab] = usePageState('case-tab:' + id, 'summary')
  const tab = LEGACY_TAB[savedTab] ?? savedTab
  const [allFacts, setAllFacts] = useState(false)
  const openStory = () => {
    setTab('summary')
    // بعد رسم التبويب
    window.setTimeout(() => document.getElementById('case-story')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
  }
  // عدد المستندات — يظهر على التبويب لتعرف وجودها دون فتحه (نفس استعلام التبويب المخزّن)
  const { data: caseDocs } = useCaseDocuments(id)
  const { data: caseSessions } = useCaseSessions(id)
  const { data: caseTasks } = useCaseTasks(id)
  const { data: study } = useCaseStudy(id)
  const { data: caseRulings } = useCaseRulings(id)
  const { data: caseMemos } = useCaseMemos(id)
  // عدّادات التبويبات — تُظهر المحتوى دون فتحه (وتُسرّع فتح التبويب لاحقاً)
  const counts: Record<string, number> = {
    documents: caseDocs?.length ?? 0,
    sessions: caseSessions?.length ?? 0,
    tasks: (caseTasks ?? []).filter((t) => t.status !== 'done').length,
    judgments: caseRulings?.length ?? 0,
    memos: caseMemos?.length ?? 0,
  }
  void study // يُحمَّل مبكراً فيفتح زرّ الدراسة بلا انتظار

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !c) {
    return (
      <QueryErrorState
        title="تعذّر تحميل القضية"
        error={error}
        onRetry={() => refetch()}
        backTo="/matters"
        backLabel="رجوع للمشاريع"
      />
    )
  }

  const chip = 'rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground'

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* الرجوع إلى «المشاريع» لا قائمة القضايا (طلب المدير 2026-10-01) — منها يُفتح كل ملف */}
      <Button variant="ghost" onClick={() => navigate('/matters')}>
        <ArrowRight className="h-4 w-4" />
        رجوع للمشاريع
      </Button>

      {/* ترويسة واحدة: البيانات مرة واحدة، والمسار سطراً رفيعاً، والباقي تحت «كل البيانات» */}
      <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 shrink-0 text-gold" />
              <h2 className="text-2xl font-bold tracking-tight text-foreground">
                <span className="me-2" aria-hidden>{matterKindEmoji(c.kind)}</span>
                {c.title}
              </h2>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge variant={caseStatusBadge(c.status)}>{caseStatusLabel(c.status)}</Badge>
              <Badge variant="outline">{caseTypeLabel(c.type)}</Badge>
              {c.office_num && (
                <span className={chip}>
                  <Ltr>{c.office_num}</Ltr>
                </span>
              )}
              {c.court && (
                <span className={chip}>
                  {c.court}
                  {c.court_division ? ` — ${c.court_division}` : ''}
                </span>
              )}
              {c.court_num && (
                <span className={chip}>
                  رقم المحكمة <Ltr>{c.court_num}</Ltr>
                </span>
              )}
              {c.assignee?.name && (
                <span className={chip}>المسؤول: {c.assignee.short_name || c.assignee.name}</span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* مبدّل الحالة السريع — أثناء الحفظ يعرض القيمة المختارة ويُقفل */}
            <Select
              value={
                statusM.isPending
                  ? statusM.variables?.status ?? c.status ?? 'jarri'
                  : c.status ?? 'jarri'
              }
              disabled={statusM.isPending}
              onValueChange={(v) => statusM.mutate({ id: c.id, status: v as CaseStatus })}
            >
              <SelectTrigger className="h-9 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CASE_STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              تعديل
            </Button>
          </div>
        </div>

        {/* مسار القضية — يُشتق من البيانات الموجودة بلا إدخال جديد.
            وإجراء الإفلاس مساره نظاميّ تُضبط مرحلته يدوياً. */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/50 pt-3">
          <CaseJourney
            compact
            caseData={c}
            counts={{ sessions: counts.sessions, rulings: caseRulings?.length ?? 0 }}
          />
          <button
            type="button"
            onClick={() => setAllFacts(!allFacts)}
            aria-expanded={allFacts}
            className="ms-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            كل البيانات
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', allFacts && 'rotate-180')} />
          </button>
        </div>
        {allFacts && (
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl bg-muted/50 p-3 text-xs md:grid-cols-4">
            <Fact label="الموكّل">
              {c.contact ? (
                <Link href={`/contacts/${c.contact.id}`} className="hover:text-gold">
                  {c.contact.name}
                </Link>
              ) : null}
            </Fact>
            <Fact label="تاريخ القيد">{c.open_date ? fmtDatePref(c.open_date) : null}</Fact>
            {c.close_date && <Fact label="تاريخ الإغلاق">{fmtDatePref(c.close_date)}</Fact>}
            <Fact label="العقد">
              {c.engagement ? (
                <Link href={`/engagements/${c.engagement.id}`} className="inline-flex items-center gap-1 hover:text-gold">
                  <Handshake className="h-3.5 w-3.5 text-gold" />
                  {c.engagement.title || c.engagement.engagement_number || 'عقد'}
                </Link>
              ) : null}
            </Fact>
            <Fact label="المحامي المسؤول">{c.assignee?.name ?? null}</Fact>
          </dl>
        )}
      </div>

      {c.kind === 'bankruptcy' && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
          <span className="text-xs font-semibold text-muted-foreground">
            المرحلة الحالية
          </span>
          <Select
            value={c.bankruptcy_stage ?? undefined}
            onValueChange={(v) =>
              updateM.mutate({ id: c.id, input: { bankruptcy_stage: v } })
            }
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="لم تُحدَّد بعد" />
            </SelectTrigger>
            <SelectContent>
              {BANKRUPTCY_STAGES.map((st) => (
                <SelectItem key={st.value} value={st.value}>
                  {st.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            كل انتقال يُسجَّل في «قصة الملف». والديون والدائنون في نظام الإفلاس.
          </span>
        </div>
      )}

      {/* «الآن»: الجلسة القادمة · المطلوب · آخر ما حدث */}
      <CaseNowStrip caseId={c.id} onOpenStory={openStory} />

      {/* التبويبات (RTL — تبدأ من اليمين) */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-max min-w-full justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-1">
                {t.label}
                {(counts[t.value] ?? 0) > 0 && (
                  <span className="mr-1.5 rounded-full bg-gold/15 px-1.5 text-xs font-medium text-gold-700 dark:text-gold-300">
                    {fmtNumber(counts[t.value])}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="summary">
          <SummaryTab caseData={c} onOpenStudy={() => setTab('study')} />
        </TabsContent>
        {/* الدراسة تُفتح من زرّها في الملخص — بلا تبويب في الشريط */}
        <TabsContent value="study">
          <Button variant="ghost" size="sm" className="mb-2" onClick={() => setTab('summary')}>
            <ArrowRight className="h-4 w-4" />
            رجوع للملخص
          </Button>
          <StudyTab caseId={c.id} />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab
            caseId={c.id}
            caseTitle={c.title}
            clientName={c.contact?.name}
            clientPhone={c.contact?.phone}
          />
        </TabsContent>
        <TabsContent value="judgments">
          <RulingsTab caseId={c.id} />
        </TabsContent>
        <TabsContent value="tasks">
          <TasksTab caseId={c.id} />
        </TabsContent>
        <TabsContent value="memos">
          <MemosTab caseId={c.id} />
        </TabsContent>
        <TabsContent value="documents">
          <DocumentsTab caseId={c.id} />
        </TabsContent>
        <TabsContent value="discussion">
          <CaseDiscussionPanel caseId={c.id} title={c.title ?? 'القضية'} />
        </TabsContent>
      </Tabs>

      {/* تعديل */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <CaseForm caseItem={c} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '') return null
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate font-medium text-foreground">{children}</dd>
    </div>
  )
}

// نوع مُصدَّر للاستخدام في الأجزاء القادمة (props التبويبات)
export type { Case }
