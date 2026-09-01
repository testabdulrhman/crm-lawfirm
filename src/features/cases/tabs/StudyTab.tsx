// تبويب «دراسة القضية» — توليد أولي بالذكاء الاصطناعي وفق منهجية الشركة، ثم مراجعة وتحرير يدوي
import { useMemo, useState } from 'react'
import {
  BookOpenCheck,
  Sparkles,
  Loader2,
  Save,
  FileText,
  CalendarClock,
  ListOrdered,
  Scale,
  ShieldQuestion,
  ShieldCheck,
  Library,
  Gavel,
  CheckCircle2,
  Paperclip,
  History,
  Sparkle,
  AlertTriangle,
  BookMarked,
  Landmark,
  ListChecks,
  FilePenLine,
  Check,
  X,
  type LucideIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { QueryErrorState } from '@/components/QueryErrorState'
import { fmtDateTime } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { usePageState } from '@/hooks/usePageState'
import {
  useCaseStudy,
  useSaveCaseStudy,
  useGenerateCaseStudy,
  useStudyVersions,
  useStudyProposals,
  useDecideProposal,
  useDraftMemoFromStudy,
  type CaseStudyInput,
  type StudyProposal,
} from '@/hooks/useCaseStudy'

const SECTIONS: {
  key: keyof CaseStudyInput & string
  label: string
  icon: LucideIcon
  rows: number
}[] = [
  { key: 'basics', label: 'أولاً: بيانات القضية', icon: FileText, rows: 5 },
  { key: 'timeline', label: 'ثانياً: الخط الزمني', icon: CalendarClock, rows: 5 },
  { key: 'facts', label: 'ثالثاً: الوقائع', icon: ListOrdered, rows: 6 },
  { key: 'requests', label: 'رابعاً: الطلبات', icon: Scale, rows: 3 },
  { key: 'plaintiff_grounds', label: 'خامساً: أسانيد المدعي وتقييمها', icon: ShieldCheck, rows: 5 },
  { key: 'defendant_defenses', label: 'سادساً: دفوع المدعى عليه وتقييمها', icon: ShieldQuestion, rows: 5 },
  { key: 'references_list', label: 'سابعاً: مرجعية إصدار الرأي', icon: Library, rows: 4 },
  { key: 'legal_opinion', label: 'ثامناً: الرأي القانوني', icon: Gavel, rows: 8 },
  { key: 'suitability', label: 'تاسعاً: الموقف والتوصية', icon: CheckCircle2, rows: 4 },
  { key: 'attachments_list', label: 'عاشراً: المستندات والوثائق', icon: Paperclip, rows: 4 },
  // v2 — الدراسة الحيّة
  { key: 'what_changed', label: 'ما الذي تغيّر منذ الدراسة السابقة', icon: Sparkle, rows: 4 },
  { key: 'precedents', label: 'سوابق المكتب المشابهة', icon: BookMarked, rows: 5 },
  { key: 'statutes', label: 'الأسانيد النظامية (من المصادر الرسمية)', icon: Landmark, rows: 5 },
]

export function StudyTab({ caseId }: { caseId: string }) {
  const { teamMember } = useAuth()
  const { data: study, isLoading, isError, error, refetch } = useCaseStudy(caseId)
  const saveM = useSaveCaseStudy(caseId)
  const genM = useGenerateCaseStudy(caseId)
  const { data: versions = [] } = useStudyVersions(caseId)
  const { data: proposals = [] } = useStudyProposals(caseId)
  const decideM = useDecideProposal(caseId)
  const memoM = useDraftMemoFromStudy(caseId)

  const [confirmRegen, setConfirmRegen] = useState(false)
  const [memoSide, setMemoSide] = useState<null | 'ask'>(null)
  const [viewVersion, setViewVersion] = useState<number | null>(null)

  // مسودة التحرير في sessionStorage بمفتاح القضية: TabsContent يُفكَّك عند
  // تبديل التبويب، وأي حالة محلية بحتة تضيع بصمت مع كل تحرير غير محفوظ.
  const [draft, setDraft] = usePageState<Record<string, string> | null>(
    `case-study-draft:${caseId}`,
    null
  )
  const baseValues = useMemo(() => {
    const v: Record<string, string> = {}
    for (const s of SECTIONS) v[s.key] = (study?.[s.key] as string) ?? ''
    return v
  }, [study])
  const values = draft ?? baseValues
  const dirty = draft != null

  const generate = () => genM.mutate(teamMember?.name ?? null)

  const save = () => {
    const input: CaseStudyInput = { updated_by: teamMember?.name ?? null }
    for (const s of SECTIONS)
      (input as Record<string, string | null>)[s.key] =
        values[s.key]?.trim() || null
    saveM.mutate(input, { onSuccess: () => setDraft(null) })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (isError) {
    return (
      <QueryErrorState
        title="تعذّر تحميل دراسة القضية"
        error={error}
        onRetry={() => refetch()}
      />
    )
  }

  // لا دراسة بعد — شاشة التوليد الأولى
  if (!study) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/10">
            <BookOpenCheck className="h-7 w-7 text-gold" />
          </div>
          <p className="text-lg font-semibold text-foreground">
            لا دراسة لهذه القضية بعد
          </p>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            يدرس الذكاء الاصطناعي ملف القضية كاملاً — البيانات والأطراف
            والجلسات والأحكام والمذكرات، ويقرأ مستندات PDF المرفقة — ثم يكتب
            دراسة وفق منهجية الشركة (وقائع، أسانيد ودفوع مع تقييمها، رأي
            قانوني، توصية) قابلة للمراجعة والتعديل.
          </p>
          <Button variant="gold" onClick={generate} disabled={genM.isPending}>
            {genM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {genM.isPending ? 'جارٍ دراسة الملف… (قد يستغرق دقيقة)' : 'توليد الدراسة بالذكاء الاصطناعي'}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-5">
      {/* الترويسة: الحالة + إعادة التوليد + الحفظ */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <BookOpenCheck className="h-5 w-5 text-gold" />
          </span>
          <span className="text-base font-semibold text-foreground">
            دراسة القضية
          </span>
          <Badge variant={study.status === 'approved' ? 'success' : 'outline'}>
            {study.status === 'approved' ? 'معتمدة' : 'مسودة'}
          </Badge>
          {versions.length > 0 && (
            <button
              type="button"
              onClick={() => setViewVersion(viewVersion == null ? versions[0].version : null)}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <History className="h-3.5 w-3.5" />
              النسخة {study.version ?? 1} · {versions.length} سابقة
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {study.status !== 'approved' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                saveM.mutate(
                  { status: 'approved', updated_by: teamMember?.name ?? null },
                  { onSuccess: () => setDraft(null) }
                )
              }
            >
              <CheckCircle2 className="h-4 w-4" />
              اعتماد
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                saveM.mutate({ status: 'draft', updated_by: teamMember?.name ?? null })
              }
            >
              إرجاع لمسودة
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMemoSide('ask')}
            disabled={memoM.isPending || !(values.defendant_defenses || values.plaintiff_grounds)}
            title="مسودة مذكرة من الأسانيد والدفوع — تُحفظ في تبويب المذكرات"
          >
            <FilePenLine className="h-4 w-4" />
            مسودة مذكرة
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmRegen(true)}
            disabled={genM.isPending}
          >
            {genM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {genM.isPending ? 'جارٍ التوليد…' : 'إعادة التوليد'}
          </Button>
          <Button variant="gold" size="sm" onClick={save} disabled={!dirty || saveM.isPending}>
            {saveM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ التعديلات
          </Button>
        </div>
      </div>

      {/* الدراسة الحيّة: أحداث الملف بعد الدراسة تعلّمها قديمة — تُجدَّد ليلاً أو الآن */}
      {study.stale_since && (
        <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-foreground">
              تغيّر الملف منذ هذه الدراسة ({(study.stale_reasons ?? []).length})
            </p>
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {(study.stale_reasons ?? []).slice(-4).map((r, i) => (
                <li key={i}>• {r.text || r.kind}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">
              تُجدَّد تلقائياً الليلة، أو الآن — التحرير اليدوي محفوظ في النسخ السابقة.
            </p>
          </div>
          <Button size="sm" variant="gold" onClick={() => { setDraft(null); generate() }} disabled={genM.isPending}>
            {genM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            حدّث الدراسة
          </Button>
        </div>
      )}

      {/* عارض نسخة سابقة (للقراءة) */}
      {viewVersion != null && (
        <Card className="border-dashed">
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm">
                <History className="h-4 w-4 text-gold" />
                <span className="font-semibold">النسخ السابقة</span>
                <select
                  className="rounded-md border bg-background px-2 py-1 text-xs"
                  value={viewVersion}
                  onChange={(e) => setViewVersion(Number(e.target.value))}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.version}>
                      نسخة {v.version} — {fmtDateTime(v.created_at)}{v.reason ? ` — ${v.reason}` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setViewVersion(null)}>إغلاق</Button>
            </div>
            {(() => {
              const v = versions.find((x) => x.version === viewVersion)
              const snap = (v?.snapshot ?? {}) as Record<string, string | null>
              return (
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  {(['legal_opinion', 'suitability'] as const).map((k) => (
                    <div key={k}>
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">
                        {k === 'legal_opinion' ? 'الرأي القانوني حينها' : 'التوصية حينها'}
                      </p>
                      <p className="whitespace-pre-wrap rounded-xl bg-muted/60 p-3 leading-relaxed">
                        {snap[k] || '—'}
                      </p>
                    </div>
                  ))}
                </div>
              )
            })()}
          </CardContent>
        </Card>
      )}

      {/* المخرجات التنفيذية — الدراسة تقترح والمحامي يعتمد بضغطة */}
      <ProposalsPanel
        proposals={proposals}
        pending={decideM.isPending}
        onDecide={(p, d) =>
          decideM.mutate({ proposal: p, decision: d, by: teamMember?.name ?? null, assigneeId: teamMember?.id ?? null })
        }
      />

      {/* الأقسام */}
      <Card>
        <CardContent className="space-y-5 p-5">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.key} className="space-y-1.5">
                <Label className="flex items-center gap-2 text-sm font-semibold">
                  <Icon className="h-4 w-4 text-gold" />
                  {s.label}
                </Label>
                <Textarea
                  rows={s.rows}
                  value={values[s.key] ?? ''}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...(d ?? baseValues),
                      [s.key]: e.target.value,
                    }))
                  }
                  className="leading-relaxed"
                />
              </div>
            )
          })}
          <p className="border-t pt-3 text-xs text-muted-foreground">
            {study.generated_at &&
              `وُلّدت: ${fmtDateTime(study.generated_at)} (${study.generated_by ?? 'ذكاء اصطناعي'})`}
            {study.updated_at && study.updated_by
              ? ` — آخر تعديل: ${fmtDateTime(study.updated_at)} بواسطة ${study.updated_by}`
              : ''}
            {' — '}الدراسة رأي مهني مساعد يولّده الذكاء الاصطناعي ويجب مراجعته
            واعتماده من محامٍ قبل البناء عليه.
          </p>
        </CardContent>
      </Card>

      {/* مسودة المذكرة: من أي جهة نحن؟ — الجانب يحدد أي قسم يصير المسودة */}
      <AlertDialog open={memoSide === 'ask'} onOpenChange={(o) => !o && setMemoSide(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>مسودة مذكرة من الدراسة</AlertDialogTitle>
            <AlertDialogDescription>
              تُنشأ مسودة في تبويب المذكرات من الأسانيد أو الدفوع والرأي القانوني والأسانيد
              النظامية — بصفتنا في الدعوى:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setMemoSide(null)
                memoM.mutate({
                  side: 'plaintiff',
                  title: 'مسودة مذكرة المدعي — من دراسة القضية',
                  text: [
                    'أولاً: الوقائع', values.facts, '',
                    'ثانياً: الطلبات', values.requests, '',
                    'ثالثاً: الأسانيد', values.plaintiff_grounds, '',
                    'رابعاً: الأسانيد النظامية', values.statutes, '',
                    'خامساً: الرأي القانوني', values.legal_opinion,
                  ].join('\n'),
                })
              }}
            >
              نحن المدعي
            </AlertDialogAction>
            <AlertDialogAction
              onClick={() => {
                setMemoSide(null)
                memoM.mutate({
                  side: 'defendant',
                  title: 'مسودة مذكرة الدفاع — من دراسة القضية',
                  text: [
                    'أولاً: الوقائع', values.facts, '',
                    'ثانياً: الدفوع', values.defendant_defenses, '',
                    'ثالثاً: الأسانيد النظامية', values.statutes, '',
                    'رابعاً: الرأي القانوني', values.legal_opinion,
                  ].join('\n'),
                })
              }}
            >
              نحن المدعى عليه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* تأكيد إعادة التوليد */}
      <AlertDialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إعادة توليد الدراسة</AlertDialogTitle>
            <AlertDialogDescription>
              سيدرس الذكاء الملف من جديد ويكتب دراسة كاملة تحل محل الحالية —{' '}
              <strong>والنسخة الحالية تُحفظ بتعديلاتك في السجل</strong> وتبقى قابلة
              للعرض. نتابع؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRegen(false)
                setDraft(null)
                generate()
              }}
            >
              إعادة التوليد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


