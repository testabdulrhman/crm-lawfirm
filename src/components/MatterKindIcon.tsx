// رمز نوع الملف — وإجراء الإفلاس بحلقة خضراء بلون لجنة الإفلاس (طلب المدير 2026-10-07: «إجراءات الإفلاس
// ودي يكون صورة الأيقونة موحدة… حواف الأيقونة تكون باللون الأخضر اللي في شعار لجنة الإفلاس»، واختار الحلقة).
// اللون من هوية اللجنة نفسها (bankruptcy.gov.sa): ‎#14A99B. يُستعمل حيث يظهر نوع الملف رمزاً.
import { matterKindEmoji } from '@/lib/matterHref'
import { cn } from '@/lib/utils'

/** فئات الحلقة لصندوق الأيقونة (قائمة النقاشات والمشاريع) — تُضاف لصندوقه القائم */
export const BANKRUPTCY_RING =
  'rounded-full bg-[#E6F6F4] ring-[2.5px] ring-[#14A99B] dark:bg-[#14A99B]/15'

/** الرمز داخل السطر: للإفلاس دائرة صغيرة بحلقة خضراء، ولغيره الإيموجي كما هو */
export function MatterKindIcon({ kind, className }: { kind: string | null | undefined; className?: string }) {
  if (kind === 'bankruptcy') {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded-full bg-[#E6F6F4] align-middle text-[0.8em] leading-none ring-2 ring-[#14A99B] dark:bg-[#14A99B]/15',
          className
        )}
      >
        {matterKindEmoji(kind)}
      </span>
    )
  }
  return (
    <span aria-hidden className={className}>
      {matterKindEmoji(kind)}
    </span>
  )
}
