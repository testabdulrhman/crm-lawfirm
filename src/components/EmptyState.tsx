// حالة فراغ موحّدة: أيقونة + شرح + زر إجراء، وتفرّق بين «لا بيانات إطلاقاً»
// و«الفلاتر أخفت كل شيء» — الرسالتان مختلفتان والخلط بينهما يضلّل.
// القاعدة: شرط الفراغ الحقيقي يُقيَّم على البيانات قبل الفلترة لا بعدها.
import { SearchX, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: LucideIcon
  title: string
  description?: string
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">{title}</p>
      {description && (
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <Button variant="gold" size="sm" className="mt-4" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

/** «لا نتائج مطابقة» بعد بحث/فلترة — مع زر مسح يعيد كل شيء */
export function FilteredEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-10 text-center">
      <SearchX className="mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">لا نتائج مطابقة</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        جرّب كلمات أخرى أو امسح الفلاتر.
      </p>
      <Button variant="outline" size="sm" className="mt-3" onClick={onClear}>
        مسح الفلاتر
      </Button>
    </div>
  )
}
