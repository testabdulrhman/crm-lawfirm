// تسميات وألوان طلبات التوظيف (عربية)
import type { BadgeProps } from '@/components/ui/badge'
import type { StaffApplicationStatus } from '@/types/db'

export const APP_STATUS_LABELS: Record<StaffApplicationStatus, string> = {
  pending: 'قيد المراجعة',
  approved: 'مُعتمد',
  rejected: 'مرفوض',
}

export const APP_STATUS_BADGE: Record<
  StaffApplicationStatus,
  BadgeProps['variant']
> = {
  pending: 'warning', // كهرماني
  approved: 'success', // أخضر
  rejected: 'destructive', // أحمر
}

export const APP_STATUS_OPTIONS: {
  value: StaffApplicationStatus
  label: string
}[] = (Object.keys(APP_STATUS_LABELS) as StaffApplicationStatus[]).map(
  (value) => ({ value, label: APP_STATUS_LABELS[value] })
)

export const appStatusLabel = (s: string | null | undefined): string =>
  s && s in APP_STATUS_LABELS
    ? APP_STATUS_LABELS[s as StaffApplicationStatus]
    : (s ?? '—')

export const appStatusBadge = (
  s: string | null | undefined
): BadgeProps['variant'] =>
  s && s in APP_STATUS_BADGE
    ? APP_STATUS_BADGE[s as StaffApplicationStatus]
    : 'secondary'

export const idTypeLabel = (t: string | null | undefined): string =>
  t === 'iqama' ? 'إقامة' : t === 'national' ? 'هوية وطنية' : (t ?? '—')

// أدوار مقترحة عند الاعتماد
export const ROLE_OPTIONS = [
  'محامٍ',
  'مساعد قانوني',
  'إداري',
  'محاسب',
  'موظف',
] as const
