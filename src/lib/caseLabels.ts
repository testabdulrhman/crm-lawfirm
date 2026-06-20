// تسميات وألوان القضايا (عربية)
import type { BadgeProps } from '@/components/ui/badge'
import type { CaseStatus } from '@/types/db'

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  jarri: 'جارية',
  muntahia: 'منتهية',
  muallaq: 'معلّقة',
}

export const CASE_STATUS_BADGE: Record<CaseStatus, BadgeProps['variant']> = {
  jarri: 'success', // أخضر
  muntahia: 'secondary', // رمادي
  muallaq: 'warning', // كهرماني
}

export const CASE_STATUS_OPTIONS: { value: CaseStatus; label: string }[] = (
  Object.keys(CASE_STATUS_LABELS) as CaseStatus[]
).map((value) => ({ value, label: CASE_STATUS_LABELS[value] }))

export const caseStatusLabel = (s: string | null | undefined): string =>
  s && s in CASE_STATUS_LABELS
    ? CASE_STATUS_LABELS[s as CaseStatus]
    : (s ?? '—')

export const caseStatusBadge = (
  s: string | null | undefined
): BadgeProps['variant'] =>
  s && s in CASE_STATUS_BADGE ? CASE_STATUS_BADGE[s as CaseStatus] : 'secondary'

// ترتيب فرز الحالات: الجارية ثم المعلّقة ثم المنتهية
export const CASE_STATUS_ORDER: Record<string, number> = {
  jarri: 0,
  muallaq: 1,
  muntahia: 2,
}

// أنواع القضايا الموجودة فعلاً (قائمة ثابتة + «أخرى» نص حر)
export const CASE_TYPES = [
  'جزائي',
  'عامة',
  'تجاري',
  'أحوال شخصية',
  'عمالي',
  'إداري',
  'إفلاس',
] as const

export const caseTypeLabel = (t: string | null | undefined): string =>
  t && t.trim() !== '' ? t : 'غير محدّد'
