// تسميات وألوان الخدمات القانونية
import type { BadgeProps } from '@/components/ui/badge'
import type { LegalServiceStatus, LegalServiceType } from '@/types/db'

export const LS_TYPE_LABELS: Record<LegalServiceType, string> = {
  consultation: 'استشارة',
  regulation: 'لائحة',
  contract: 'عقد',
}

export const LS_TYPE_BADGE: Record<LegalServiceType, BadgeProps['variant']> = {
  consultation: 'default', // أزرق/كحلي
  regulation: 'gold', // كهرماني (بنفسجي غير متوفّر في المتغيّرات)
  contract: 'warning',
}

export const LS_TYPE_OPTIONS: { value: LegalServiceType; label: string }[] = (
  Object.keys(LS_TYPE_LABELS) as LegalServiceType[]
).map((value) => ({ value, label: LS_TYPE_LABELS[value] }))

export const lsTypeLabel = (t: string | null | undefined): string =>
  t && t in LS_TYPE_LABELS ? LS_TYPE_LABELS[t as LegalServiceType] : (t ?? '—')

export const lsTypeBadge = (
  t: string | null | undefined
): BadgeProps['variant'] =>
  t && t in LS_TYPE_BADGE ? LS_TYPE_BADGE[t as LegalServiceType] : 'secondary'

export const LS_STATUS_LABELS: Record<LegalServiceStatus, string> = {
  draft: 'مسودة',
  in_progress: 'قيد العمل',
  delivered: 'مُسلّمة',
}

export const LS_STATUS_BADGE: Record<LegalServiceStatus, BadgeProps['variant']> = {
  draft: 'secondary',
  in_progress: 'default',
  delivered: 'success',
}

export const LS_STATUS_OPTIONS: { value: LegalServiceStatus; label: string }[] = (
  Object.keys(LS_STATUS_LABELS) as LegalServiceStatus[]
).map((value) => ({ value, label: LS_STATUS_LABELS[value] }))

export const lsStatusLabel = (s: string | null | undefined): string =>
  s && s in LS_STATUS_LABELS ? LS_STATUS_LABELS[s as LegalServiceStatus] : (s ?? '—')

export const lsStatusBadge = (
  s: string | null | undefined
): BadgeProps['variant'] =>
  s && s in LS_STATUS_BADGE ? LS_STATUS_BADGE[s as LegalServiceStatus] : 'secondary'

// قيم شائعة (Select + «أخرى» نص حر في النموذج)
export const SERVICE_KIND_OPTIONS = ['إعداد', 'مراجعة', 'اعتراض', 'صياغة'] as const
export const REGULATION_TYPE_OPTIONS = ['اعتراضية', 'جوابية', 'أخرى'] as const
export const CONTRACT_TYPE_OPTIONS = ['عقد شراكة', 'عقد عمل', 'أخرى'] as const
