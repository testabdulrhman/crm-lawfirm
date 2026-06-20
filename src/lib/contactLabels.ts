// تسميات وألوان جهات الاتصال (عربية)
import type { BadgeProps } from '@/components/ui/badge'
import type { ContactCategory } from '@/types/db'

export const CATEGORY_LABELS: Record<ContactCategory, string> = {
  client: 'موكل',
  caller: 'متصل',
  service: 'جهة خدمة',
}

export const CATEGORY_BADGE: Record<ContactCategory, BadgeProps['variant']> = {
  client: 'success', // موكل = أخضر
  caller: 'default', // متصل = كحلي
  service: 'gold', // جهة خدمة = ذهبي
}

export const CATEGORY_OPTIONS: { value: ContactCategory; label: string }[] = (
  Object.keys(CATEGORY_LABELS) as ContactCategory[]
).map((value) => ({ value, label: CATEGORY_LABELS[value] }))

export const categoryLabel = (c: string | null | undefined): string =>
  c && c in CATEGORY_LABELS ? CATEGORY_LABELS[c as ContactCategory] : (c ?? '—')

export const categoryBadge = (
  c: string | null | undefined
): BadgeProps['variant'] =>
  c && c in CATEGORY_BADGE ? CATEGORY_BADGE[c as ContactCategory] : 'secondary'

// النوع (entity_type): فرد | منشأة
export const ENTITY_OPTIONS = ['فرد', 'منشأة'] as const

// المصدر (source)
export const SOURCE_LABELS: Record<string, string> = {
  manual: 'يدوي',
  whatsapp: 'واتساب',
  imported: 'مستورد',
  hatif: 'هاتف',
}

export const SOURCE_OPTIONS: { value: string; label: string }[] = Object.entries(
  SOURCE_LABELS
).map(([value, label]) => ({ value, label }))

export const sourceLabel = (s: string | null | undefined): string =>
  s && s in SOURCE_LABELS ? SOURCE_LABELS[s] : (s ?? '—')

// لون شارة المشاعر في سجل المكالمات
export function sentimentBadge(
  label: string | null | undefined
): BadgeProps['variant'] {
  if (!label) return 'secondary'
  const l = label.trim()
  if (l.includes('يجاب') || l.toLowerCase().includes('pos')) return 'success'
  if (l.includes('سلب') || l.toLowerCase().includes('neg')) return 'destructive'
  return 'secondary'
}
