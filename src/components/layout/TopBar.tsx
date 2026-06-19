import { useLocation } from 'wouter'
import { Menu, Moon, Sun, Search } from 'lucide-react'

import { useTheme } from '@/stores/theme'
import { useAuth } from '@/stores/auth'
import { ROUTE_TITLES } from '@/lib/constants'
import { Button } from '@/components/ui/button'

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [location] = useLocation()
  const { theme, toggle } = useTheme()
  const { teamMember } = useAuth()

  const title = ROUTE_TITLES[location] ?? 'لوحة التحكم'

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur md:px-6">
      {/* يمين: قائمة الجوال + العنوان */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onOpenMenu}
          aria-label="فتح القائمة"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-bold text-foreground">{title}</h1>
      </div>

      {/* وسط: بحث عام (placeholder — يُفعّل لاحقاً) */}
      <div className="hidden flex-1 justify-center md:flex">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            disabled
            placeholder="بحث عام (قريباً)…"
            className="h-9 w-full cursor-not-allowed rounded-md border border-input bg-muted/40 pr-9 text-sm text-muted-foreground placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>

      {/* يسار: الثيم + المستخدم */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label="تبديل الوضع الليلي"
        >
          {theme === 'dark' ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold text-sm font-bold text-navy">
          {teamMember?.avatar_initial || teamMember?.name?.charAt(0) || '؟'}
        </div>
      </div>
    </header>
  )
}
