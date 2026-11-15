// سطر «نظّف ملفاتك» في الرئيسية — يظهر فقط حين يوجد ما يُحسم، ويختفي حين ينتهي (الدفعة الثانية 2026-11-15)
import { Link } from 'wouter'
import { ChevronLeft, FolderSearch } from 'lucide-react'

import { fmtNumber } from '@/lib/format'
import { useCleanupItems } from '@/hooks/useCleanup'

function filesLabel(n: number): string {
  if (n === 1) return 'ملف واحد يحتاج قراراً'
  if (n === 2) return 'ملفان يحتاجان قراراً'
  if (n >= 3 && n <= 10) return `${fmtNumber(n)} ملفات تحتاج قراراً`
  return `${fmtNumber(n)} ملفاً تحتاج قراراً`
}

export function CleanupBanner() {
  const { data } = useCleanupItems(null)
  const n = (data?.sessions.length ?? 0) + (data?.cases.length ?? 0)
  if (!n) return null
  const sessions = data?.sessions.length ?? 0
  return (
    <Link
      href="/cleanup"
      className="group flex items-center gap-3 rounded-2xl border border-gold/40 bg-gold/5 px-4 py-3 transition-colors hover:bg-gold/10"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gold/15 text-gold">
        <FolderSearch className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">عندك {filesLabel(n)}</span>
        <span className="block text-[13px] text-muted-foreground">
          {sessions > 0 ? `${fmtNumber(sessions)} منها جلسات مضت بلا إغلاق · ` : ''}قرار واحد لكل ملف — ثوانٍ لا أكثر
        </span>
      </span>
      <span className="flex items-center gap-1 text-sm font-semibold text-gold">
        نظّفها
        <ChevronLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
      </span>
    </Link>
  )
}
