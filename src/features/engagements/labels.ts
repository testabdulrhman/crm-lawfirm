// تسميات وحدة العقود (اتفاقيات الأتعاب)
import type { BadgeProps } from '@/components/ui/badge'
import type { EngagementInstallment } from '@/types/db'
import { todayISO } from '@/lib/format'

export const ENG_STATUS_OPTIONS = [
  { value: 'draft', label: 'مسودة' },
  { value: 'signed', label: 'موقّع' },
  { value: 'active', label: 'ساري' },
  { value: 'expired', label: 'منتهٍ' },
  { value: 'cancelled', label: 'ملغى' },
] as const

export type EngagementStatus = (typeof ENG_STATUS_OPTIONS)[number]['value']

export function engStatusLabel(s: string | null): string {
  return ENG_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? 'مسودة'
}

export function engStatusBadge(s: string | null): BadgeProps['variant'] {
  switch (s) {
    case 'active':
      return 'success'
    case 'signed':
      return 'gold'
    case 'expired':
      return 'secondary'
    case 'cancelled':
      return 'destructive'
    default:
      return 'outline' // مسودة
  }
}

export const ENG_TYPE_OPTIONS = [
  { value: 'case', label: 'قضية / ترافع' },
  { value: 'collection', label: 'تحصيل ديون' },
  { value: 'consultation', label: 'استشارات' },
  { value: 'bankruptcy', label: 'إجراءات إفلاس' },
  { value: 'subscription', label: 'اشتراك سنوي' },
  { value: 'other', label: 'أخرى' },
] as const

export function engTypeLabel(t: string | null): string {
  return ENG_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? '—'
}

/* ===================== من تحليل ١١٢ عقداً للمكتب (2026-10-14) ===================== */


export const FEE_MODEL_OPTIONS = [
  { value: 'fixed', label: 'مقطوع' },
  { value: 'percentage', label: 'نسبة' },
  { value: 'mixed', label: 'مقطوع + نسبة' },
  { value: 'periodic', label: 'شهري / سنوي' },
  { value: 'other', label: 'أخرى' },
] as const

export const VAT_OPTIONS = [
  { value: 'unspecified', label: 'غير مذكورة' },
  { value: 'included', label: 'شاملة الضريبة' },
  { value: 'excluded', label: 'غير شاملة الضريبة' },
  { value: 'exempt', label: 'معفاة' },
] as const

export const CLIENT_SIDE_OPTIONS = ['مدعٍ', 'مدعى عليه', 'متهم', 'مجنيّ عليه', 'طالب تنفيذ', 'منفَّذ ضده', 'مدين (إفلاس)', 'دائن', 'غير قضائي'] as const
export const STAGE_OPTIONS = ['ما قبل التقاضي / صلح', 'ابتدائي', 'استئناف', 'عليا', 'تنفيذ'] as const

export const FIRST_PARTY_OPTIONS = [
  { value: 'company', label: 'الشركة' },
  { value: 'lawyer', label: 'المحامي باسمه' },
  { value: 'trustee', label: 'أمين الإفلاس' },
] as const

export const TRIGGER_OPTIONS = [
  { value: 'on_signing', label: 'عند توقيع العقد' },
  { value: 'date', label: 'في تاريخ محدد' },
  { value: 'event', label: 'عند حدث' },
] as const

export const EVENT_KIND_OPTIONS = [
  { value: 'first_ruling', label: 'صدور الحكم الابتدائي', auto: true },
  { value: 'final_ruling', label: 'صدور الحكم النهائي', auto: false },
  { value: 'case_end', label: 'انتهاء القضية', auto: false },
  { value: 'procedure_opening', label: 'افتتاح الإجراء', auto: false },
  { value: 'plan_approval', label: 'تصديق المقترح', auto: false },
  { value: 'other', label: 'حدث آخر', auto: false },
] as const

export const eventLabel = (i: Pick<EngagementInstallment, 'event_kind' | 'event_label'>) =>
  i.event_label || EVENT_KIND_OPTIONS.find((o) => o.value === i.event_kind)?.label || 'حدث'

export type InstallmentState = 'paid' | 'overdue' | 'due' | 'waiting' | 'upcoming'

/** ما بقي من الدفعة بعد المقبوض — null إن لم تُعرف قيمتها. السداد قد يكون على دفعات (فحص 2026-10-19:
 *  كان أي مبلغ يُغلق الدفعة كلها فتسكت التذكيرات ويختفي الباقي) */
export function installmentRemaining(i: EngagementInstallment, feesTotal: number | null | undefined): number | null {
  const full = installmentAmount(i, feesTotal)
  if (full == null) return null
  if (!i.paid_at) return full
  if (i.paid_amount == null) return 0 // سجل قديم بلا مبلغ = سداد كامل
  return Math.max(0, full - i.paid_amount)
}

/** سُدّد بعضها وبقي شيء — تبقى بحالة جدولها (مستحقة/متأخرة) بالمتبقي */
export const isPartiallyPaid = (i: EngagementInstallment, feesTotal: number | null | undefined) =>
  !!i.paid_at && (installmentRemaining(i, feesTotal) ?? 0) > 0.5

/** حالة الدفعة من وقائعها — لا عمود حالة يتقادم */
export function installmentState(
  i: EngagementInstallment,
  today = todayISO(),
  feesTotal?: number | null
): InstallmentState {
  if (i.paid_at && !isPartiallyPaid(i, feesTotal)) return 'paid'
  if (i.trigger === 'on_signing') return 'due'
  if (i.trigger === 'date') {
    if (!i.due_date) return 'upcoming'
    if (i.due_date < today) return 'overdue'
    return i.due_date === today ? 'due' : 'upcoming'
  }
  if (!i.event_reached_at) return 'waiting'
  const days = (Date.parse(today) - Date.parse(i.event_reached_at)) / 86400000
  return days > 7 ? 'overdue' : 'due'
}

export const STATE_LABEL: Record<InstallmentState, string> = {
  paid: 'سُدّدت',
  overdue: 'متأخرة',
  due: 'مستحقة',
  waiting: 'بانتظار الحدث',
  upcoming: 'قادمة',
}

/** مبلغ الدفعة بالريال — المبلغ أو نسبتها من إجمالي الأتعاب */
export const installmentAmount = (i: EngagementInstallment, feesTotal: number | null | undefined): number | null =>
  i.amount ?? (i.percent != null && feesTotal ? Math.round((i.percent / 100) * feesTotal) : null)
