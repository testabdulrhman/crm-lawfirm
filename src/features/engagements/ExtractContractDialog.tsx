// استخراج بيانات العقد والتزاماته من ملفه بالذكاء الاصطناعي.
// ⚠️ لا يُكتب شيء تلقائياً: تُعرض النتيجة للمراجعة ويختار الموظف ما يُعتمد.
import { useEffect, useState } from 'react'
import { Sparkles, Loader2, AlertTriangle, CalendarClock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

import { fmtDatePref, fmtNumber } from '@/lib/format'
import { useAuth } from '@/stores/auth'
import { useExtractContract, type ContractExtraction } from '@/hooks/useAiAnalysis'
import { useUpdateEngagement } from '@/hooks/useEngagements'
import { useCreateDeadlines, obligationTypeLabel } from '@/hooks/useDeadlines'
import type { Engagement } from '@/types/db'

export function ExtractContractDialog({
  open,
  onOpenChange,
  engagement,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  engagement: Engagement
}) {
  const { teamMember } = useAuth()
  const extractM = useExtractContract()
  const updateM = useUpdateEngagement()
  const createDeadlinesM = useCreateDeadlines()

  const [result, setResult] = useState<ContractExtraction | null>(null)
  const [applyFields, setApplyFields] = useState(true)
  const [picked, setPicked] = useState<Set<number>>(new Set())

  // تشغيل الاستخراج عند الفتح، وتصفير النتيجة عند الإغلاق
  useEffect(() => {
    if (!open) {
      setResult(null)
      setPicked(new Set())
      setApplyFields(true)
      return
    }
    if (!engagement.file_url) return
    extractM.mutate(engagement.file_url, {
      onSuccess: (r) => {
        setResult(r)
        setPicked(new Set(r.obligations.map((_, i) => i)))
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // الحقول التي سيملؤها الاستخراج — الفارغة في العقد فقط، لا نطمس ما أُدخل يدوياً
  const changes = result ? fieldChanges(engagement, result) : []

  const onApply = async () => {
    if (!result) return

    if (applyFields && changes.length > 0) {
      const input: Record<string, unknown> = {}
      for (const c of changes) input[c.key] = c.next
      input.extracted_at = new Date().toISOString()
      input.extract_summary = result.summary ?? null
      await updateM.mutateAsync({ id: engagement.id, input: input as never })
    }

    const rows = result.obligations
      .filter((_, i) => picked.has(i))
      .map((o) => ({
        engagement_id: engagement.id,
        title: o.title,
        deadline_date: o.due_date,
        type: o.type ?? 'other',
        notes: o.notes ?? null,
        source: 'ai_contract' as const,
        created_by: teamMember?.id ?? null,
      }))
    if (rows.length > 0) await createDeadlinesM.mutateAsync(rows)

    onOpenChange(false)
  }

  const busy = extractM.isPending
  const saving = updateM.isPending || createDeadlinesM.isPending
  const nothingToApply =
    !!result && picked.size === 0 && (!applyFields || changes.length === 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-gold" />
            استخراج بيانات العقد
          </DialogTitle>
          <DialogDescription>
            يقرأ الذكاء الاصطناعي ملف العقد ويقترح بياناته والتزاماته. راجِعها قبل
            الاعتماد — الاستخراج الآلي يخطئ.
          </DialogDescription>
        </DialogHeader>

        {busy ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gold" />
            <p className="text-sm text-muted-foreground">
              يُقرأ العقد… قد يستغرق نصف دقيقة.
            </p>
          </div>
        ) : !result ? (
          <div className="py-8 text-center">
            <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              لم يُستخرج شيء. أغلِق الحوار وأعد المحاولة.
            </p>
          </div>
        ) : (
          <div className="max-h-[55vh] space-y-5 overflow-y-auto pl-1">
            {result.summary && (
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground">ملخّص العقد</p>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {result.summary}
                </p>
              </div>
            )}

            {/* الحقول */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  id="apply-fields"
                  type="checkbox"
                  checked={applyFields && changes.length > 0}
                  onChange={(e) => setApplyFields(e.target.checked)}
                  disabled={changes.length === 0}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-gold"
                />
                <label htmlFor="apply-fields" className="text-sm font-semibold">
                  تعبئة بيانات العقد ({fmtNumber(changes.length)})
                </label>
              </div>
              {changes.length === 0 ? (
                <p className="pr-6 text-xs text-muted-foreground">
                  لا جديد — الحقول المعبّأة في العقد لا تُطمس، والمستخرَج لا يضيف عليها.
                </p>
              ) : (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-xl border p-3 sm:grid-cols-2">
                  {changes.map((c) => (
                    <div key={c.key}>
                      <dt className="text-xs text-muted-foreground">{c.label}</dt>
                      <dd className="text-sm text-foreground">{c.display}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </section>

            {/* الالتزامات */}
            <section className="space-y-2">
              <p className="text-sm font-semibold">
                الالتزامات والمواعيد ({fmtNumber(result.obligations.length)})
              </p>
              {result.obligations.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  لم يُعثر على التزامات بتواريخ محدّدة في العقد.
                </p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-xl border">
                  {result.obligations.map((o, i) => (
                    <li key={i} className="flex items-start gap-3 p-3">
                      <input
                        type="checkbox"
                        checked={picked.has(i)}
                        onChange={(ev) =>
                          setPicked((s) => {
                            const n = new Set(s)
                            if (ev.target.checked) n.add(i)
                            else n.delete(i)
                            return n
                          })
                        }
                        aria-label={o.title}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-gold"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{o.title}</p>
                        {o.notes && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {o.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {fmtDatePref(o.due_date)}
                        </span>
                        <Badge variant="outline" className="font-normal">
                          {obligationTypeLabel(o.type)}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {result.hijri_note && (
              <Alert>
                <AlertDescription className="text-xs">
                  تواريخ هجرية وردت في العقد: {result.hijri_note}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="gold"
            disabled={!result || saving || nothingToApply}
            onClick={onApply}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            اعتماد المحدَّد
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---- الحقول الفارغة في العقد التي وجد لها الاستخراج قيمة ---- */

interface FieldChange {
  key: string
  label: string
  next: unknown
  display: string
}

function fieldChanges(e: Engagement, r: ContractExtraction): FieldChange[] {
  const out: FieldChange[] = []
  const add = (
    key: string,
    label: string,
    current: unknown,
    next: unknown,
    display?: string
  ) => {
    const isEmpty = current === null || current === undefined || current === ''
    if (!isEmpty) return // لا نطمس ما أُدخل يدوياً
    if (next === null || next === undefined || next === '') return
    out.push({ key, label, next, display: display ?? String(next) })
  }

  add('type', 'نوع العقد', e.type, r.type)
  add('signed_date', 'تاريخ التوقيع', e.signed_date, r.signed_date,
    r.signed_date ? fmtDatePref(r.signed_date) : undefined)
  add('start_date', 'بداية السريان', e.start_date, r.start_date,
    r.start_date ? fmtDatePref(r.start_date) : undefined)
  add('end_date', 'نهاية السريان', e.end_date, r.end_date,
    r.end_date ? fmtDatePref(r.end_date) : undefined)
  add('fees_total', 'إجمالي الأتعاب', e.fees_total, r.fees_total,
    r.fees_total != null ? `${fmtNumber(r.fees_total)} ريال` : undefined)
  add('payment_terms', 'طريقة الدفع', e.payment_terms, r.payment_terms)
  add('scope', 'نطاق العمل', e.scope, r.scope)
  add('auto_renew', 'التجديد التلقائي', null, r.auto_renew,
    r.auto_renew === null ? undefined : r.auto_renew ? 'نعم' : 'لا')
  add('notice_period_days', 'مهلة الإشعار بالإنهاء', null, r.notice_period_days,
    r.notice_period_days != null ? `${fmtNumber(r.notice_period_days)} يوماً` : undefined)

  return out
}
