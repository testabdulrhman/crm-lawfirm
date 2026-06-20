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

/* ===== الأطراف: الصفة (party_side) ===== */

export type PartySideValue = 'plaintiff' | 'defendant'

export const PARTY_SIDE_LABELS: Record<PartySideValue, string> = {
  plaintiff: 'مدّعٍ',
  defendant: 'مدّعى عليه',
}

export const PARTY_SIDE_BADGE: Record<PartySideValue, BadgeProps['variant']> = {
  plaintiff: 'success', // أخضر
  defendant: 'destructive', // أحمر
}

export const PARTY_SIDE_OPTIONS: { value: PartySideValue; label: string }[] = (
  Object.keys(PARTY_SIDE_LABELS) as PartySideValue[]
).map((value) => ({ value, label: PARTY_SIDE_LABELS[value] }))

export const partySideLabel = (s: string | null | undefined): string =>
  s && s in PARTY_SIDE_LABELS ? PARTY_SIDE_LABELS[s as PartySideValue] : (s ?? '—')

export const partySideBadge = (
  s: string | null | undefined
): BadgeProps['variant'] =>
  s && s in PARTY_SIDE_BADGE ? PARTY_SIDE_BADGE[s as PartySideValue] : 'secondary'

/* ===== الجلسات: تطبيع الحالة (مختلطة عربي/إنجليزي) ===== */

// نطبّع الحالة الخام إلى: 'قادمة' | 'منعقدة' | 'مؤجّلة'
export type SessionStatusNorm = 'قادمة' | 'منعقدة' | 'مؤجّلة'

function normSessionStatus(raw: string | null | undefined): SessionStatusNorm {
  const v = (raw ?? '').trim().toLowerCase()
  if (v === 'held' || v === 'منعقدة') return 'منعقدة'
  if (v === 'postponed' || v === 'مؤجّلة' || v === 'مؤجلة') return 'مؤجّلة'
  return 'قادمة' // upcoming / قادمة / الافتراضي
}

export const SESSION_STATUS_OPTIONS: { value: SessionStatusNorm; label: string }[] = [
  { value: 'قادمة', label: 'قادمة' },
  { value: 'منعقدة', label: 'منعقدة' },
  { value: 'مؤجّلة', label: 'مؤجّلة' },
]

export const sessionStatusLabel = (raw: string | null | undefined): string =>
  normSessionStatus(raw)

export const sessionStatusBadge = (
  raw: string | null | undefined
): BadgeProps['variant'] => {
  const s = normSessionStatus(raw)
  if (s === 'منعقدة') return 'success' // أخضر
  if (s === 'مؤجّلة') return 'secondary'
  return 'warning' // قادمة = كهرماني
}

export const isSessionHeld = (raw: string | null | undefined): boolean =>
  normSessionStatus(raw) === 'منعقدة'

export const isSessionUpcoming = (raw: string | null | undefined): boolean =>
  normSessionStatus(raw) === 'قادمة'

/* ===== المهام: الأولوية والحالة ===== */

export type TaskPriorityValue = 'low' | 'med' | 'high'

export const TASK_PRIORITY_LABELS: Record<TaskPriorityValue, string> = {
  low: 'منخفضة',
  med: 'متوسطة',
  high: 'عالية',
}

export const TASK_PRIORITY_BADGE: Record<
  TaskPriorityValue,
  BadgeProps['variant']
> = {
  low: 'secondary', // رمادي
  med: 'default', // أزرق/كحلي
  high: 'destructive', // أحمر
}

export const TASK_PRIORITY_OPTIONS: { value: TaskPriorityValue; label: string }[] =
  (Object.keys(TASK_PRIORITY_LABELS) as TaskPriorityValue[]).map((value) => ({
    value,
    label: TASK_PRIORITY_LABELS[value],
  }))

export const taskPriorityLabel = (p: string | null | undefined): string =>
  p && p in TASK_PRIORITY_LABELS
    ? TASK_PRIORITY_LABELS[p as TaskPriorityValue]
    : 'متوسطة'

export const taskPriorityBadge = (
  p: string | null | undefined
): BadgeProps['variant'] =>
  p && p in TASK_PRIORITY_BADGE
    ? TASK_PRIORITY_BADGE[p as TaskPriorityValue]
    : 'default'

// ترتيب الأولوية للفرز (high أولاً)
export const TASK_PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  med: 1,
  low: 2,
}

export const taskStatusLabel = (s: string | null | undefined): string =>
  s === 'done' ? 'مكتملة' : 'قيد التنفيذ'

/* ===== المذكرات ===== */

export const memoPartyLabel = (s: string | null | undefined): string =>
  s === 'defendant' ? 'المدّعى عليه' : 'المدّعي'

export const memoPartyBadge = (
  s: string | null | undefined
): BadgeProps['variant'] => (s === 'defendant' ? 'destructive' : 'success')

export const MEMO_PARTY_OPTIONS = [
  { value: 'plaintiff', label: 'المدّعي' },
  { value: 'defendant', label: 'المدّعى عليه' },
] as const

export const memoMethodLabel = (m: string | null | undefined): string =>
  m === 'electronic' ? 'إلكتروني' : 'يدوي'

export const MEMO_METHOD_OPTIONS = [
  { value: 'manual', label: 'يدوي' },
  { value: 'electronic', label: 'إلكتروني' },
] as const
