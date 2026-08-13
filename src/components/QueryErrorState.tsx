// حالة فشل تحميل موحّدة: السبب الحقيقي + إعادة محاولة + رجوع.
// تحل محل «تعذّر تحميل X» الجافة، وتمنع أخطر تضليل: عرض «لا توجد بيانات»
// بينما الاستعلام فشل أصلاً — كل قائمة تفحص isError قبل EmptyState.
import { AlertTriangle, RotateCw, ArrowRight } from 'lucide-react'
import { useLocation } from 'wouter'

import { Button } from '@/components/ui/button'
import { errMessage } from '@/lib/errors'

export function QueryErrorState({
  title = 'تعذّر تحميل البيانات',
  error,
  onRetry,
  backTo,
  backLabel = 'رجوع',
}: {
  title?: string
  error?: unknown
  /** أعِد محاولة الاستعلام (refetch) */
  onRetry?: () => void
  /** مسار الرجوع — يظهر زر رجوع إن حُدّد */
  backTo?: string
  backLabel?: string
}) {
  const [, navigate] = useLocation()
  const reason = error ? errMessage(error) : null

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-12 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="h-6 w-6 text-destructive" />
      </div>
      <p className="font-semibold text-foreground">{title}</p>
      {reason && (
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{reason}</p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <Button variant="gold" size="sm" onClick={onRetry}>
            <RotateCw className="h-4 w-4" />
            إعادة المحاولة
          </Button>
        )}
        {backTo && (
          <Button variant="outline" size="sm" onClick={() => navigate(backTo)}>
            <ArrowRight className="h-4 w-4" />
            {backLabel}
          </Button>
        )}
      </div>
    </div>
  )
}
