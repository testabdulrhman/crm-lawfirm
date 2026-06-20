import { useLocation } from 'wouter'
import { Menu, Moon, Sun } from 'lucide-react'

import { useTheme } from '@/stores/theme'
import { useAuth } from '@/stores/auth'
import { ROUTE_TITLES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import { GlobalSearch } from './GlobalSearch'

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [location] = useLocation()
  const { theme, toggle } = useTheme()
  const { teamMember } = useAuth()

  // طابق المسار الدقيق، وإلا أطول بادئة مطابقة (لمسارات التفاصيل مثل /requests/:id)
  const title =
    ROUTE_TITLES[location] ??
    (location.startsWith('/requests') ? ROUTE_TITLES['/requests'] : undefined) ??
    (location.startsWith('/staff-applications')
      ? ROUTE_TITLES['/staff-applications']
      : undefined) ??
    (location.startsWith('/contacts') ? ROUTE_TITLES['/contacts'] : undefined) ??
    (location.startsWith('/cases') ? ROUTE_TITLES['/cases'] : undefined) ??
    (location.startsWith('/poa') ? ROUTE_TITLES['/poa'] : undefined) ??
    (location.startsWith('/legal-services')
      ? ROUTE_TITLES['/legal-services']
      : undefined) ??
    (location.startsWith('/property') ? ROUTE_TITLES['/property'] : undefined) ??
    (location.startsWith('/appointments')
      ? ROUTE_TITLES['/appointments']
      : undefined) ??
    (location.startsWith('/outgoing') ? ROUTE_TITLES['/outgoing'] : undefined) ??
    'لوحة التحكم'

  return (
    <header className="pt-safe pl-safe pr-safe sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b bg-background/95 px-4 backdrop-blur md:px-6">
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
        {/* العنوان يُخفى على الجوال لإفساح مكان للبحث */}
        <h1 className="hidden text-lg font-bold text-foreground sm:block">
          {title}
        </h1>
      </div>

      {/* وسط: البحث العام (فعّال) */}
      <div className="flex flex-1 justify-center">
        <GlobalSearch />
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
