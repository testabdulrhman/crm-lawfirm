import { useState } from 'react'
import { useLocation } from 'wouter'
import { ArrowRight, Pencil, Scale } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

import { fmtDatePref } from '@/lib/format'
import { useCase, useUpdateCaseStatus } from '@/hooks/useCases'
import {
  CASE_STATUS_OPTIONS,
  caseStatusBadge,
  caseStatusLabel,
  caseTypeLabel,
} from '@/lib/caseLabels'
import { CaseForm } from './CaseForm'
import { OverviewTab } from './tabs/OverviewTab'
import { PartiesTab } from './tabs/PartiesTab'
import { SessionsTab } from './tabs/SessionsTab'
import { RulingsTab } from './tabs/RulingsTab'
import { TasksTab } from './tabs/TasksTab'
import { DocumentsTab } from './tabs/DocumentsTab'
import { MemosTab } from './tabs/MemosTab'
import { NotesTab } from './tabs/NotesTab'
import type { Case, CaseStatus } from '@/types/db'

// ترتيب التبويبات المعتمد
const TABS = [
  { value: 'overview', label: 'نظرة عامة' },
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
  const { data: c, isLoading, isError } = useCase(id)
  const statusM = useUpdateCaseStatus()
  const [editOpen, setEditOpen] = useState(false)

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
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate('/cases')}>
          <ArrowRight className="h-4 w-4" />
          رجوع
        </Button>
        <Alert variant="destructive">
          <AlertTitle>تعذّر تحميل القضية</AlertTitle>
        </Alert>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
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
              {/* مبدّل الحالة السريع */}
              <Select
                value={c.status ?? 'jarri'}
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
          </div>
        </CardContent>
      </Card>

      {/* التبويبات (RTL — تبدأ من اليمين) */}
      <Tabs defaultValue="overview" dir="rtl">
        <div className="overflow-x-auto">
          <TabsList className="inline-flex w-max justify-start">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab caseData={c} />
        </TabsContent>
        <TabsContent value="parties">
          <PartiesTab caseId={c.id} />
        </TabsContent>
        <TabsContent value="sessions">
          <SessionsTab caseId={c.id} />
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
          <NotesTab caseId={c.id} />
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
