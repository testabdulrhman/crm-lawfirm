import { Construction } from 'lucide-react'

// تبويب قيد الإنشاء — يُملأ في الأجزاء 2–4 من وحدة القضايا.
export function PlaceholderTab({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Construction className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="font-medium text-foreground">{title}</p>
      <p className="text-sm text-muted-foreground">(قيد الإنشاء)</p>
    </div>
  )
}
