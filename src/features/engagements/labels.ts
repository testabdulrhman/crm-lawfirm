// تسميات وحدة العقود (اتفاقيات الأتعاب)
import type { BadgeProps } from '@/components/ui/badge'

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
  { value: 'consultation', label: 'استشارات' },
  { value: 'bankruptcy', label: 'إجراءات إفلاس' },
  { value: 'subscription', label: 'اشتراك سنوي' },
  { value: 'other', label: 'أخرى' },
] as const

export function engTypeLabel(t: string | null): string {
  return ENG_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? '—'
}
