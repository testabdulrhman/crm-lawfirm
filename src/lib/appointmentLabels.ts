// تسميات وألوان حالة الموعد
import type { BadgeProps } from '@/components/ui/badge'
import type { AppointmentStatus } from '@/types/db'

export const APPT_STATUS_LABELS: Record<AppointmentStatus, string> = {
  confirmed: 'مؤكّد',
  completed: 'مكتمل',
  cancelled: 'ملغى',
  no_show: 'لم يحضر',
}

export const APPT_STATUS_BADGE: Record<AppointmentStatus, BadgeProps['variant']> = {
  confirmed: 'success', // أخضر
  completed: 'secondary', // رمادي
  cancelled: 'destructive', // أحمر
  no_show: 'warning', // كهرماني
}

export const APPT_STATUS_OPTIONS: { value: AppointmentStatus; label: string }[] =
  (Object.keys(APPT_STATUS_LABELS) as AppointmentStatus[]).map((value) => ({
    value,
    label: APPT_STATUS_LABELS[value],
  }))

export const apptStatusLabel = (s: string | null | undefined): string =>
  s && s in APPT_STATUS_LABELS
    ? APPT_STATUS_LABELS[s as AppointmentStatus]
    : (s ?? '—')

export const apptStatusBadge = (
  s: string | null | undefined
): BadgeProps['variant'] =>
  s && s in APPT_STATUS_BADGE
    ? APPT_STATUS_BADGE[s as AppointmentStatus]
    : 'secondary'

// ── حقول الحجز الإلكتروني من الموقع (redwan.sa/appointments) ──

// أسماء الخدمات: النسخة الحيّة في lookup_values.booking_config.services
// وهذه للعرض فقط داخل الـCRM حين لا تُجلب الإعدادات.
const SERVICE_LABELS: Record<string, string> = {
  general: 'استشارة قانونية عامة',
  civil: 'القضايا المدنية والتجارية',
  labor: 'قضايا العمل والعمال',
  criminal: 'القضايا الجنائية',
  realestate: 'النزاعات العقارية',
  bankruptcy: 'الإفلاس والتصفية',
  arbitration: 'التحكيم',
  notarization: 'التوثيق',
  realestate_registration: 'التسجيل العيني للعقار',
  other: 'أخرى',
}

export const serviceTypeLabel = (k: string | null | undefined): string | null =>
  k ? (SERVICE_LABELS[k] ?? k) : null

export const meetingMethodLabel = (m: string | null | undefined): string | null =>
  m === 'remote' ? 'عن بُعد' : m === 'onsite' ? 'حضوري' : null

export const sourceLabel = (s: string | null | undefined): string | null =>
  s === 'website' ? 'من الموقع' : s === 'manual' ? 'يدوي' : s || null
