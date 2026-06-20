// تسميات وألوان حالة الوكالة + منطق التنبيه قرب الانتهاء
import type { BadgeProps } from '@/components/ui/badge'
import type { POAStatus } from '@/types/db'
import { todayISO } from '@/lib/format'

export const POA_STATUS_LABELS: Record<POAStatus, string> = {
  active: 'سارية',
  expired: 'منتهية',
  cancelled: 'ملغاة',
}

export const POA_STATUS_BADGE: Record<POAStatus, BadgeProps['variant']> = {
  active: 'success', // أخضر
  expired: 'secondary', // رمادي
  cancelled: 'destructive', // أحمر
}

export const POA_STATUS_OPTIONS: { value: POAStatus; label: string }[] = (
  Object.keys(POA_STATUS_LABELS) as POAStatus[]
).map((value) => ({ value, label: POA_STATUS_LABELS[value] }))

export const poaStatusLabel = (s: string | null | undefined): string =>
  s && s in POA_STATUS_LABELS ? POA_STATUS_LABELS[s as POAStatus] : (s ?? '—')

export const poaStatusBadge = (
  s: string | null | undefined
): BadgeProps['variant'] =>
  s && s in POA_STATUS_BADGE ? POA_STATUS_BADGE[s as POAStatus] : 'secondary'

export const SOON_DAYS = 30

// عدد الأيام حتى الانتهاء (موجب = مستقبلي، سالب = ماضٍ)، أو null إن لا تاريخ
export function daysUntilExpiry(expiry: string | null | undefined): number | null {
  if (!expiry) return null
  const d = new Date(expiry)
  if (isNaN(d.getTime())) return null
  d.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - now.getTime()) / 86400000)
}

// سارية وتنتهي خلال 30 يوماً قادمة
export function isExpiringSoon(poa: {
  status: string | null
  expiry_date: string | null
}): boolean {
  if (poa.status !== 'active') return false
  const days = daysUntilExpiry(poa.expiry_date)
  return days != null && days >= 0 && days <= SOON_DAYS
}

// سارية مخزّنة لكن تاريخ الانتهاء ماضٍ (الحالة المخزّنة لم تُحدّث)
export function isActuallyExpired(poa: {
  status: string | null
  expiry_date: string | null
}): boolean {
  if (poa.status !== 'active') return false
  const days = daysUntilExpiry(poa.expiry_date)
  return days != null && days < 0
}

// نص تنبيه قرب الانتهاء بأرقام لاتينية (للعرض)
export function expirySoonText(expiry: string | null | undefined): string {
  const days = daysUntilExpiry(expiry)
  if (days == null) return ''
  if (days === 0) return 'تنتهي اليوم'
  if (days === 1) return 'تنتهي غداً'
  return `تنتهي خلال ${days} يوماً`
}

// ملاحظة: الترتيب الافتراضي للقائمة الآن حسب تاريخ الإصدار (poa_date) تنازلياً — انظر POAsPage.

// تاريخ اليوم (لإعادة الاستخدام)
export { todayISO }
