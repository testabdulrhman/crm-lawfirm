import { Check, ArrowLeft, X } from 'lucide-react'

import { cn } from '@/lib/utils'
import type { IncomingRequest, RequestEvaluation } from '@/types/db'
import type { GateState } from '@/hooks/useIntakeGates'

// شريط المسار الموجّه (نمط Path) — اختيار المستخدم بعد مقارنة الأنماط
// الثلاثة (2026-08-30): بوصلة لا قفل. الدوائر تُحسب من البيانات الحقيقية،
// والنقر يطير للقسم، وزر ذهبي واحد يدل على التالية — ولا شيء ممنوع.
//
// المراحل بترتيب الوثيقة كما هي مبنية في هذا التبويب اليوم:
// استقبال ← تعارض ← KYC ← مذكرة ← قرار ← فتح الملف.
// («العقد والوكالة» تُدرج دائرةً سابعة حين تُبنى المرحلة الثالثة.)

interface Stage {
  key: string
  label: string
  done: boolean
  danger?: boolean
  target: string
  action?: 'conflict' | 'kyc'
  nextLabel: string
}

function stagesOf(
  r: IncomingRequest,
  gates: GateState,
  memoApproved: boolean
): Stage[] {
  const rejected = r.status === 'rejected'
  return [
    {
      key: 'intake',
      label: 'الاستقبال',
      done: true,
      target: 'request-head',
      nextLabel: '',
    },
    {
      key: 'conflict',
      label: 'فحص التعارض',
      done: !!gates.conflict,
      danger: gates.conflict?.outcome === 'reject',
      target: 'intake-gates',
      action: 'conflict',
      nextLabel: 'إجراء فحص التعارض',
    },
    {
      key: 'kyc',
      label: 'KYC',
      done: !!gates.kyc?.id_verified,
      target: 'intake-gates',
      action: 'kyc',
      nextLabel: 'استيفاء العناية الواجبة',
    },
    {
      key: 'memo',
      label: 'مذكرة التقييم',
      done: memoApproved,
      target: 'evaluations-section',
      nextLabel: 'كتابة مذكرة التقييم',
    },
    {
      key: 'decision',
      label: 'القرار',
      done: r.status === 'accepted' || rejected,
      danger: rejected,
      target: 'decision-card',
      nextLabel: 'تسجيل القرار',
    },
    {
      key: 'open',
      label: 'فتح الملف',
      done: !!r.converted_to_id,
      target: 'decision-card',
      nextLabel: 'التحويل إلى ملف',
    },
  ]
}

function goTo(s: Stage) {
  document
    .getElementById(s.target)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  if (s.action)
    window.dispatchEvent(
      new CustomEvent('gates:open', { detail: s.action })
    )
}

export function RequestRail({
  request: r,
  gates,
  evaluations,
}: {
  request: IncomingRequest
  gates: GateState
  evaluations: RequestEvaluation[]
}) {
  const memoApproved = evaluations.some((e) => e.approved_at)
  const stages = stagesOf(r, gates, memoApproved)
  const next = stages.find((s) => !s.done)
  const rejected = r.status === 'rejected'

  return (
    <div className="rounded-2xl bg-card p-4 shadow-[0_1px_3px_rgba(17,29,58,0.06)]">
      {/* الدوائر — الماضي ذهبي، الحالية كحلية، القادم باهت. النقر يطير للقسم */}
      <div className="flex items-start overflow-x-auto pb-1">
        {stages.map((s, i) => {
          const isNext = next?.key === s.key
          return (
            <button
              key={s.key}
              onClick={() => goTo(s)}
              className="group relative flex min-w-[72px] flex-1 flex-col items-center gap-1.5"
              title={s.label}
            >
              {/* الوصلة */}
              {i < stages.length - 1 && (
                <span
                  className={cn(
                    'absolute top-[13px] h-0.5 w-[calc(100%-32px)]',
                    'start-[calc(50%+16px)]',
                    s.done ? 'bg-gold' : 'bg-border'
                  )}
                />
              )}
              <span
                className={cn(
                  'z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-shadow',
                  s.danger
                    ? 'bg-destructive/15 text-destructive'
                    : s.done
                      ? 'bg-gold text-navy'
                      : isNext
                        ? 'bg-navy text-gold shadow-[0_0_0_4px_rgba(201,168,76,0.28)]'
                        : 'bg-muted text-muted-foreground/60'
                )}
              >
                {s.danger ? (
                  <X className="h-3.5 w-3.5" />
                ) : s.done ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  'text-center text-[10.5px] leading-tight',
                  s.done || isNext
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground/70'
                )}
              >
                {s.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* الموجّه: زر واحد — أو خاتمة صريحة */}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/50 pt-3">
        {rejected ? (
          <p className="text-sm text-destructive">
            سُجّل الرفض
            {r.rejection_reason ? ` — ${r.rejection_reason}` : ''} — المسار
            انتهى هنا، والسجل باقٍ.
          </p>
        ) : next ? (
          <>
            <p className="text-xs text-muted-foreground">
              بوصلة لا قفل — تقدر تقفز لأي قسم، وهذا أقرب طريق.
            </p>
            <button
              onClick={() => goTo(next)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-sm font-semibold text-navy transition-transform hover:scale-[1.03]"
            >
              الخطوة التالية: {next.nextLabel}
              <ArrowLeft className="h-4 w-4" />
            </button>
          </>
        ) : (
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
            ✓ اكتمل المسار — الطلب صار ملفاً برحلته الخاصة.
          </p>
        )}
      </div>
    </div>
  )
}
