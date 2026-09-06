// مسار القضية — شريط مراحل يُشتق من بيانات القضية الموجودة، بلا إدخال جديد
// ولا جداول إضافية: القيد والإسناد من cases، والجلسات والأحكام من عدّاداتها.
//
// المراحل خمس ثابتة تصلح لكل الأنواع. المرحلة «الحالية» هي أول غير مكتملة.
import {
  Check,
  type LucideIcon,
  FileText,
  UserCheck,
  CalendarDays,
  Gavel,
  Landmark,
  Building2,
  ClipboardList,
  Vote,
  Stamp,
  FileCheck2,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { BANKRUPTCY_STAGES } from '@/lib/caseLabels'
import type { Case } from '@/types/db'

/** أيقونة لكل مرحلة إفلاس بترتيب BANKRUPTCY_STAGES */
const BK_ICONS: LucideIcon[] = [
  FileText, Building2, UserCheck, ClipboardList, FileCheck2, Vote, Stamp, Landmark,
]

interface Step {
  key: string
  label: string
  icon: LucideIcon
  done: boolean
  hint: string | null
}

export function buildSteps(
  c: Case,
  counts: { sessions: number; rulings: number }
): Step[] {
  const closed = c.status === 'muntahia'

  // إجراء الإفلاس مساره نظاميّ معلوم، لا «قُيّدت → حكم → إغلاق».
  // المرحلة تُضبط يدوياً (bankruptcy_stage) وما قبلها يُعدّ منجزاً.
  if (c.kind === 'bankruptcy') {
    const idx = BANKRUPTCY_STAGES.findIndex((x) => x.value === c.bankruptcy_stage)
    return BANKRUPTCY_STAGES.map((st, i) => ({
      key: st.value,
      label: st.label,
      icon: BK_ICONS[i] ?? FileText,
      done: idx >= 0 && i < idx,
      hint:
        i === idx
          ? 'المرحلة الحالية'
          : st.value === 'claims'
            ? 'التفاصيل في نظام الإفلاس'
            : null,
    }))
  }

  return [
    {
      key: 'filed',
      label: 'قُيّدت',
      icon: FileText,
      done: true, // وجود القضية نفسه هو القيد
      hint: c.open_date ? fmtDatePref(c.open_date) : null,
    },
    {
      key: 'assigned',
      label: 'أُسندت',
      icon: UserCheck,
      done: !!c.assignee_id,
      hint: c.assignee?.short_name || c.assignee?.name || null,
    },
    {
      key: 'sessions',
      label: 'الجلسات',
      icon: CalendarDays,
      done: counts.sessions > 0,
      hint:
        counts.sessions > 0
          ? `${fmtNumber(counts.sessions)} جلسة`
          : 'لم تُحدَّد بعد',
    },
    {
      key: 'ruling',
      label: 'الحكم',
      icon: Gavel,
      done: counts.rulings > 0,
      hint: counts.rulings > 0 ? `${fmtNumber(counts.rulings)} حكم` : null,
    },
    {
      key: 'closed',
      label: 'الإغلاق',
      icon: Landmark,
      done: closed,
      hint: closed && c.close_date ? fmtDatePref(c.close_date) : null,
    },
  ]
}

export function CaseJourney({
  caseData,
  counts,
}: {
  caseData: Case
  counts: { sessions: number; rulings: number }
}) {
  const steps = buildSteps(caseData, counts)
  // المرحلة الحالية = أول غير مكتملة (وإن اكتملت كلها فلا حالية)
  const currentIdx = steps.findIndex((s) => !s.done)

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold text-muted-foreground">
        {caseData.kind === 'bankruptcy' ? 'سير الإجراء' : 'مسار القضية'}
      </p>
      <ol className="flex items-start">
        {steps.map((s, i) => {
          const isCurrent = i === currentIdx
          const Icon = s.icon
          return (
            <li key={s.key} className="relative flex-1 text-center">
              {/* الخط الواصل — يُرسم خلف الدائرة ولا يظهر بعد الأخيرة */}
              {i < steps.length - 1 && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-[13px] left-0 h-0.5 w-full',
                    s.done ? 'bg-gold' : 'bg-border'
                  )}
                />
              )}
              <span
                className={cn(
                  'relative z-10 mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 bg-card',
                  s.done
                    ? 'border-gold bg-gold text-navy'
                    : isCurrent
                      ? 'border-gold text-gold ring-4 ring-gold/20'
                      : 'border-border text-muted-foreground'
                )}
              >
                {s.done ? <Check className="h-4 w-4" /> : <Icon className="h-3.5 w-3.5" />}
              </span>
              <span
                className={cn(
                  'mt-1.5 block text-sm',
                  s.done || isCurrent
                    ? 'font-semibold text-foreground'
                    : 'text-muted-foreground'
                )}
              >
                {s.label}
              </span>
              {s.hint && (
                <span className="block truncate px-1 text-xs text-muted-foreground">
                  {s.hint}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
