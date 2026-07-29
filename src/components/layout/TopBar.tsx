import { useLocation } from 'wouter'
import { Menu, Moon, Sun, Settings, LogOut, Wallet } from 'lucide-react'

import { useTheme } from '@/stores/theme'
import { useAuth } from '@/stores/auth'
import { ROUTE_TITLES } from '@/lib/constants'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/UserAvatar'
import { GlobalSearch } from './GlobalSearch'

export function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const [location, navigate] = useLocation()
  const { theme, toggle } = useTheme()
  const { teamMember, logout } = useAuth()

  // طابق المسار الدقيق، وإلا أطول بادئة مطابقة (لمسارات التفاصيل مثل /requests/:id)
  const title =
    ROUTE_TITLES[location] ??
    (location.startsWith('/requests') ? ROUTE_TITLES['/requests'] : undefined) ??
    (location.startsWith('/staff-applications')
      ? ROUTE_TITLES['/staff-applications']
      : undefined) ??
    (location.startsWith('/contacts') ? ROUTE_TITLES['/contacts'] : undefined) ??
    (location.startsWith('/cases') ? ROUTE_TITLES['/cases'] : undefined) ??
    (location.startsWith('/engagements') ? ROUTE_TITLES['/engagements'] : undefined) ??
    (location.startsWith('/poa') ? ROUTE_TITLES['/poa'] : undefined) ??
    (location.startsWith('/legal-services')
      ? ROUTE_TITLES['/legal-services']
      : undefined) ??
    (location.startsWith('/property') ? ROUTE_TITLES['/property'] : undefined) ??
    (location.startsWith('/appointments')
      ? ROUTE_TITLES['/appointments']
      : undefined) ??
    (location.startsWith('/outgoing') ? ROUTE_TITLES['/outgoing'] : undefined) ??
    (location.startsWith('/team') ? ROUTE_TITLES['/team'] : undefined) ??
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

      {/* يسار: الثيم + قائمة المستخدم */}
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

        <DropdownMenu dir="rtl">
          <DropdownMenuTrigger asChild>
            <button
              aria-label="قائمة المستخدم"
              className="rounded-full transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <UserAvatar member={teamMember} className="h-9 w-9" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-semibold text-foreground">
                {teamMember?.name ?? 'مستخدم'}
              </p>
              {teamMember?.role && (
                <p className="truncate text-xs font-normal text-muted-foreground">
                  {teamMember.role}
                </p>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {teamMember?.id && (
              <DropdownMenuItem
                className="gap-2"
                onClick={() => navigate(`/team/${teamMember.id}`)}
              >
                <Wallet className="h-4 w-4" />
                ملفي الوظيفي
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="gap-2" onClick={() => navigate('/settings')}>
              <Settings className="h-4 w-4" />
              الإعدادات
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
