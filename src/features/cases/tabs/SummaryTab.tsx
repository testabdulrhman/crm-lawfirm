// «الملخص» — يجمع ما كان في ثلاثة تبويبات: نظرة عامة، والأطراف، وقصة الملف (مراجعة 2026-09-28).
// البيانات الأساسية صارت في الترويسة مرة واحدة، فهنا ما يُقرأ لا ما يُكرَّر: الموضوع ونطاق العمل
// والدراسة، ثم الأطراف والقصة؛ والأشخاص والوكالات جانباً.
import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCaseStudy } from '@/hooks/useCaseStudy'
import type { Case } from '@/types/db'
import { CasePeopleCard } from '../CasePeopleCard'
import { CasePOAsCard } from '../CasePOAsCard'
import { CaseClientChatCard } from '../CaseClientChatCard'
import { MatterStory } from '../MatterStory'
import { PartiesTab } from './PartiesTab'

export function SummaryTab({ caseData: c, onOpenStudy }: { caseData: Case; onOpenStudy: () => void }) {
  const { data: study } = useCaseStudy(c.id)
  const hasStudy = !!study && !!(study.facts || study.legal_opinion || study.basics)
  const approved = hasStudy && study?.status === 'approved'

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        {c.subject && c.subject.trim() !== '' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الموضوع</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{c.subject}</p>
            </CardContent>
          </Card>
        )}

        {/* نطاق العمل المتفق عليه — من عرض السعر عند فتح الملف */}
        {c.agreed_scope && c.agreed_scope.trim() !== '' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">نطاق العمل المتفق عليه</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{c.agreed_scope}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                من عرض السعر المعتمد عند فتح الملف — ما خرج عنه يحتاج اتفاقاً جديداً.
              </p>
            </CardContent>
          </Card>
        )}

        {/* دراسة القضية: زرّ لا تبويب */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gold/40 bg-gold/5 p-4">
          <div>
            <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Sparkles className="h-4 w-4 text-gold" />
              دراسة القضية
            </h4>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {approved ? 'دراسة معتمدة ✓' : hasStudy ? 'مسودة دراسة — لم تُعتمد بعد' : 'لم تُكتب دراسة لهذا الملف بعد'}
            </p>
          </div>
          <Button variant="gold" size="sm" onClick={onOpenStudy}>
            {hasStudy ? 'افتح الدراسة' : 'اكتب الدراسة'}
          </Button>
        </div>

        <section>
          <h3 className="mb-2 px-1 text-sm font-semibold text-foreground">الأطراف</h3>
          <PartiesTab caseId={c.id} />
        </section>

        <section id="case-story" className="scroll-mt-4">
          <h3 className="mb-2 px-1 text-sm font-semibold text-foreground">قصة الملف</h3>
          <MatterStory matterId={c.id} />
        </section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4">
        <CaseClientChatCard caseId={c.id} />
        <CasePeopleCard caseData={c} />
        <CasePOAsCard caseData={c} />
      </div>
    </div>
  )
}
