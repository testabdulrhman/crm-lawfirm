// أنواع قيود الرواتب وشاراتها
import type { BadgeProps } from '@/components/ui/badge'

export const PAY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'salary', label: 'راتب' },
  { value: 'bonus', label: 'مكافأة' },
  { value: 'allowance', label: 'بدل' },
  { value: 'deduction', label: 'خصم' },
  { value: 'other', label: 'أخرى' },
]

const LABELS: Record<string, string> = Object.fromEntries(
  PAY_TYPE_OPTIONS.map((o) => [o.value, o.label])
)

export const payTypeLabel = (t: string | null | undefined): string =>
  (t && LABELS[t]) || t || '—'

export const payTypeBadge = (
  t: string | null | undefined
): BadgeProps['variant'] => {
  switch (t) {
    case 'salary':
      return 'gold'
    case 'bonus':
      return 'success'
    case 'allowance':
      return 'secondary'
    case 'deduction':
      return 'destructive'
    default:
      return 'outline'
  }
}

// الخصم يُخزَّن موجباً ويُحتسب سالباً في الصافي
export const signedAmount = (e: { entry_type: string; amount: number }) =>
  e.entry_type === 'deduction' ? -Math.abs(e.amount) : Math.abs(e.amount)
