// تسميات وألوان التوثيق العقاري (القيم مخزّنة بالعربية مباشرة)
import type { BadgeProps } from '@/components/ui/badge'

// الحالة: قيم عربية مخزّنة كما هي
export const PROPERTY_STATUS_OPTIONS = [
  'قيد التنفيذ',
  'مكتملة',
  'ملغاة',
] as const

export function propertyStatusBadge(
  s: string | null | undefined
): BadgeProps['variant'] {
  if (s === 'مكتملة') return 'success'
  if (s === 'ملغاة') return 'destructive'
  if (s === 'قيد التنفيذ') return 'warning'
  return 'secondary'
}

export const propertyStatusLabel = (s: string | null | undefined): string =>
  s && s.trim() !== '' ? s : '—'

// نوع المعاملة (Select + أخرى نص حر)
export const TRANSFER_TYPE_OPTIONS = [
  'نقل ملكية',
  'بيع',
  'هبة',
  'أخرى',
] as const

// نوع العقار (Select + أخرى)
export const PROPERTY_TYPE_OPTIONS = [
  'أرض',
  'فيلا',
  'شقة',
  'عمارة',
  'أخرى',
] as const
