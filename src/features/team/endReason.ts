// سبب انتهاء العلاقة العمالية (2026-10-18) — اختياري؛ ومكافأة نهاية الخدمة تختلف به (م٨٤ و٨٥ من نظام العمل)
export const END_REASONS = {
  resignation: 'استقالة',
  termination: 'إنهاء من المكتب',
  contract_end: 'انتهاء مدة العقد',
  mutual: 'اتفاق الطرفين',
  other: 'سبب آخر',
} as const

export type EndReason = keyof typeof END_REASONS

export const endReasonLabel = (r: string | null | undefined) =>
  r && r in END_REASONS ? END_REASONS[r as EndReason] : null
