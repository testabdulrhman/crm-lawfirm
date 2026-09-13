// رصيد الإجازة السنوية — في «الإجازات والاستئذان» (رصيدي) وصفحة الموظف (للمدير ولصاحبها).
// الحساب كله في القاعدة (leave_balance): ٢١ يوماً، و٣٠ بعد خمس سنوات متصلة (م١٠٩ نظام العمل).
import { Sun } from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { fmtDatePref, fmtNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useLeaveBalance } from '@/hooks/useHrRequests'

const yearsLabel = (n: number) =>
  n < 1 ? 'أقل من سنة' : n === 1 ? 'سنة' : n === 2 ? 'سنتان' : n <= 10 ? `${fmtNumber(n)} سنوات` : `${fmtNumber(n)} سنة`

export function LeaveBalanceCard({ memberId, isSelf = true }: { memberId?: string | null; isSelf?: boolean }) {
  const { data: b, isLoading, error } = useLeaveBalance(memberId)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2.5 text-base font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gold/10">
            <Sun className="h-[18px] w-[18px] text-gold" />
          </span>
          رصيد الإجازة السنوية
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : error ? (
          <p className="text-sm text-muted-foreground">تعذّر حساب الرصيد</p>
        ) : b?.missing_join_date ? (
          <p className="text-sm text-muted-foreground">
            {isSelf
              ? 'لم يُسجَّل تاريخ تعيينك بعد — يُحسب الرصيد متى سجّله المدير.'
              : 'لم يُسجَّل تاريخ تعيين الموظف — عدّل بياناته ليُحسب الرصيد.'}
          </p>
        ) : b?.not_started ? (
          <p className="text-sm text-muted-foreground">
            يبدأ الرصيد من تاريخ التعيين ({fmtDatePref(b.join_date)}).
          </p>
        ) : b && b.entitlement != null ? (
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className={cn('text-4xl font-bold', (b.remaining ?? 0) < 0 ? 'text-destructive' : 'text-foreground')}>
                {fmtNumber(b.remaining ?? 0)}
              </span>
              <span className="text-sm text-muted-foreground">من أصل {fmtNumber(b.entitlement)} يوماً</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gold"
                style={{ width: `${Math.min(100, ((b.used ?? 0) / Math.max(1, b.entitlement)) * 100)}%` }}
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-muted px-2.5 py-1 text-foreground">استُخدم: {fmtNumber(b.used ?? 0)}</span>
              {(b.pending ?? 0) > 0 && (
                <span className="rounded-full bg-gold/10 px-2.5 py-1 text-gold-600 dark:text-gold-300">
                  قيد الاعتماد: {fmtNumber(b.pending ?? 0)}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              سنة الخدمة {fmtDatePref(b.service_year_start ?? null)} ← {fmtDatePref(b.service_year_end ?? null)} · خدمة{' '}
              {yearsLabel(b.years_of_service ?? 0)}
            </p>
            <p className="text-[11px] text-muted-foreground">21 يوماً في السنة، و30 بعد خمس سنوات متصلة — بأيام التقويم.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
