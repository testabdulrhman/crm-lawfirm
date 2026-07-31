// تبويب «دراسة القضية» — توليد أولي بالذكاء الاصطناعي وفق منهجية الشركة، ثم مراجعة وتحرير يدوي
import { useEffect, useState } from 'react'
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
import { fmtDateTime } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import {
  useCaseStudy,
  useSaveCaseStudy,
  useGenerateCaseStudy,
  type CaseStudyInput,
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
]

export function StudyTab({ caseId }: { caseId: string }) {
  const { teamMember } = useAuth()
  const { data: study, isLoading } = useCaseStudy(caseId)
  const saveM = useSaveCaseStudy(caseId)
  const genM = useGenerateCaseStudy(caseId)

  const [values, setValues] = useState<Record<string, string>>({})
  const [dirty, setDirty] = useState(false)
  const [confirmRegen, setConfirmRegen] = useState(false)

  // تعبئة الحقول من الدراسة المحفوظة (وعدم مسح تحرير جارٍ)
  useEffect(() => {
    if (study && !dirty) {
      const v: Record<string, string> = {}
      for (const s of SECTIONS) v[s.key] = (study[s.key] as string) ?? ''
      setValues(v)
    }
  }, [study, dirty])

  const generate = () => genM.mutate(teamMember?.name ?? null)

  const save = () => {
    const input: CaseStudyInput = { updated_by: teamMember?.name ?? null }
    for (const s of SECTIONS)
      (input as Record<string, string | null>)[s.key] =
        values[s.key]?.trim() || null
    saveM.mutate(input, { onSuccess: () => setDirty(false) })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
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
            <BookOpenCheck className="h-[18px] w-[18px] text-gold" />
          </span>
          <span className="text-[15px] font-semibold text-foreground">
            دراسة القضية
          </span>
          <Badge variant={study.status === 'approved' ? 'success' : 'outline'}>
            {study.status === 'approved' ? 'معتمدة' : 'مسودة'}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {study.status !== 'approved' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                saveM.mutate(
                  { status: 'approved', updated_by: teamMember?.name ?? null },
                  { onSuccess: () => setDirty(false) }
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

      {/* الأقسام العشرة */}
      <Card>
        <CardContent className="space-y-5 p-5">
          {SECTIONS.map((s) => {
            const Icon = s.icon
            return (
              <div key={s.key} className="space-y-1.5">
                <Label className="flex items-center gap-2 text-[13px] font-semibold">
                  <Icon className="h-4 w-4 text-gold" />
                  {s.label}
                </Label>
                <Textarea
                  rows={s.rows}
                  value={values[s.key] ?? ''}
                  onChange={(e) => {
                    setValues((v) => ({ ...v, [s.key]: e.target.value }))
                    setDirty(true)
                  }}
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

      {/* تأكيد إعادة التوليد */}
      <AlertDialog open={confirmRegen} onOpenChange={setConfirmRegen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إعادة توليد الدراسة</AlertDialogTitle>
            <AlertDialogDescription>
              سيدرس الذكاء الملف من جديد ويكتب دراسة كاملة{' '}
              <strong>تستبدل النص الحالي بكل تعديلاتك اليدوية</strong>. متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRegen(false)
                setDirty(false)
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
