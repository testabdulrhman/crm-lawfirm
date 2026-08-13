import { useState } from 'react'
import { Link, useLocation } from 'wouter'
import { ArrowRight, Handshake, Pencil, Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { QueryErrorState } from '@/components/QueryErrorState'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { fmtDatePref, fmtNumber } from '@/lib/format'
import { useCaseDocuments } from '@/hooks/useCaseDocuments'
import { useCaseSessions } from '@/hooks/useCaseSessions'
import { useCaseTasks } from '@/hooks/useCaseTasks'
import { useCase, useUpdateCaseStatus } from '@/hooks/useCases'
import { useCaseStudy } from '@/hooks/useCaseStudy'
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
import { NotesTab } from './tabs/NotesTab'
import { ProjectTab } from './tabs/ProjectTab'
import type { Case, CaseStatus } from '@/types/db'

// ترتيب التبويبات المعتمد
const TABS = [
  { value: 'overview', label: 'نظرة عامة' },
  { value: 'study', label: 'دراسة القضية' },
  { value: 'project', label: 'بطاقة المشروع' },
  { value: 'parties', label: 'الأطراف' },
  { value: 'sessions', label: 'الجلسات' },
  { value: 'judgments', label: 'الأحكام' },
  { value: 'tasks', label: 'المهام' },
  { value: 'memos', label: 'المذكرات' },
  { value: 'documents', label: 'المستندات' },
  { value: 'notes', label: 'الملاحظات' },
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
  // عدّادات التبويبات — تُظهر المحتوى دون فتحه (وتُسرّع فتح التبويب لاحقاً)
  const counts: Record<string, number> = {
    documents: caseDocs?.length ?? 0,
    sessions: caseSessions?.length ?? 0,
    tasks: (caseTasks ?? []).filter((t) => t.status !== 'done').length,
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
    <div className="mx-auto max-w-4xl space-y-5">
      <Button variant="ghost" onClick={() => navigate('/cases')}>
        <ArrowRight className="h-4 w-4" />
        رجوع للقضايا
      </Button>

      {/* الرأس */}
      <Card>
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Scale className="h-5 w-5 shrink-0 text-gold" />
                <h2 className="text-xl font-bold text-foreground">{c.title}</h2>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge variant={caseStatusBadge(c.status)}>
                  {caseStatusLabel(c.status)}
                </Badge>
                <Badge variant="outline">{caseTypeLabel(c.type)}</Badge>
              </div>
            </div>
            <div className="flex items-center gap-2">
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

          {/* معلومات سريعة في الرأس */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-sm text-muted-foreground">
            <HeaderInfo label="رقم المكتب" value={c.office_num} dir="ltr" />
            <HeaderInfo label="رقم المحكمة" value={c.court_num} dir="ltr" />
            <HeaderInfo label="الموكّل" value={c.contact?.name} />
            <HeaderInfo label="المسؤول" value={c.assignee?.short_name || c.assignee?.name} />
            <HeaderInfo label="المحكمة" value={c.court} />
            <HeaderInfo label="الدائرة" value={c.court_division} />
            <HeaderInfo
              label="تاريخ الفتح"
              value={c.open_date ? fmtDatePref(c.open_date) : null}
            />
            {c.engagement && (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">العقد:</span>
                <Link
                  href={`/engagements/${c.engagement.id}`}
                  className="flex items-center gap-1 font-medium text-foreground hover:text-gold"
                >
                  <Handshake className="h-3.5 w-3.5 text-gold" />
                  {c.engagement.title || c.engagement.engagement_number || 'عقد'}
                </Link>
              </span>
            )}
          </div>
        </CardContent>
      </Card>

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
        <TabsContent value="notes">
          <NotesTab caseId={c.id} caseTitle={c.title} />
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

function HeaderInfo({
  label,
  value,
  dir,
}: {
  label: string
  value: string | null | undefined
  dir?: 'ltr' | 'rtl'
}) {
  if (!value || value.trim() === '') return null
  return (
    <span>
      <span className="text-xs">{label}: </span>
      <span dir={dir} className="text-foreground">
        {value}
      </span>
    </span>
  )
}

// نوع مُصدَّر للاستخدام في الأجزاء القادمة (props التبويبات)
export type { Case }