/* ===================== المخرجات التنفيذية ===================== */

const KIND_LABEL: Record<StudyProposal['kind'], { label: string; tone: string }> = {
  task: { label: 'مهمة', tone: 'bg-gold/15 text-gold-700 dark:text-gold' },
  risk: { label: 'خطر بمهلة', tone: 'bg-destructive/10 text-destructive' },
  question: { label: 'سؤال للموكّل', tone: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
}

function ProposalsPanel({
  proposals,
  pending,
  onDecide,
}: {
  proposals: StudyProposal[]
  pending: boolean
  onDecide: (p: StudyProposal, d: 'accepted' | 'dismissed') => void
}) {
  const open = proposals.filter((p) => p.status === 'proposed')
  const decided = proposals.filter((p) => p.status !== 'proposed')
  if (proposals.length === 0) return null
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <ListChecks className="h-5 w-5 text-gold" />
          </span>
          <span className="font-semibold text-foreground">ما تقترحه الدراسة عملياً</span>
          <Badge variant="outline">{open.length} بانتظار قرارك</Badge>
        </div>
        {open.length === 0 && (
          <p className="text-sm text-muted-foreground">لا مقترحات معلّقة — كلها حُسمت.</p>
        )}
        <div className="space-y-2">
          {open.map((p) => (
            <div key={p.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-border/60 p-3">
              <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${KIND_LABEL[p.kind].tone}`}>
                {KIND_LABEL[p.kind].label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground">{p.title}</p>
                {p.detail && <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{p.detail}</p>}
                {(p.due_date || p.priority) && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {p.due_date ? `الاستحقاق ${fmtDateTime(p.due_date).split(' ')[0]}` : ''}
                    {p.due_date && p.priority ? ' · ' : ''}
                    {p.priority ?? ''}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="gold" disabled={pending} onClick={() => onDecide(p, 'accepted')}>
                  <Check className="h-3.5 w-3.5" />
                  {p.kind === 'question' ? 'سُئل' : 'اعتماد → مهمة'}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => onDecide(p, 'dismissed')}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        {decided.length > 0 && (
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">المحسومة ({decided.length})</summary>
            <ul className="mt-2 space-y-1">
              {decided.map((p) => (
                <li key={p.id}>
                  {p.status === 'accepted' ? '✓' : '✗'} {p.title}
                  {p.decided_by ? ` — ${p.decided_by}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
