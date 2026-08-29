import { useState } from 'react'
import { useLocation } from 'wouter'
import { ArrowRight, Pencil, Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Ltr } from '@/components/Ltr'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MatterStory } from './MatterStory'
import { CaseDiscussionPanel } from '@/features/discussions/DiscussionsPage'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { fmtNumber } from '@/lib/format'
import { useCaseDocuments } from '@/hooks/useCaseDocuments'
import { useCaseSessions } from '@/hooks/useCaseSessions'
import { useCaseTasks } from '@/hooks/useCaseTasks'
import { useCase, useUpdateCaseStatus } from '@/hooks/useCases'
import { useCaseStudy } from '@/hooks/useCaseStudy'
import { useCaseRulings } from '@/hooks/useCaseRulings'
import { useCaseMemos } from '@/hooks/useCaseMemos'
import { CaseJourney } from './CaseJourney'
import { CaseFactsPanel } from './CaseFactsPanel'
import { usePageState } from '@/hooks/usePageState'
import {
  CASE_STATUS_OPTIONS,
  caseStatusBadge,
  caseStatusLabel,
  caseTypeLabel,
} from '@/lib/caseLabels'
import { CaseForm } from './CaseForm'
import { OverviewTab } from './tabs/OverviewTab'
import { StudyTab } from './tabs/StudyTab'
import { PartiesTab } from './tabs/PartiesTab'
import { SessionsTab } from './tabs/SessionsTab'
import { RulingsTab } from './tabs/RulingsTab'
import { TasksTab } from './tabs/TasksTab'
import { DocumentsTab } from './tabs/DocumentsTab'
import { MemosTab } from './tabs/MemosTab'
import { ProjectTab } from './tabs/ProjectTab'
import type { Case, CaseStatus } from '@/types/db'

// ترتيب التبويبات المعتمد
const TABS = [
  { value: 'overview', label: 'نظرة عامة' },
  { value: 'story', label: 'قصة الملف' },
  { value: 'discussion', label: 'النقاش' },
  { value: 'study', label: 'دراسة القضية' },
  { value: 'project', label: 'بطاقة المشروع' },
  { value: 'parties', label: 'الأطراف' },
  { value: 'sessions', label: 'الجلسات' },
  { value: 'judgments', label: 'الأحكام' },
  { value: 'tasks', label: 'المهام' },
  { value: 'memos', label: 'المذكرات' },
  { value: 'documents', label: 'المستندات' },
] as const

export function CaseDetail({ id }: { id: string }) {
  const [, navigate] = useLocation()
  const { data: c, isLoading, isError, error, refetch } = useCase(id)
  const statusM = useUpdateCaseStatus()
  const [editOpen, setEditOpen] = useState(false)
  // التبويب المفتوح يدوم للرجوع/التحديث (لكل قضية على حدة)
  const [tab, setTab] = usePageState('case-tab:' + id, 'overview')
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
  // علامة تبويب الدراسة: هل توجد دراسة؟ وهل اعتُمدت؟
  const hasStudy = !!study && !!(study.facts || study.legal_opinion || study.basics)
  const studyApproved = hasStudy && study?.status === 'approved'

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
        backTo="/cases"
        backLabel="رجوع للقضايا"
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <Button variant="ghost" onClick={() => navigate('/cases')}>
        <ArrowRight className="h-4 w-4" />
        رجوع للقضايا
      </Button>

      {/* الرأس: العنوان والحالة والإجراءات فقط — التفاصيل في العمود الجانبي */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Scale className="h-5 w-5 shrink-0 text-gold" />
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              {c.title}
            </h2>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={caseStatusBadge(c.status)}>
              {caseStatusLabel(c.status)}
            </Badge>
            <Badge variant="outline">{caseTypeLabel(c.type)}</Badge>
            {c.office_num && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                <Ltr>{c.office_num}</Ltr>
              </span>
            )}
            {c.court && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {c.court}
                {c.court_division ? ` — ${c.court_division}` : ''}
              </span>
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
            onValueChange={(v) =>
              statusM.mutate({ id: c.id, status: v as CaseStatus })
            }
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

      {/* مسار القضية — يُشتق من البيانات الموجودة بلا إدخال جديد */}
      <CaseJourney
        caseData={c}
        counts={{
          sessions: counts.sessions,
          rulings: caseRulings?.length ?? 0,
        }}
      />

      {/* عمودان على الشاشات العريضة: الحقائق ثابتة يميناً والنشاط يساراً.
          على الجوال ينهار لعمود واحد (الحقائق فوق ثم التبويبات). */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-4">
          <CaseFactsPanel
            caseData={c}
            counts={{
              sessions: counts.sessions,
              documents: counts.documents,
              tasks: counts.tasks,
            }}
            onEdit={() => setEditOpen(true)}
          />
        </div>

        <div className="min-w-0">
      {/* التبويبات (RTL — تبدأ من اليمين) */}
      <Tabs value={tab} onValueChange={setTab} dir="rtl">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-max justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {(counts[t.value] ?? 0) > 0 && (
                  <span className="mr-1.5 rounded-full bg-gold/15 px-1.5 text-xs font-medium text-gold-700 dark:text-gold-300">
                    {fmtNumber(counts[t.value])}
                  </span>
                )}
                {/* علامة وجود الدراسة: ✓ خضراء = معتمدة، نقطة ذهبية = مسودة */}
                {t.value === 'study' && hasStudy && (
                  <span
                    className={
                      studyApproved
                        ? 'mr-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400'
                        : 'mr-1.5 inline-block h-2 w-2 rounded-full bg-gold'
                    }
                    title={studyApproved ? 'دراسة معتمدة' : 'مسودة دراسة'}
                  >
                    {studyApproved ? '✓' : ''}
                  </span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab caseData={c} />
        </TabsContent>
        <TabsContent value="story">
          <MatterStory matterId={id} />
        </TabsContent>
        <TabsContent value="discussion">
          <CaseDiscussionPanel caseId={c.id} title={c.title ?? 'القضية'} />
        </TabsContent>
        <TabsContent value="study">
          <StudyTab caseId={c.id} />
        </TabsContent>
        <TabsContent value="project">
          <ProjectTab caseId={c.id} />
        </TabsContent>
        <TabsContent value="parties">
          <PartiesTab caseId={c.id} />
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
      </Tabs>
        </div>
      </div>

      {/* تعديل */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <CaseForm caseItem={c} onDone={() => setEditOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// نوع مُصدَّر للاستخدام في الأجزاء القادمة (props التبويبات)
export type { Case }
