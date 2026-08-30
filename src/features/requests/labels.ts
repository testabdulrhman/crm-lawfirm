// تسميات وألوان الطلبات الواردة (عربية)
import type { BadgeProps } from '@/components/ui/badge'
import type { RequestStatus, RequestType } from '@/types/db'

export const STATUS_LABELS: Record<RequestStatus, string> = {
  under_review: 'قيد الدراسة',
  accepted: 'مقبول',
  rejected: 'مرفوض',
  deferred: 'مؤجّل',
}

// تعيين لون Badge لكل حالة
export const STATUS_BADGE: Record<RequestStatus, BadgeProps['variant']> = {
  under_review: 'warning', // كهرماني
  accepted: 'success', // أخضر
  rejected: 'destructive', // أحمر
  deferred: 'default', // أزرق/كحلي
}

export const TYPE_LABELS: Record<RequestType, string> = {
  case: 'قضية',
  consultation: 'استشارة',
  regulation: 'لائحة',
  contract: 'عقد',
  other: 'أخرى',
}

export const STATUS_OPTIONS: { value: RequestStatus; label: string }[] = (
  Object.keys(STATUS_LABELS) as RequestStatus[]
).map((value) => ({ value, label: STATUS_LABELS[value] }))

export const TYPE_OPTIONS: { value: RequestType; label: string }[] = (
  Object.keys(TYPE_LABELS) as RequestType[]
).map((value) => ({ value, label: TYPE_LABELS[value] }))

export const statusLabel = (s: string | null | undefined): string =>
  s && s in STATUS_LABELS ? STATUS_LABELS[s as RequestStatus] : (s ?? '—')

export const typeLabel = (t: string | null | undefined): string =>
  t && t in TYPE_LABELS ? TYPE_LABELS[t as RequestType] : (t ?? '—')

export const statusBadgeVariant = (
  s: string | null | undefined
): BadgeProps['variant'] =>
  s && s in STATUS_BADGE ? STATUS_BADGE[s as RequestStatus] : 'secondary'

/* ===== قناة الوصول — «توحيد قناة الدخول» (بند ١ من المرحلة الأولى) ===== */

export const SOURCE_OPTIONS = ['هاتف', 'حضور', 'الموقع', 'رسالة', 'إحالة'] as const

export const sourceLabel = (s: string | null | undefined): string => s || 'هاتف'

/* ===== الجلسة التمهيدية (بند ٢): الصفة والتواريخ الحرجة ===== */

export const CAPACITY_LABELS = {
  principal: 'أصيل',
  agent: 'نائب',
} as const

export const CRITICAL_KIND_LABELS = {
  notice: 'تبليغ',
  objection: 'مهلة اعتراض',
  prescription: 'تقادم',
} as const

export const criticalKindLabel = (k: string | null | undefined): string =>
  k && k in CRITICAL_KIND_LABELS
    ? CRITICAL_KIND_LABELS[k as keyof typeof CRITICAL_KIND_LABELS]
    : 'تاريخ حرج'
